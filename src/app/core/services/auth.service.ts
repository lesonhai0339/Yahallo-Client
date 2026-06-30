import { HttpBackend, HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, firstValueFrom, forkJoin, Observable, of, switchMap, tap, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { AuthCookie, CreateUserResponseDto, LoginRequest, RegisterRequest, User } from '../models/interfaces';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly base = environment.userApi;

  /**
   * Current user — held IN MEMORY only (loaded via GET /user/getme), never persisted
   * to localStorage. Access/refresh token live in httpOnly cookies set by the server.
   */
  private userSubject = new BehaviorSubject<User | null>(null);
  user$ = this.userSubject.asObservable();

  /** True only right after an explicit logout (cleared on next sign-in). */
  private loggedOut = false;

  /** Back-compat auth state ({ status, isLogout, user }) for header/permission/theme/etc. */
  auth$: Observable<AuthCookie> = this.userSubject.pipe(
    map(u => ({ status: !!u, isLogout: this.loggedOut && !u, user: u })),
  );

  /**
   * HttpClient không qua interceptor — dùng để PUT thẳng lên pre-signed S3 URL.
   * Tránh AuthInterceptor gắn withCredentials (S3 từ chối cookie) và ErrorInterceptor
   * điều hướng sang /server-error khi S3 trả lỗi.
   */
  private readonly s3Http: HttpClient;

  constructor(private http: HttpClient, httpBackend: HttpBackend) {
    this.s3Http = new HttpClient(httpBackend);
  }

  /** Map MeResult / LoginResponse ({ id, avatarUri, name, roles, level }) → User. */
  private mapMe(d: any): User {
    return {
      id: d?.id,
      name: d?.name ?? '',
      email: d?.email ?? '',
      avatar: d?.avatarUri ?? d?.avatar ?? '',
      roles: d?.roles ?? [],
      level: d?.level ?? undefined,
    };
  }

  /**
   * Nạp user hiện tại từ session cookie (GET /user/getme). Cookie httpOnly tự gửi kèm.
   * 401 / lỗi bất kỳ → guest (null), KHÔNG ép đăng nhập.
   */
  loadMe(): Observable<User | null> {
    return this.http.get<any>(`${this.base}/getme`, { withCredentials: true }).pipe(
      map(res => {
        const d = res?.value ?? res;   // MeResult
        return d?.id ? this.mapMe(d) : null;
      }),
      tap(user => { this.userSubject.next(user); if (user) this.loggedOut = false; }),
      catchError(() => { this.userSubject.next(null); return of(null); }),
    );
  }

  /**
   * Bootstrap (APP_INITIALIZER): nạp user từ cookie session. Trả Promise để app đợi
   * xong trước khi render — guards đọc isLoggedIn đúng. 401 → guest, không ép login.
   */
  init(): Promise<void> {
    return firstValueFrom(this.loadMe()).then(() => undefined).catch(() => undefined);
  }

  get currentUser(): User | null {
    return this.userSubject.value;
  }

  get isLoggedIn(): boolean {
    return !!this.userSubject.value;
  }

  /** Merge a patch into the in-memory current user and re-emit (header avatar updates live). */
  private updateCachedUser(patch: Partial<User>): void {
    const current = this.userSubject.value;
    if (!current) return;
    this.userSubject.next({ ...current, ...patch });
  }

  login(username: string, password: string): Observable<any> {
    const payload: LoginRequest = { username, password };
    // Web flow: gửi header X-Client-Type=web → server đặt access/refresh vào cookie
    // httpOnly (Set-Cookie) và trả LoginResponse (cùng shape MeResult, KHÔNG token).
    // Nạp thẳng user từ response vào state in-memory (không lưu localStorage).
    const headers = new HttpHeaders({ 'X-Client-Type': 'web' });
    return this.http.post<any>(`${this.base}/login`, payload, { headers, withCredentials: true }).pipe(
      tap(res => {
        const d = res?.value ?? res;   // LoginResponse
        if (d?.id) {
          this.loggedOut = false;
          this.userSubject.next(this.mapMe(d));
        }
      })
    );
  }

  logout(): Observable<any> {
    // Không còn state ở localStorage; cookie httpOnly client không xóa được (hết hạn ở server).
    const headers = new HttpHeaders({ 'X-Client-Type': 'web' });
    return this.http.post<any>(`${this.base}/logout`,  { headers, withCredentials: true }).pipe(
    tap(res => {
      const d = res?.value ?? res;   // LoginResponse
      if (d) {
        this.loggedOut = true;
        this.userSubject.next(null);
      }
    })
  );
  }

  register(data: RegisterRequest): Observable<CreateUserResponseDto> {
    const formData = new FormData();
    formData.append('FirstName', data.FirstName);
    formData.append('LastName', data.LastName);
    formData.append('Email', data.Email);
    formData.append('PhoneNumber', data.PhoneNumber);
    formData.append('CountryId', data.CountryId);
    formData.append('UserName', data.UserName);
    formData.append('Password', data.Password);
    if (data.Avatar) formData.append('Avatar', data.Avatar, data.Avatar.name);
    if (data.Background) formData.append('Background', data.Background, data.Background.name);

    // Server trả về pre-signed URL; client tự upload file lên S3 sau đó.
    return this.http.post<CreateUserResponseDto>(`${this.base}/create`, formData).pipe(
      switchMap((res: any) => {
        const t = res?.value ?? res;
        const uploads: Observable<unknown>[] = [];
        if (t.avatarUrl && data.Avatar) uploads.push(this.uploadToS3(t.avatarUrl, data.Avatar));
        if (t.backgroundUrl && data.Background) uploads.push(this.uploadToS3(t.backgroundUrl, data.Background));
        if (!uploads.length) return of(t);
        // Tài khoản đã được tạo ở bước POST. Nếu upload S3 lỗi thì KHÔNG coi là
        // đăng ký thất bại — trả về DTO kèm cờ uploadFailed để UI cảnh báo.
        return forkJoin(uploads).pipe(
          map(() => t),
          catchError(() => of({ ...t, uploadFailed: true }))
        );
      })
    );
  }

  // /** PUT file thẳng lên pre-signed S3 URL, bỏ qua mọi interceptor của app. */
  // private uploadToS3(url: string, file: File): Observable<unknown> {
  //   return this.s3Http.put(url, file, {
  //     headers: { 'Content-Type': file.type || 'application/octet-stream' }
  //   });
  // }
    private uploadToS3(url: string, file: File): Observable<unknown> {
    return this.s3Http.put(url, file, {
      headers: { 'Content-Type': file.type || 'application/octet-stream' }
    }).pipe(
      catchError((error: HttpErrorResponse) => {
        console.error('S3 upload failed:', {
          status: error.status,
          statusText: error.statusText,
          message: error.message,
          body: error.error
        });
        return throwError(() => new Error(`Upload thất bại (${error.status}): ${error.statusText}`));
      })
    );
  }
  forgotPassword(email: string): Observable<any> {
    return this.http.post(`${this.base}/forgot-password`, { email });
  }

  changePassword(email: string, oldPassword: string, newPassword: string): Observable<any> {
    return this.http.post(`${this.base}/change-password`, { email, oldpassword: oldPassword, newpassword: newPassword });
  }

  getUserInfo(id: string): Observable<any> {
    return this.http.get(`${this.base}/get-by-id`, { params: { id } });
  }

  updateUser(user: any, avatar?: File): Observable<any> {
    const form = new FormData();
    Object.keys(user).forEach(k => { if (user[k] != null) form.append(k, user[k]); });
    if (avatar) form.append('Avatar', avatar);
    return this.http.put(`${this.base}/update`, form);
  }

  /**
   * Update profile (phone / displayName / avatar / background). The server reply
   * is `UpdateUserResult { id, displayName, uploadAvatarUrl, accessAvatarUrl,
   * updaloadBackgroundUrl, accessBackgroundUrl }`:
   *  - `upload*Url` — pre-signed S3 PUT URL the client uploads the file to.
   *  - `access*Url` — readable URL adopted into the cached current user so the
   *    header avatar / cover refresh immediately.
   * Returns the result DTO (with `uploadFailed` if an S3 upload failed but the
   * profile row was saved). NOTE: `updaloadBackgroundUrl` is misspelled on the
   * backend — we read both spellings so a future fix won't break this.
   */
  updateProfile(
    fields: { id: string; phoneNumber?: string; displayName?: string },
    avatar?: File,
    background?: File,
  ): Observable<any> {
    const form = new FormData();
    form.append('Id', fields.id);
    if (fields.phoneNumber != null) form.append('PhoneNumber', fields.phoneNumber);
    if (fields.displayName != null) form.append('DisplayName', fields.displayName);
    if (avatar) form.append('Avatar', avatar, avatar.name);
    if (background) form.append('Background', background, background.name);

    return this.http.put<any>(`${this.base}/update`, form).pipe(
      switchMap((res: any) => {
        const t = res?.value ?? res;
        const bgUploadUrl = t?.uploadBackgroundUrl ?? t?.updaloadBackgroundUrl ?? null;

        const uploads: Observable<unknown>[] = [];
        if (avatar && t?.uploadAvatarUrl) uploads.push(this.uploadToS3(t.uploadAvatarUrl, avatar));
        if (background && bgUploadUrl) uploads.push(this.uploadToS3(bgUploadUrl, background));

        // The PUT itself persisted the displayName → reflect it regardless of S3.
        if (fields.displayName != null) this.updateCachedUser({ name: fields.displayName });

        if (!uploads.length) return of(t);
        return forkJoin(uploads).pipe(
          map(() => {
            // Uploads succeeded → adopt the readable URLs into the cached user.
            const patch: Partial<User> = {};
            if (avatar && t?.accessAvatarUrl) patch.avatar = t.accessAvatarUrl;
            if (background && t?.accessBackgroundUrl) patch.background = t.accessBackgroundUrl;
            if (Object.keys(patch).length) this.updateCachedUser(patch);
            return t;
          }),
          catchError(() => of({ ...t, uploadFailed: true })),
        );
      })
    );
  }

  checkToken(token: string): Observable<any> {
    return this.http.post(`${this.base}/check-token-expired`, { token });
  }
}
