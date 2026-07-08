import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export type TaxonomyType = 'tag' | 'author' | 'artist';

export interface TagItem {
  id: string;
  name: string;
  description?: string | null;
}

export interface PersonItem {
  id: string;
  name: string;
  /** author: CountriesEnum; artist: countryCode — both plain ints here */
  countries?: number;
  countryCode?: number;
  depscription?: string;
  birth?: string;        // ISO date
  lifeStatus?: number;   // 1 = alive, 2 = deceased
}

export interface TaxonomyRequest {
  id: string;
  type: TaxonomyType;
  /** Create-command payload for the chosen type. */
  payload: any;
  requestedBy: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  note?: string;
}

/**
 * Tag / Author / Artist library.
 *
 * Create/edit/delete + listing hit the real backend. The request workflow
 * (mod/trans submit → admin approves) has NO backend yet, so requests are
 * held in-memory here and clearly marked as MOCK. Swap `requests$` for real
 * endpoints (e.g. /taxonomy-request/*) when the API is ready.
 */
@Injectable({ providedIn: 'root' })
export class TaxonomyService {
  private readonly tagBase = environment.tagApi;
  private readonly authorBase = environment.authorApi;
  private readonly artistBase = environment.artistApi;

  // ── MOCK request store ──────────────────────────────────────────────────────
  private readonly requestsSubject = new BehaviorSubject<TaxonomyRequest[]>([]);
  readonly requests$ = this.requestsSubject.asObservable();

  constructor(private http: HttpClient) {}

  // ── Listing ────────────────────────────────────────────────────────────────
  listTags(): Observable<TagItem[]> {
    return this.http.get<any>(`${this.tagBase}/get-all`).pipe(
      map(res => (res?.value ?? res ?? []) as TagItem[])
    );
  }

  listAuthors(): Observable<PersonItem[]> {
    return this.http.get<any>(`${this.authorBase}/get-all`).pipe(
      map(res => (res?.value ?? res ?? []) as PersonItem[])
    );
  }

  listArtists(): Observable<PersonItem[]> {
    return this.http.get<any>(`${this.artistBase}/get-all`).pipe(
      map(res => (res?.value ?? res ?? []) as PersonItem[])
    );
  }

  list(type: TaxonomyType): Observable<(TagItem | PersonItem)[]> {
    if (type === 'tag') return this.listTags();
    if (type === 'author') return this.listAuthors();
    return this.listArtists();
  }

  /** Server-side paginated + searchable listing (scales to thousands). */
  listPaged(
    type: TaxonomyType,
    opts: { page: number; pageSize: number; name?: string }
  ): Observable<{ data: any[]; totalCount: number }> {
    const url =
      type === 'tag' ? `${this.tagBase}/filter`
      : type === 'author' ? `${this.authorBase}/filter-author`
      : `${this.artistBase}/filter-artist`;
    let params = new HttpParams()
      .set('PageNo', opts.page)
      .set('PageSize', opts.pageSize);
    if (opts.name?.trim()) params = params.set('Name', opts.name.trim());
    return this.http.get<any>(url, { params }).pipe(
      map(res => {
        const raw = res?.value ?? res;
        return { data: raw?.data ?? [], totalCount: raw?.totalCount ?? 0 };
      })
    );
  }

  // ── Create ───────────────────────────────────────────────────────────────────
  create(type: TaxonomyType, payload: any): Observable<any> {
    if (type === 'tag') return this.http.post(`${this.tagBase}/create`, payload);
    if (type === 'author') return this.http.post(`${this.authorBase}/create`, payload);
    return this.http.post(`${this.artistBase}/create`, payload);
  }

  // ── Update ───────────────────────────────────────────────────────────────────
  update(type: TaxonomyType, payload: any): Observable<any> {
    if (type === 'tag') return this.http.put(`${this.tagBase}/update`, payload);
    if (type === 'author') return this.http.put(`${this.authorBase}/update`, payload);
    return this.http.put(`${this.artistBase}/update`, payload);
  }

  // ── Delete ───────────────────────────────────────────────────────────────────
  delete(type: TaxonomyType, id: string): Observable<any> {
    const base = type === 'tag' ? this.tagBase : type === 'author' ? this.authorBase : this.artistBase;
    return this.http.request('delete', `${base}/delete`, { body: { id } });
  }

  // ── MOCK request workflow ────────────────────────────────────────────────────
  submitRequest(type: TaxonomyType, payload: any, requestedBy: string): Observable<TaxonomyRequest> {
    const req: TaxonomyRequest = {
      id: this.uuid(),
      type,
      payload,
      requestedBy: requestedBy || 'unknown',
      requestedAt: new Date().toISOString(),
      status: 'pending',
    };
    this.requestsSubject.next([req, ...this.requestsSubject.value]);
    return of(req);
  }

  getRequests(): TaxonomyRequest[] {
    return this.requestsSubject.value;
  }

  /** Approve → create the real entity, then mark the request approved. */
  approveRequest(id: string): Observable<any> {
    const req = this.requestsSubject.value.find(r => r.id === id);
    if (!req) return throwError(() => new Error('Request not found'));
    return this.create(req.type, req.payload).pipe(
      tap(() => this.patchRequest(id, { status: 'approved' }))
    );
  }

  rejectRequest(id: string, note?: string): Observable<TaxonomyRequest | undefined> {
    this.patchRequest(id, { status: 'rejected', note });
    return of(this.requestsSubject.value.find(r => r.id === id));
  }

  private patchRequest(id: string, patch: Partial<TaxonomyRequest>): void {
    this.requestsSubject.next(
      this.requestsSubject.value.map(r => (r.id === id ? { ...r, ...patch } : r))
    );
  }

  private uuid(): string {
    return 'req-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}
