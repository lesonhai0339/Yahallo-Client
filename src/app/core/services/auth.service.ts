import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { CookieService } from 'ngx-cookie-service';
import * as CryptoJS from 'crypto-js';
import { environment } from '../../../environments/environment';
import { AuthCookie, LoginRequest, RegisterRequest, User } from '../models/interfaces';

const JWT_KEY = 'jwt_access';
const RF_KEY = 'jwt_refresh';
const USER = 'user'
const ENCRYPT_KEY = 'yahallo_secret_2024123123@!asda@@####';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly base = environment.userApi;
  private loginState = new BehaviorSubject<AuthCookie>({ status: false, isLogout: false, accessToken: '', refreshToken: '', user : ''});
  auth$ = this.loginState.asObservable();

  constructor(private http: HttpClient, private cookie: CookieService) {}

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
          avatar: data.avatarUri  ?? null
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

  register(data: RegisterRequest): Observable<any> {
    const formData = new FormData();
    formData.append('FirstName', data.FirstName);
    formData.append('LastName', data.LastName);
    formData.append('Email', data.Email);
    formData.append('PhoneNumber', data.PhoneNumber); 
    formData.append('UserName', data.UserName);
    formData.append('Password', data.Password);
    if (data.Avatar) formData.append('Avatar', data.Avatar, data.Avatar.name);
    return this.http.post(`${this.base}/create`, formData);
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

  checkToken(token: string): Observable<any> {
    return this.http.post(`${this.base}/check-token-expired`, { token });
  }
}
