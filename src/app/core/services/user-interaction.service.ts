import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class UserInteractionService {
  private readonly followBase = environment.followMangaApi;
  private readonly notifBase = environment.notificationApi;

  constructor(private http: HttpClient) {}

  follow(userId: string, mangaId: string): Observable<any> {
    return this.http.post(`${this.followBase}/create`, { userId, mangaId });
  }

  unfollow(userId: string, mangaId: string): Observable<any> {
    return this.http.delete(`${this.followBase}/delete`, { body: { userId, mangaId } });
  }

  getFollowing(userId: string): Observable<any[]> {
    const params = new HttpParams().set('UserId', userId).set('PageSize', 200);
    return this.http.get<any>(`${this.followBase}/filter-follow-manga`, { params }).pipe(
      map((res: any) => res?.data?.items ?? res?.items ?? [])
    );
  }

  isFollowing(userId: string, mangaId: string): Observable<any> {
    const params = new HttpParams().set('UserId', userId).set('MangaId', mangaId).set('PageSize', 1);
    return this.http.get(`${this.followBase}/filter-follow-manga`, { params });
  }

  addView(mangaId: string): Observable<any> {
    return this.http.post(`${environment.serviceApi}/CapNhatView/${mangaId}`, {});
  }

  rate(mangaId: string, star: number): Observable<any> {
    return this.http.post(`${environment.serviceApi}/rating`, { mangaId, star });
  }

  getUserRating(mangaId: string): Observable<number> {
    return this.http.get<any>(`${environment.serviceApi}/rating/${mangaId}`).pipe(
      map((res: any) => {
        const d = res?.value ?? res;
        return d?.star ?? d?.rating ?? 0;
      })
    );
  }

  markNotificationRead(id: string): Observable<any> {
    return this.http.post(`${this.notifBase}/mark-read`, { id });
  }

  getUnreadNotifications(userId: string): Observable<any[]> {
    const params = new HttpParams().set('userId', userId).set('unreadOnly', true);
    return this.http.get<any>(`${this.notifBase}/get`, { params }).pipe(
      map((res: any) => {
        const d = res?.value ?? res;
        const items = d?.data ?? d?.items ?? (Array.isArray(d) ? d : []);
        return Array.isArray(items) ? items : [];
      })
    );
  }
}
