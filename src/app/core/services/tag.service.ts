import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Tag } from '../models/interfaces';

@Injectable({ providedIn: 'root' })
export class TagService {
  private readonly base = environment.tagApi;

  constructor(private http: HttpClient) {}

  getAll(): Observable<any> {
    return this.http.get(`${this.base}/get-all`);
  }

  filter(params: { name?: string; id?: string; description?: string; page?: number; pageSize?: number }): Observable<any> {
    let hp = new HttpParams()
      .set('PageNumber', params.page ?? 1)
      .set('PageSize', params.pageSize ?? 50);
    if (params.name) hp = hp.set('Name', params.name);
    if (params.id) hp = hp.set('Id', params.id);
    if (params.description) hp = hp.set('Description', params.description);
    return this.http.get(`${this.base}/filter`, { params: hp });
  }

  create(data: { name: string; description?: string }): Observable<any> {
    return this.http.post(`${this.base}/create`, data);
  }

  update(data: { id: string; name?: string; description?: string }): Observable<any> {
    return this.http.put(`${this.base}/update`, data);
  }

  delete(id: string): Observable<any> {
    return this.http.delete(`${this.base}/delete`, { body: { id } });
  }

  addToManga(mangaId: string, tagId: string): Observable<any> {
    return this.http.post(`${environment.mangaTagApi}/add`, { mangaId, tagId });
  }

  removeFromManga(mangaId: string, tagId: string): Observable<any> {
    return this.http.delete(`${environment.mangaTagApi}/remove`, { body: { mangaId, tagId } });
  }
}
