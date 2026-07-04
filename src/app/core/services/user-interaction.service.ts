import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { RatingTarget } from '../models/manga.interface';
import { CacheService, CACHE_TTL } from './cache.service';

@Injectable({ providedIn: 'root' })
export class UserInteractionService {

  private readonly ratingBase = environment.ratingApi;
  private readonly followBase = environment.followMangaApi;
  private readonly notifBase = environment.notificationApi;
  private readonly mangaBase = environment.mangaApi;

  constructor(private http: HttpClient, private cache: CacheService) {}

  /** Xóa cache interaction (mọi manga) sau khi user đổi rating/following. */
  private invalidateInteraction(): void {
    this.cache.invalidate('interaction:');
  }

  /**
   * Trạng thái tương tác của user hiện tại với 1 manga trong MỘT request (gộp
   * rating + following) — thay cho việc gọi riêng getUserRating + isFollowing.
   * Endpoint [Authorize]: khách gọi sẽ 401 (interceptor cho im lặng), nên chỉ gọi
   * khi đã đăng nhập. Server lấy userId từ cookie.
   * Trả: { mangaId, ratingId, rating, following }.
   */
  getInteraction(mangaId: string): Observable<{ mangaId: string; ratingId: string | null; rating: number; following: boolean }> {
    // Cache 10 phút → back từ reading-chapter về manga-detail không gọi lại.
    return this.cache.get(`interaction:${mangaId}`, CACHE_TTL.INTERACTION, () => {
      const params = new HttpParams().set('MangaId', mangaId);
      return this.http.get<any>(`${this.mangaBase}/interaction`, { params }).pipe(
        map((res: any) => {
          const d = res?.value ?? res;   // GetInteractionQueryResult
          return {
            mangaId: d?.mangaId ?? mangaId,
            ratingId: d?.ratingId ?? null,
            rating: d?.rating ?? 0,
            following: !!d?.following,
          };
        })
      );
    });
  }

  follow(userId: string, mangaId: string): Observable<any> {
    return this.http.post(`${this.followBase}/create`, { userId, mangaId })
      .pipe(tap(() => this.invalidateInteraction()));
  }

  unfollow(userId: string, mangaId: string): Observable<any> {
    return this.http.delete(`${this.followBase}/delete`, { body: { userId, mangaId } })
      .pipe(tap(() => this.invalidateInteraction()));
  }

  getFollowing(userId: string, pageNumber = 1, pageSize = 24): Observable<{ items: any[]; totalCount: number }> {
    const params = new HttpParams()
      .set('UserId', userId)
      .set('PageNumber', pageNumber)
      .set('PageSize', pageSize);
    return this.http.get<any>(`${this.followBase}/filter-follow-manga`, { params }).pipe(
      map((res: any) => {
        const d = res?.value ?? res;
        const raw = d?.data ?? [];
        // FollowMangaDto -> shape mà app-manga-sumary-card mong đợi.
        const items = raw.map((f: any) => ({
          ...f,
          id: f.mangaId,
          displayName: f.mangaName,
          mangaThumbnail: f.avatar,
          lastChapterUpdate: f.lastUpdate,
        }));
        return { items, totalCount: d?.totalCount ?? items.length };
      })
    );
  }

  isFollowing(userId: string, mangaId: string): Observable<any> {
    const params = new HttpParams().set('UserId', userId).set('MangaId', mangaId).set('PageSize', 1);
    return this.http.get(`${this.followBase}/filter-follow-manga`, { params });
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
    return this.http.post(`${this.ratingBase}/create`, body)
      .pipe(tap(() => this.invalidateInteraction()));
  }
  reRate(rateId: string, selectedRating: number): Observable<any>
  {
    const body = {
      ratingId: rateId,
      rating: selectedRating
    };
    return this.http.put(`${this.ratingBase}/update`, body)
      .pipe(tap(() => this.invalidateInteraction()));
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
