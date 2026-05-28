import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ReadingProgress } from '../models/interfaces';

@Injectable({ providedIn: 'root' })
export class ReadingProgressService {
  private readonly base = environment.readingProgressApi;

  constructor(private http: HttpClient) {}

  save(progress: Partial<ReadingProgress>): Observable<any> {
    return this.http.post(`${this.base}/save`, progress);
  }

  get(userId: string, mangaId?: string): Observable<ReadingProgress[]> {
    const params: any = { userId };
    if (mangaId) params['mangaId'] = mangaId;
    return this.http.get<ReadingProgress[]>(`${this.base}/get`, { params });
  }

  getForManga(userId: string, mangaId: string): Observable<ReadingProgress | null> {
    return this.http.get<ReadingProgress | null>(`${this.base}/get/${userId}/${mangaId}`);
  }
}
