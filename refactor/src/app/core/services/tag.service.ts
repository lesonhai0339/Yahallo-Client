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

  filter(name: string): Observable<any> {
    const params = new HttpParams().set('name', name);
    return this.http.get(`${this.base}/filter`, { params });
  }
}
