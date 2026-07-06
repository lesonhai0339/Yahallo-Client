import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import * as signalR from '@microsoft/signalr';
import { environment } from '../../../environments/environment';
import { Notification } from '../models/interfaces';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly base = environment.notificationApi;
  private hubConnection: signalR.HubConnection | null = null;
  private notifications$ = new BehaviorSubject<Notification[]>([]);
  private unreadCount$ = new BehaviorSubject<number>(0);

  /** Ping mỗi 3 phút để server cập nhật LastActive (chỉ khi hub đang kết nối + đã login). */
  private readonly PING_INTERVAL_MS = 3 * 60 * 1000;
  private pingTimer: any = null;

  notifications = this.notifications$.asObservable();
  unreadCount = this.unreadCount$.asObservable();

  constructor(private http: HttpClient, private auth: AuthService) {}

  startHub(): void {
    if (this.hubConnection) return;
    this.hubConnection = new signalR.HubConnectionBuilder()
      // Auth qua cookie httpOnly — gửi kèm khi negotiate (withCredentials), không
      // còn accessTokenFactory vì client không giữ token.
      .withUrl(environment.hubUrl, { withCredentials: true })
      .withAutomaticReconnect()
      .build();

    this.hubConnection.on('ReceiveNotification', (notification: Notification) => {
      const current = this.notifications$.value;
      this.notifications$.next([notification, ...current]);
      this.unreadCount$.next(this.unreadCount$.value + 1);
    });

    this.hubConnection.start()
      .then(() => this.startPing())
      .catch(err => console.error('SignalR error:', err));
  }

  stopHub(): void {
    this.stopPing();
    this.hubConnection?.stop();
    this.hubConnection = null;
  }

  // ── Ping / last-active ────────────────────────────────────────────────────────
  /** Ping ngay khi kết nối rồi lặp lại mỗi 3 phút. */
  private startPing(): void {
    this.stopPing();
    this.ping();
    this.pingTimer = setInterval(() => this.ping(), this.PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
  }

  /** Gọi hub Ping — chỉ khi đã đăng nhập và hub đang Connected. Lỗi không ảnh hưởng UX. */
  private ping(): void {
    if (!this.auth.isLoggedIn) return;
    if (this.hubConnection?.state !== signalR.HubConnectionState.Connected) return;
    this.hubConnection.invoke('Ping').catch(() => {});
  }

  getAll(page = 1, pageSize = 20): Observable<any> {
    return this.http.get(`${this.base}/get?page=${page}&pageSize=${pageSize}`);
  }

  markRead(id: string): Observable<any> {
    return this.http.put(`${this.base}/mark-read/${id}`, {});
  }

  markAllRead(): Observable<any> {
    return this.http.put(`${this.base}/mark-all-read`, {});
  }

  setNotifications(items: Notification[]): void {
    const arr = Array.isArray(items) ? items : [];
    this.notifications$.next(arr);
    this.unreadCount$.next(arr.filter(n => !n.isRead).length);
  }

  decrementUnread(): void {
    const count = Math.max(0, this.unreadCount$.value - 1);
    this.unreadCount$.next(count);
  }
}
