import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import * as signalR from '@microsoft/signalr';
import { environment } from '../../../environments/environment';
import { Notification, NotificationType } from '../models/interfaces';
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
    // Hub Ping không trả về gì (chỉ cập nhật LastActive) → dùng send (fire-and-forget)
    // thay vì invoke, khỏi chờ server xử lý xong. Lỗi transport bỏ qua.
    this.hubConnection.send('Ping').catch(() => {});
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

  /** Đánh dấu mention (kind = 5) đã xem sau khi click. Body: UpdateMentionCommand { Id }. */
  markMentionSeen(id: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/mention/update`, { id });
  }

  setNotifications(items: Notification[]): void {
    const arr = Array.isArray(items) ? items : [];
    this.notifications$.next(arr);
    this.unreadCount$.next(arr.filter(n => !n.seen).length);
  }

  decrementUnread(): void {
    const count = Math.max(0, this.unreadCount$.value - 1);
    this.unreadCount$.next(count);
  }

  /**
   * Đã đọc 1 notification → bỏ khỏi store (store chỉ giữ các thông báo CHƯA đọc)
   * và tính lại unreadCount. Re-emit để header/dropdown cập nhật ngay.
   */
  markSeen(id: string): void {
    const next = this.notifications$.value.filter(n => n.id !== id);
    this.notifications$.next(next);
    this.unreadCount$.next(next.filter(n => !n.seen).length);
  }

  /** Mention (kind = 5) — đánh dấu đã xem qua markMentionSeen() thay vì markRead. */
  isMention(n: Notification): boolean {
    return +n.kind === NotificationType.Mention;
  }

  /**
   * Icon theo `kind` — thay cho ảnh/avatar (notification không tham chiếu trực
   * tiếp object nên không giữ ImageUrl để tránh URL obsolote). Suy từ enum.
   */
  iconFor(n: Notification): string {
    switch (+n.kind) {
      case NotificationType.NewChapter: return 'fa-solid fa-book';
      case NotificationType.NewManga:   return 'fa-solid fa-book-open';
      case NotificationType.Comment:    return 'fa-solid fa-comment';
      case NotificationType.Mention:    return 'fa-solid fa-at';
      case NotificationType.System:
      default:                          return 'fa-solid fa-bell';
    }
  }

  /**
   * Router commands cho đích của 1 notification (null nếu không điều hướng).
   * Điều hướng theo `kind`:
   *  - NewChapter / Comment → manga-reader (mangaId + chapterId) nếu có, else manga-detail
   *  - NewManga            → manga-detail
   *  - Mention             → TẠM manga-detail (sau này deep-link tới comment)
   *  - System              → không điều hướng
   */
  linkFor(n: Notification): any[] | null {
    const mangaId = n.mangaId ?? n.targetId;
    switch (+n.kind) {
      case NotificationType.NewChapter:
      case NotificationType.Comment:
        if (n.mangaId && n.chapterId) return ['/manga', n.mangaId, 'chapter', n.chapterId, '0'];
        return mangaId ? ['/manga', mangaId] : null;
      case NotificationType.NewManga:
        return mangaId ? ['/manga', mangaId] : null;
      case NotificationType.Mention:
        // Deep-link tới comment: điều hướng tới manga-detail, kèm queryParams
        // (rootCommentId + commentId) — xem queryParamsFor().
        return n.mangaId ? ['/manga', n.mangaId] : null;
      case NotificationType.System:
      default:
        return null;
    }
  }

  /**
   * Query params đi kèm khi điều hướng 1 notification (null nếu không có).
   * Mention → { rootCommentId, commentId } để comment-section deep-link tới đúng
   * trang root + trang child chứa comment được mention.
   */
  queryParamsFor(n: Notification): { [k: string]: string } | null {
    if (+n.kind !== NotificationType.Mention) return null;
    if (!n.rootCommentId || !n.commentId) return null;
    return { rootCommentId: n.rootCommentId, commentId: n.commentId };
  }
}
