import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { CookieService } from 'ngx-cookie-service';
import * as CryptoJS from 'crypto-js';
import { environment } from '../../../environments/environment';
import { AuthCookie, LoginRequest, RegisterRequest, User } from '../models/interfaces';

const JWT_KEY = 'yhl_jwt';
const USER_KEY = 'yhl_user';
const ENCRYPT_KEY = 'yahallo_secret_2024';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly base = environment.userApi;
  private loginState = new BehaviorSubject<AuthCookie>({ status: false, isLogout: false, token: '', user: '' });
  auth$ = this.loginState.asObservable();

  constructor(private http: HttpClient, private cookie: CookieService) {}

  init(): void {
    const token = this.cookie.get(JWT_KEY);
    const userRaw = this.cookie.get(USER_KEY);
    if (token && userRaw) {
      try {
        const bytes = CryptoJS.AES.decrypt(userRaw, ENCRYPT_KEY);
        const user = bytes.toString(CryptoJS.enc.Utf8);
        this.loginState.next({ status: true, isLogout: false, token, user });
      } catch {
        this.logout();
      }
    }
  }

  get currentUser(): User | null {
    const state = this.loginState.value;
    if (!state.status || !state.user) return null;
    try { return JSON.parse(state.user); } catch { return null; }
  }

  get isLoggedIn(): boolean {
    return this.loginState.value.status;
  }

  get token(): string {
    return this.loginState.value.token;
  }

  login(username: string, password: string): Observable<any> {
    const payload: LoginRequest = { userName: username, password };
    return this.http.post<any>(`${this.base}/login`, payload).pipe(
      tap(res => {
        const data = res?.data ?? res;
        const token = data?.token ?? data?.accessToken;
        const user = data?.user ?? data;
        if (token) {
          const encryptedUser = CryptoJS.AES.encrypt(JSON.stringify(user), ENCRYPT_KEY).toString();
          this.cookie.set(JWT_KEY, token, { path: '/', secure: true, sameSite: 'Strict' });
          this.cookie.set(USER_KEY, encryptedUser, { path: '/', secure: true, sameSite: 'Strict' });
          this.loginState.next({ status: true, isLogout: false, token, user: JSON.stringify(user) });
        }
      })
    );
  }

  logout(): void {
    this.cookie.delete(JWT_KEY, '/');
    this.cookie.delete(USER_KEY, '/');
    this.loginState.next({ status: false, isLogout: true, token: '', user: '' });
  }

  register(data: RegisterRequest): Observable<any> {
    return this.http.post(`${this.base}/create`, data);
  }

  forgotPassword(email: string): Observable<any> {
    return this.http.post(`${this.base}/forgot-password`, { email });
  }

  changePassword(email: string, oldPassword: string, newPassword: string, id?: string): Observable<any> {
    return this.http.post(`${this.base}/change-password`, { id, email, oldPassword, newPassword });
  }

  getUserInfo(id: string): Observable<any> {
    return this.http.get(`${this.base}/get-by-id`, { params: { id } });
  }

<<<<<<< HEAD:refactor/src/app/core/services/auth.service.ts
  getUserById(id: string): Observable<any> {
    return this.http.get(`${this.base}/get-by-id`, { params: { Id: id } });
=======
  updateUser(user: any, avatar?: File): Observable<any> {
    const form = new FormData();
    Object.keys(user).forEach(k => { if (user[k] != null) form.append(k, user[k]); });
    if (avatar) form.append('Avatar', avatar);
    return this.http.put(`${this.base}/update`, form);
>>>>>>> ec3c891e4b7c756cd4ff03d5e3de118e40de4eb4:src/app/core/services/auth.service.ts
  }

  getUserByName(name: string): Observable<any> {
    return this.http.get(`${this.base}/get-by-name`, { params: { Name: name } });
  }

  filterUsers(filters: { PageNumber?: number; PageSize?: number; Id?: string; Name?: string; Email?: string; Phone?: string }): Observable<any> {
    const params: any = {};
    if (filters.PageNumber) params['PageNumber'] = filters.PageNumber;
    if (filters.PageSize) params['PageSize'] = filters.PageSize;
    if (filters.Id) params['Id'] = filters.Id;
    if (filters.Name) params['Name'] = filters.Name;
    if (filters.Email) params['Email'] = filters.Email;
    if (filters.Phone) params['Phone'] = filters.Phone;
    return this.http.get(`${this.base}/filter-user`, { params });
  }

  updateUser(data: { id: string; displayName?: string; phoneNumber?: string }, avatar?: File): Observable<any> {
    const form = new FormData();
    form.append('Id', data.id);
    if (data.displayName) form.append('DisplayName', data.displayName);
    if (data.phoneNumber) form.append('PhoneNumber', data.phoneNumber);
    if (avatar) form.append('Avatar', avatar);
    return this.http.put(`${this.base}/update`, form);
  }

  checkToken(refreshToken: string): Observable<any> {
    return this.http.post(`${this.base}/check-token-expired`, { refeshtoken: refreshToken });
  }
}
