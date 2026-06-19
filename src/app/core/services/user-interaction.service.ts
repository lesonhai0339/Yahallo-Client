import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { RatingTarget } from '../models/manga.interface';

@Injectable({ providedIn: 'root' })
export class UserInteractionService {

  private readonly ratingBase = environment.ratingApi;
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

  rate(mangaId: string, userId: string, star: number): Observable<any> {
    // Backend CreateRatingCommand is now generic over target type:
    // { TargetId, UserId, RatingTo, Rating }. For a manga rating, RatingTo = Manga.
    const body = {
      TargetId: mangaId,
      UserId: userId,
      RatingTo: RatingTarget.Manga,
      Rating: star
    };
    return this.http.post(`${this.ratingBase}/create`, body);
  }
  reRate(rateId: string, selectedRating: number): Observable<any>
  {
    const body = {
      ratingId: rateId,
      rating: selectedRating
    };
    return this.http.put(`${this.ratingBase}/update`, body);
  }

  getUserRating(mangaId: string): Observable<{ id: string; rating: number }> {
    return this.filterUserRating(1, 20, mangaId).pipe(
      map((res: any) => {
        const item = res?.value?.data?.[0];
        return {
          id: item?.id ?? '',
          rating: item?.rating ?? 0
        };
      })
    );
  }

  filterUserRating(
    pageNo: number = 1,
    pageSize: number = 20,
    mangaId: string = '',
    mangaName: string = '',
    userId: string = '',
    userName: string = '',
    sortBy: number = 0,
    reverse: boolean = false
  ): Observable<any> {
    let params = new HttpParams()
      .set('PageNumber', pageNo)
      .set('PageSize', pageSize)
      .set('MangaId', mangaId)
      .set('MangaName', mangaName)
      .set('UserId', userId)
      .set('UserName', userName)
      .set('SortBy', sortBy)
      .set('ReverseSort', reverse);

    return this.http.get<any>(`${this.ratingBase}/filter`, { params });
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
