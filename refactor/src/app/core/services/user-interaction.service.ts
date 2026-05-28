import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class UserInteractionService {
  private readonly followBase = environment.followApi;
  private readonly commentBase = environment.commentApi;
  private readonly notifBase = environment.notificationApi;
  private readonly servicesBase = environment.serviceApi;

  constructor(private http: HttpClient) {}

  // ── Follow ──────────────────────────────────────────────────────────────────

  follow(userId: string, mangaId: string): Observable<any> {
    return this.http.post(`${this.followBase}/create`, { userId, mangaId });
  }

  unfollow(userId: string, mangaId: string): Observable<any> {
    return this.http.delete(`${this.followBase}/delete`, { body: { userId, mangaId } });
  }

  getFollowing(userId: string, page = 1, pageSize = 50): Observable<any> {
    const params = new HttpParams()
      .set('UserId', userId)
      .set('PageNumber', page)
      .set('PageSize', pageSize);
    return this.http.get(`${this.followBase}/filter-follow-manga`, { params });
  }

  // ── Comments ────────────────────────────────────────────────────────────────

  comment(userId: string, mangaId: string, chapterId: string, message: string): Observable<any> {
    const form = new FormData();
    form.append('UserId', userId);
    form.append('MangaId', mangaId);
    form.append('Message', message);
    form.append('Type', '0');
    if (chapterId) form.append('ChapterId', chapterId);
    return this.http.post(`${this.commentBase}/create`, form);
  }

  getComments(mangaId: string, chapterId: string, page = 1, pageSize = 20): Observable<any> {
    let params = new HttpParams()
      .set('MangaId', mangaId)
      .set('PageNumber', page)
      .set('PageSize', pageSize);
    return this.http.get(`${this.commentBase}/filter-comment`, { params });
  }

  replyComment(parentId: string, userId: string, mangaId: string, text: string): Observable<any> {
    const form = new FormData();
    form.append('UserId', userId);
    form.append('MangaId', mangaId);
    form.append('Message', text);
    form.append('ParentId', parentId);
    form.append('Type', '1');
    return this.http.post(`${this.commentBase}/create`, form);
  }

  getReplies(parentId: string, page = 1, pageSize = 50): Observable<any> {
    const params = new HttpParams()
      .set('PageNumber', page)
      .set('PageSize', pageSize);
    return this.http.get(`${this.commentBase}/filter-comment`, { params });
  }

  likeComment(commentId: string): Observable<any> {
    const form = new FormData();
    form.append('Id', commentId);
    form.append('CanLike', 'true');
    return this.http.put(`${this.commentBase}/update`, form);
  }

  dislikeComment(commentId: string): Observable<any> {
    const form = new FormData();
    form.append('Id', commentId);
    form.append('CanLike', 'false');
    return this.http.put(`${this.commentBase}/update`, form);
  }

  // ── Notifications ──────────────────────────────────────────────────────────

  markNotificationRead(notificationId: string): Observable<any> {
    return this.http.put(`${this.notifBase}/mark-read`, { notificationId });
  }

  getUnreadNotifications(userIdOrPage: string | number = 1, pageSize = 20): Observable<any> {
    const page = typeof userIdOrPage === 'number' ? userIdOrPage : 1;
    const params = new HttpParams()
      .set('PageNumber', page)
      .set('PageSize', pageSize)
      .set('Status', 0);
    return this.http.get(`${this.notifBase}/get`, { params });
  }

  // ── Services (image) ───────────────────────────────────────────────────────

  getImage(filepath: string): string {
    return `${this.servicesBase}/image?filepath=${encodeURIComponent(filepath)}`;
  }

  // ── Stubs (not in new API — kept for component compatibility) ─────────────

  rate(mangaId: string, star: number): Observable<any> {
    return this.http.post(`${environment.apiUrl}/rating`, { mangaId, star });
  }

  addView(mangaId: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/view`, { mangaId });
  }
}
