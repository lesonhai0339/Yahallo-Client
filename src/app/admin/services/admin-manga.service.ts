import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AdminMangaService {
  private readonly base = environment.mangaApi;
  private readonly authorBase = environment.authorApi;
  private readonly artistBase = environment.artistApi;
  private readonly tagBase = environment.tagApi;
  private readonly chapterBase = environment.chapterApi;
  private readonly imgBase = environment.serviceApi;

  constructor(private http: HttpClient) {}

  imgUrl(path: string): string {
    return `${this.imgBase}/image?filepath=${path}`;
  }

  getAll(page = 1, pageSize = 20): Observable<any> {
    const params = new HttpParams().set('PageNo', page).set('PageSize', pageSize);
    return this.http.get(`${this.base}/get-all-pagination`, { params });
  }

  getDetail(id: string): Observable<any> {
    return this.http.get(`${this.base}/detail`, { params: { Id: id } });
  }

  create(formData: FormData): Observable<any> {
    return this.http.post(`${this.base}/create`, formData);
  }

  update(id: string, formData: FormData): Observable<any> {
    return this.http.put(`${this.base}/update/${id}`, formData);
  }

  delete(id: string): Observable<any> {
    return this.http.delete(`${this.base}/delete/${id}`);
  }

  updateStatus(id: string, status: string): Observable<any> {
    return this.http.put(`${this.base}/update-status`, { id, status });
  }

  getAllAuthors(pageSize = 200): Observable<any> {
    const params = new HttpParams();
    return this.http.get(`${this.authorBase}/get-all`, { params });
  }

  createAuthor(data: FormData): Observable<any> {
    return this.http.post(`${this.authorBase}/create`, data);
  }

  updateAuthor(id: string, data: FormData): Observable<any> {
    return this.http.put(`${this.authorBase}/update/${id}`, data);
  }

  deleteAuthor(id: string): Observable<any> {
    return this.http.delete(`${this.authorBase}/delete/${id}`);
  }

  getAllArtists(pageSize = 200): Observable<any> {
    const params = new HttpParams();
    return this.http.get(`${this.artistBase}/get-all`, { params });
  }

  createArtist(data: FormData): Observable<any> {
    return this.http.post(`${this.artistBase}/create`, data);
  }

  updateArtist(id: string, data: FormData): Observable<any> {
    return this.http.put(`${this.artistBase}/update/${id}`, data);
  }

  deleteArtist(id: string): Observable<any> {
    return this.http.delete(`${this.artistBase}/delete/${id}`);
  }

  getAllTags(): Observable<any> {
    return this.http.get(`${this.tagBase}/get-all`);
  }

  createTag(data: { name: string; description?: string }): Observable<any> {
    return this.http.post(`${this.tagBase}/create`, data);
  }

  deleteTag(id: string): Observable<any> {
    return this.http.delete(`${this.tagBase}/delete/${id}`);
  }

  getChapters(mangaId: string, page = 1, pageSize = 50): Observable<any> {
    const params = new HttpParams()
      .set('MangaId', mangaId)
      .set('PageNo', page)
      .set('PageSize', pageSize);
    return this.http.get(`${this.chapterBase}/filter-chapter`, { params });
  }

  createChapter(formData: FormData): Observable<any> {
    return this.http.post(`${this.chapterBase}/create`, formData);
  }

  updateChapter(formData: FormData): Observable<any> {
    return this.http.put(`${this.chapterBase}/update`, formData);
  }

  deleteChapter(chapterId: string): Observable<any> {
    return this.http.delete(`${this.chapterBase}/delete`, { body: { chapterId } });
  }

  // ── Related / Series linking ──────────────────────────────────────────────

  /**
   * Search manga by parsed prefix query.
   * Prefix format: ref:name:<value> | ref:id:<value> | ref:author:<value> | ref:artist:<value>
   * NOTE: Backend endpoints for author/artist filter are stubs — falls back to name search.
   */
  searchByPrefix(fullQuery: string, pageSize = 10): Observable<any[]> {
    let params = new HttpParams().set('PageNo', 1).set('PageSize', pageSize);

    if (fullQuery.startsWith('ref:id:')) {
      const id = fullQuery.replace('ref:id:', '').trim();
      return this.http.get<any>(`${this.base}/detail`, { params: { Id: id } }).pipe(
        map((res: any) => {
          const item = res?.value ?? res;
          return item?.id ? [item] : [];
        }),
        catchError(() => of([]))
      );
    }

    if (fullQuery.startsWith('ref:name:')) {
      params = params.set('name', fullQuery.replace('ref:name:', '').trim());
    } else if (fullQuery.startsWith('ref:author:')) {
      params = params.set('authorName', fullQuery.replace('ref:author:', '').trim());
    } else if (fullQuery.startsWith('ref:artist:')) {
      params = params.set('artistName', fullQuery.replace('ref:artist:', '').trim());
    } else {
      params = params.set('name', fullQuery.trim());
    }

    return this.http.get<any>(`${this.base}/filter-manga`, { params }).pipe(
      map((res: any) => {
        const d = res?.value ?? res;
        return d?.data ?? d?.items ?? [];
      }),
      catchError(() => of([]))
    );
  }

  /**
   * Create a series/season link between mangas.
   * NOTE: Mock endpoint — implement when backend is ready.
   */
  linkSeries(sourceId: string, targetIds: string[]): Observable<any> {
    return this.http.post(`${this.base}/link-series`, { sourceId, targetIds });
  }
}
