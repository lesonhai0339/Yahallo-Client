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

  getByManga(mangaId: string): Observable<Tag[]> {
    return this.http.get<Tag[]>(`${this.base}/get-by-manga/${mangaId}`);
  }

  filter(name: string, page = 1, pageSize = 20): Observable<any> {
    const params = new HttpParams()
      .set('Name', name)
      .set('PageNumber', page)
      .set('PageSize', pageSize);
    return this.http.get(`${this.base}/filter`, { params });
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
}
