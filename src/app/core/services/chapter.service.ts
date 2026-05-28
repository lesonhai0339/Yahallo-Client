import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ChapterService {
  private readonly base = environment.chapterApi;

  constructor(private http: HttpClient) {}

<<<<<<< HEAD:refactor/src/app/core/services/chapter.service.ts
  getAllPagination(page: number, pageSize: number): Observable<any> {
    const params = new HttpParams()
      .set('PageNumber', page)
      .set('PageSize', pageSize);
    return this.http.get(`${this.base}/get-all-pagination`, { params });
  }

  filter(filters: { PageNumber?: number; PageSize?: number; Id?: string; Index?: number; MangaId?: string; MangaName?: string }): Observable<any> {
    let params = new HttpParams();
    if (filters.PageNumber) params = params.set('PageNumber', filters.PageNumber);
    if (filters.PageSize) params = params.set('PageSize', filters.PageSize);
    if (filters.Id) params = params.set('Id', filters.Id);
    if (filters.Index !== undefined) params = params.set('Index', filters.Index);
    if (filters.MangaId) params = params.set('MangaId', filters.MangaId);
    if (filters.MangaName) params = params.set('MangaName', filters.MangaName);
    return this.http.get(`${this.base}/filter-chapter`, { params });
  }

  create(data: { title: string; index: number; mangaId: string; images?: File[]; imageUrls?: string[] }): Observable<any> {
    const form = new FormData();
    form.append('Title', data.title);
    form.append('Index', String(data.index));
    form.append('MangaId', data.mangaId);
    if (data.images) data.images.forEach(img => form.append('Images', img));
    if (data.imageUrls) data.imageUrls.forEach(url => form.append('ImageUrls', url));
    return this.http.post(`${this.base}/create`, form);
  }

  update(data: { chapterId: string; mangaId: string; title?: string; index?: number; images?: File[]; imageUrls?: string[] }): Observable<any> {
    const form = new FormData();
    form.append('ChapterId', data.chapterId);
    form.append('MangaId', data.mangaId);
    if (data.title) form.append('Title', data.title);
    if (data.index !== undefined) form.append('Index', String(data.index));
    if (data.images) data.images.forEach(img => form.append('Images', img));
    if (data.imageUrls) data.imageUrls.forEach(url => form.append('ImageUrls', url));
    return this.http.put(`${this.base}/update`, form);
  }

  delete(id: string): Observable<any> {
    return this.http.delete(`${this.base}/delete`, { body: { id } });
  }

  restore(id: string): Observable<any> {
    return this.http.post(`${this.base}/restore`, { id });
=======
  filter(params: { id?: string; mangaId?: string; mangaName?: string; index?: number; page?: number; pageSize?: number }): Observable<any> {
    let hp = new HttpParams()
      .set('PageNumber', params.page ?? 1)
      .set('PageSize', params.pageSize ?? 50);
    if (params.id) hp = hp.set('Id', params.id);
    if (params.mangaId) hp = hp.set('MangaId', params.mangaId);
    if (params.mangaName) hp = hp.set('MangaName', params.mangaName);
    if (params.index != null) hp = hp.set('Index', params.index);
    return this.http.get(`${this.base}/filter-chapter`, { params: hp });
  }

  getByManga(mangaId: string, pageSize = 200): Observable<any> {
    return this.filter({ mangaId, pageSize });
  }

  getById(chapterId: string): Observable<any> {
    return this.filter({ id: chapterId, pageSize: 1 });
  }

  getPaginated(page = 1, pageSize = 20): Observable<any> {
    const params = new HttpParams().set('PageNumber', page).set('PageSize', pageSize);
    return this.http.get(`${this.base}/get-all-pagination`, { params });
  }

  create(data: FormData): Observable<any> {
    return this.http.post(`${this.base}/create`, data);
  }

  update(data: FormData): Observable<any> {
    return this.http.put(`${this.base}/update`, data);
  }

  delete(chapterId: string): Observable<any> {
    return this.http.delete(`${this.base}/delete`, { body: { chapterId } });
  }

  restore(chapterId: string): Observable<any> {
    return this.http.post(`${this.base}/restore`, { chapterId });
>>>>>>> ec3c891e4b7c756cd4ff03d5e3de118e40de4eb4:src/app/core/services/chapter.service.ts
  }
}
