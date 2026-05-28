import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class FollowService {
  private readonly base = environment.followApi;

  constructor(private http: HttpClient) {}

  follow(userId: string, mangaId: string): Observable<any> {
    return this.http.post(`${this.base}/create`, { userId, mangaId });
  }

  unfollow(userId: string, mangaId: string): Observable<any> {
    return this.http.delete(`${this.base}/delete`, { body: { userId, mangaId } });
  }

  getAll(): Observable<any> {
    return this.http.get(`${this.base}/get-all`);
  }

  getAllPagination(page: number, pageSize: number): Observable<any> {
    const params = new HttpParams()
      .set('PageNumber', page)
      .set('PageSize', pageSize);
    return this.http.get(`${this.base}/get-all-pagination`, { params });
  }

  filter(filters: { PageNumber?: number; PageSize?: number; UserId?: string; UserName?: string; MangaId?: string; MangaName?: string }): Observable<any> {
    let params = new HttpParams();
    if (filters.PageNumber) params = params.set('PageNumber', filters.PageNumber);
    if (filters.PageSize) params = params.set('PageSize', filters.PageSize);
    if (filters.UserId) params = params.set('UserId', filters.UserId);
    if (filters.UserName) params = params.set('UserName', filters.UserName);
    if (filters.MangaId) params = params.set('MangaId', filters.MangaId);
    if (filters.MangaName) params = params.set('MangaName', filters.MangaName);
    return this.http.get(`${this.base}/filter-follow-manga`, { params });
  }

  restore(userId: string, mangaId: string): Observable<any> {
    return this.http.post(`${this.base}/restore`, { userId, mangaId });
  }

  getFollowedByUser(userId: string, page = 1, pageSize = 20): Observable<any> {
    return this.filter({ UserId: userId, PageNumber: page, PageSize: pageSize });
  }
}
