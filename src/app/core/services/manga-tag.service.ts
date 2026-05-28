import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class MangaTagService {
  private readonly base = environment.mangaTagApi;

  constructor(private http: HttpClient) {}

  addTag(mangaId: string, tagId: string): Observable<any> {
    return this.http.post(`${this.base}/add`, { mangaId, tagId });
  }

  removeTag(mangaId: string, tagId: string): Observable<any> {
    return this.http.delete(`${this.base}/remove`, { body: { mangaId, tagId } });
  }
}
