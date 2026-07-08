import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class FollowMangaService {
  private readonly base = environment.followMangaApi;

  constructor(private http: HttpClient) {}

  follow(userId: string, mangaId: string): Observable<any> {
    return this.http.post(`${this.base}/create`, { userId, mangaId });
  }

  unfollow(userId: string, mangaId: string): Observable<any> {
    return this.http.delete(`${this.base}/delete`, { body: { userId, mangaId } });
  }

  getByUser(userId: string, page = 1, pageSize = 20): Observable<any> {
    const params = new HttpParams()
      .set('UserId', userId)
      .set('PageNo', page)
      .set('PageSize', pageSize);
    return this.http.get(`${this.base}/filter-follow-manga`, { params });
  }

  getByManga(mangaId: string, page = 1, pageSize = 20): Observable<any> {
    const params = new HttpParams()
      .set('MangaId', mangaId)
      .set('PageNo', page)
      .set('PageSize', pageSize);
    return this.http.get(`${this.base}/filter-follow-manga`, { params });
  }

  isFollowing(userId: string, mangaId: string): Observable<boolean> {
    const params = new HttpParams()
      .set('UserId', userId)
      .set('MangaId', mangaId)
      .set('PageSize', 1);
    return this.http.get<any>(`${this.base}/filter-follow-manga`, { params }).pipe(
      map((res: any) => {
        const total = res?.data?.totalCount ?? res?.totalCount ?? 0;
        return total > 0;
      })
    );
  }

  getAll(page = 1, pageSize = 20): Observable<any> {
    const params = new HttpParams().set('PageNo', page).set('PageSize', pageSize);
    return this.http.get(`${this.base}/get-all-pagination`, { params });
  }

  restore(userId: string, mangaId: string): Observable<any> {
    return this.http.post(`${this.base}/restore`, { userId, mangaId });
  }
}
