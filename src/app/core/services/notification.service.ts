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

  notifications = this.notifications$.asObservable();
  unreadCount = this.unreadCount$.asObservable();

  constructor(private http: HttpClient, private auth: AuthService) {}

  startHub(): void {
    if (this.hubConnection) return;
    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(environment.hubUrl, {
        accessTokenFactory: () => this.auth.token
      })
      .withAutomaticReconnect()
      .build();

    this.hubConnection.on('ReceiveNotification', (notification: Notification) => {
      const current = this.notifications$.value;
      this.notifications$.next([notification, ...current]);
      this.unreadCount$.next(this.unreadCount$.value + 1);
    });

    this.hubConnection.start().catch(err => console.error('SignalR error:', err));
  }

  stopHub(): void {
    this.hubConnection?.stop();
    this.hubConnection = null;
  }

  getAll(page = 1, pageSize = 20): Observable<any> {
    return this.http.get(`${this.base}/get?page=${page}&pageSize=${pageSize}`);
  }

  markRead(notificationId: string): Observable<any> {
    return this.http.put(`${this.base}/mark-read`, { notificationId });
  }

  markAllRead(): Observable<any> {
    return this.http.put(`${this.base}/mark-read`, { notificationId: null });
  }

  setNotifications(items: Notification[]): void {
    this.notifications$.next(items);
    this.unreadCount$.next(items.filter(n => !n.isRead).length);
  }

  decrementUnread(): void {
    const count = Math.max(0, this.unreadCount$.value - 1);
    this.unreadCount$.next(count);
  }
}
