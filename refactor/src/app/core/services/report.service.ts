import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type ReportType = 'Comment' | 'Manga' | 'User' | 'Chapter';

@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly base = environment.apiUrl;

  constructor(private http: HttpClient) {}

  create(data: {
    title: string;
    description: string;
    content: string;
    target: string;
    type: ReportType;
    media?: File[];
  }): Observable<any> {
    const form = new FormData();
    form.append('Title', data.title);
    form.append('Description', data.description);
    form.append('Content', data.content);
    form.append('Target', data.target);
    form.append('Type', data.type);
    if (data.media) {
      data.media.forEach(file => form.append('Media', file));
    }
    return this.http.post(`${this.base}/Create`, form);
  }
}
