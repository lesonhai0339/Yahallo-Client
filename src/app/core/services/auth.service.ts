import { HttpBackend, HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, forkJoin, Observable, of, switchMap, tap, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { CookieService } from 'ngx-cookie-service';
import * as CryptoJS from 'crypto-js';
import { environment } from '../../../environments/environment';
import { AuthCookie, CreateUserResponseDto, LoginRequest, RegisterRequest, User } from '../models/interfaces';

const JWT_KEY = 'jwt_access';
const RF_KEY = 'jwt_refresh';
const USER = 'user'
const ENCRYPT_KEY = 'yahallo_secret_2024123123@!asda@@####';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly base = environment.userApi;
  private loginState = new BehaviorSubject<AuthCookie>({ status: false, isLogout: false, accessToken: '', refreshToken: '', user : ''});
  auth$ = this.loginState.asObservable();

  /**
   * HttpClient không qua interceptor — dùng để PUT thẳng lên pre-signed S3 URL.
   * Tránh AuthInterceptor gắn Authorization (S3 sẽ từ chối) và ErrorInterceptor
   * điều hướng sang /server-error khi S3 trả lỗi.
   */
  private readonly s3Http: HttpClient;

  constructor(private http: HttpClient, private cookie: CookieService, httpBackend: HttpBackend) {
    this.s3Http = new HttpClient(httpBackend);
  }

  init(): void {
    const accessToken = this.cookie.get(JWT_KEY);
    const refreshToken = this.cookie.get(RF_KEY);
    const user = localStorage.getItem(USER);
    if (accessToken && refreshToken && user) {
      try {
        this.loginState.next({ status: true, isLogout: false, accessToken: accessToken, refreshToken: refreshToken, user :  user });
      } catch {
        this.logout();
      }
    }
  }
  getAccessToken(): string {
    return this.loginState.value.accessToken;
  }
  get currentUser(): User | null {
    const state = this.loginState.value;
    if (!state.status || !state.user) return null;
    const bytes = CryptoJS.AES.decrypt(state.user, ENCRYPT_KEY);
    const user = bytes.toString(CryptoJS.enc.Utf8);
    try { 
      return JSON.parse(user); 
    } 
    catch { 
      return null; 
    }
  }

  get isLoggedIn(): boolean {
    return this.loginState.value.status;
  }

  get token(): string {
    return this.loginState.value.accessToken;
  }

  login(username: string, password: string): Observable<any> {
    const payload: LoginRequest = { username, password };
    return this.http.post<any>(`${this.base}/login`, payload).pipe(
      tap(res => {
        const data = res?.value  ?? res;
        const accessToken = data.accessToken;
        const refreshToken = data.refreshToken;
        const user = {
          id: data.id,
          name: data.name,
          avatar: data.avatarUri  ?? null,
          roles: data.roles ?? [],
          level: data.level ?? null
        }
        if (accessToken) {
          const encryptedUser = CryptoJS.AES.encrypt(JSON.stringify(user), ENCRYPT_KEY).toString();
          this.cookie.set(JWT_KEY, accessToken, { path: '/', secure: true, sameSite: 'Strict' });
          this.cookie.set(RF_KEY, refreshToken, { path: '/', secure: true, sameSite: 'Strict' });
          localStorage.setItem(USER, encryptedUser);
          this.loginState.next({ status: true, isLogout: false, accessToken, refreshToken, user: encryptedUser });
        }
      })
    );
  }

  logout(): void {
    this.cookie.delete(JWT_KEY, '/');
    this.cookie.delete(RF_KEY, '/');
    localStorage.removeItem(USER);
    this.loginState.next({ status: false, isLogout: true, accessToken: '', refreshToken: '', user: '' });
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
   * Update profile (phone / avatar / background). Same flow as register: send
   * metadata + files, server replies with pre-signed S3 URLs, then the client
   * PUTs each file straight to S3. Returns the update DTO (with `uploadFailed`
   * if an S3 upload failed but the profile row was saved).
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
        const uploads: Observable<unknown>[] = [];
        if (t?.avatarUrl && avatar) uploads.push(this.uploadToS3(t.avatarUrl, avatar));
        if (t?.backgroundUrl && background) uploads.push(this.uploadToS3(t.backgroundUrl, background));
        if (!uploads.length) return of(t);
        return forkJoin(uploads).pipe(
          map(() => t),
          catchError(() => of({ ...t, uploadFailed: true })),
        );
      })
    );
  }

  checkToken(token: string): Observable<any> {
    return this.http.post(`${this.base}/check-token-expired`, { token });
  }
}
