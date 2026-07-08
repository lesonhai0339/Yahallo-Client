import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ChapterService {
  private readonly base = environment.chapterApi;

  constructor(private http: HttpClient) {}

  filter(params: { id?: string; mangaId?: string; mangaName?: string; index?: number; page?: number; pageSize?: number }): Observable<any> {
    let hp = new HttpParams()
      .set('PageNo', params.page ?? 1)
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
    const params = new HttpParams().set('PageNo', page).set('PageSize', pageSize);
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
  }
}
