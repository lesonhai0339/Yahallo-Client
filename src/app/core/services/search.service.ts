import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

/**
 * Khớp enum `SuggestType` bên backend — chỉ dùng để CHỌN đối tượng lọc khi gửi
 * request. Bất kể type nào, backend đều trả về MANGA (Tag/Author/Artist lọc ra
 * các manga tương ứng). Gửi tên (string) — ASP.NET Core bind enum theo tên.
 */
export enum SuggestType {
  Manga = 'Manga',
  Author = 'Author',
  Artist = 'Artist',
  Tag = 'Tag',
}

/** Kết quả suggest — luôn là 1 manga (id, tên, thumbnail). */
export interface SuggestResult {
  id: string;
  name: string;
  thumbnailUrl?: string | null;
}

@Injectable({ providedIn: 'root' })
export class SearchService {
  private readonly base = environment.serviceApi;

  constructor(private http: HttpClient) {}

  /**
   * Gợi ý tìm kiếm theo tiền tố (startsWith) — auto-search sau khi ngừng gõ. API
   * trả về `PagedResult<SuggestResult>`: tối đa `maxResults` manga + `totalCount`
   * tổng số trùng khớp (để hiện "N kết quả trùng khớp").
   */
  suggest(keyword: string, type: SuggestType, maxResults = 10): Observable<{ data: SuggestResult[]; totalCount: number }> {
    const params = new HttpParams()
      .set('Keyword', keyword)
      .set('Type', type)
      .set('MaxResults', maxResults);
    return this.http.get(`${this.base}/search/suggest`, { params }).pipe(
      map((res: any) => {
        const raw = res?.value ?? res;
        const list: any[] = raw?.data ?? (Array.isArray(raw) ? raw : []);
        const data: SuggestResult[] = list.map(x => ({
          id: x?.id ?? x?.Id ?? '',
          name: x?.name ?? x?.Name ?? '',
          thumbnailUrl: x?.thumbnailUrl ?? x?.ThumbnailUrl ?? null,
        }));
        const totalCount = raw?.totalCount ?? data.length;
        return { data, totalCount };
      })
    );
  }
}
