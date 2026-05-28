import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MangaFilterParams } from '../models/interfaces';

@Injectable({ providedIn: 'root' })
export class MangaService {
  private readonly base = environment.mangaApi;
  private readonly chapterBase = environment.chapterApi;
  private readonly commentBase = environment.commentApi;
  private readonly tagBase = environment.tagApi;

  constructor(private http: HttpClient) {}

  // ── Browse ──────────────────────────────────────────────────────────────────

  getAll(page: number, pageSize = 20): Observable<any> {
    const params = new HttpParams()
      .set('PageNumber', page)
      .set('PageSize', pageSize);
    return this.http.get(`${this.base}/get-all-pagination`, { params });
  }

  getTrending(take = 10, daysWindow = 7): Observable<any> {
    const params = new HttpParams()
      .set('DaysWindow', daysWindow)
      .set('Take', take);
    return this.http.get(`${this.base}/trending`, { params });
  }

  getLatestUpdated(page = 1, pageSize = 20): Observable<any> {
    const params = new HttpParams()
      .set('PageNumber', page)
      .set('PageSize', pageSize);
    return this.http.get(`${this.base}/latest-updated`, { params });
  }

  getDetail(mangaId: string): Observable<any> {
    return this.http.get(`${this.base}/detail/${mangaId}`);
  }

  getDetailAggregated(mangaId: string): Observable<any> {
    return this.http.get(`${this.base}/detail/${mangaId}`);
  }

  filter(filters: MangaFilterParams): Observable<any> {
    let params = new HttpParams();
    if (filters.PageNumber) params = params.set('PageNumber', filters.PageNumber);
    if (filters.PageSize) params = params.set('PageSize', filters.PageSize);
    if (filters.Id) params = params.set('Id', filters.Id);
    if (filters.Name) params = params.set('Name', filters.Name);
    if (filters.Level) params = params.set('Level', filters.Level);
    if (filters.Status) params = params.set('Status', filters.Status);
    if (filters.Type) params = params.set('Type', filters.Type);
    if (filters.Countries) params = params.set('Countries', filters.Countries);
    if (filters.Season !== undefined) params = params.set('Season', filters.Season);
    if (filters.UserId) params = params.set('UserId', filters.UserId);
    if (filters.DateUpdate) params = params.set('DateUpdate', filters.DateUpdate);
    return this.http.get(`${this.base}/filter-manga`, { params });
  }

  search(query: string, page = 1, pageSize = 20): Observable<any> {
    return this.filter({ Name: query, PageNumber: page, PageSize: pageSize });
  }

  getByType(type: string, page = 1, pageSize = 20): Observable<any> {
    return this.filter({ Type: type, PageNumber: page, PageSize: pageSize });
  }

  getCategories(): Observable<any> {
    return this.http.get(`${this.tagBase}/get-all`);
  }

  // ── Chapters ────────────────────────────────────────────────────────────────

  getChapters(mangaId: string): Observable<any> {
    const params = new HttpParams()
      .set('MangaId', mangaId)
      .set('PageSize', 1000);
    return this.http.get(`${this.chapterBase}/filter-chapter`, { params });
  }

  getChapterImages(mangaIdOrChapterId: string, chapterId?: string): Observable<any> {
    const id = chapterId ?? mangaIdOrChapterId;
    const params = new HttpParams().set('Id', id);
    return this.http.get(`${this.chapterBase}/filter-chapter`, { params });
  }

  getByCategories(categoryIds: string[], page = 1, pageSize = 20): Observable<any> {
    return this.filter({ PageNumber: page, PageSize: pageSize });
  }

  // ── Comments ────────────────────────────────────────────────────────────────

  getComments(mangaId: string, pageSize: number, page: number): Observable<any> {
    const params = new HttpParams()
      .set('MangaId', mangaId)
      .set('PageNumber', page)
      .set('PageSize', pageSize);
    return this.http.get(`${this.commentBase}/filter-comment`, { params });
  }

  // ── CRUD ────────────────────────────────────────────────────────────────────

  createManga(data: { name: string; description?: string; level?: string; status?: string; type?: string; countries?: string; season?: number; thumbnail?: File; mangaSeasonId?: string }): Observable<any> {
    const form = new FormData();
    form.append('Name', data.name);
    if (data.description) form.append('Description', data.description);
    if (data.level) form.append('Level', data.level);
    if (data.status) form.append('Status', data.status);
    if (data.type) form.append('Type', data.type);
    if (data.countries) form.append('Countries', data.countries);
    if (data.season !== undefined) form.append('Season', String(data.season));
    if (data.thumbnail) form.append('Thumbnail', data.thumbnail);
    if (data.mangaSeasonId) form.append('MangaSeasonId', data.mangaSeasonId);
    return this.http.post(`${this.base}/create`, form);
  }

  updateManga(data: { id: string; name?: string; description?: string; level?: string; status?: string; type?: string; countries?: string; season?: number; thumbnail?: File }): Observable<any> {
    const form = new FormData();
    form.append('Id', data.id);
    if (data.name) form.append('Name', data.name);
    if (data.description) form.append('Description', data.description);
    if (data.level) form.append('Level', data.level);
    if (data.status) form.append('Status', data.status);
    if (data.type) form.append('Type', data.type);
    if (data.countries) form.append('Countries', data.countries);
    if (data.season !== undefined) form.append('Season', String(data.season));
    if (data.thumbnail) form.append('Thumbnail', data.thumbnail);
    return this.http.put(`${this.base}/update`, form);
  }

  deleteManga(id: string): Observable<any> {
    return this.http.delete(`${this.base}/delete`, { body: { id } });
  }

  restoreManga(id: string): Observable<any> {
    return this.http.post(`${this.base}/restore`, { id });
  }

  getAllPagination(page: number, pageSize: number): Observable<any> {
    return this.getAll(page, pageSize);
  }

  // ── Legacy aliases (kept for backward compat with existing components) ──────

  getTopManga(): Observable<any> {
    return this.getTrending(10);
  }

  getPageCount(): Observable<any> {
    return this.getAll(1, 1);
  }
}
