import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

/**
 * Dữ liệu tạo/sửa một chương — mirror `CreateChapterCommand` của backend.
 * Chương 10.5 = `index: 10`, `subIndex: 5`. `title` là MÔ TẢ, không bắt buộc.
 */
export interface ChapterPayload {
  mangaId: string;
  index: number;
  subIndex: number;
  title?: string | null;
  /** Chỉ có khi cập nhật. */
  chapterId?: string;
}

/** Mirror enum `DisplayMode` của backend — quyết định truyện có hiện với người đọc không. */
export enum DisplayMode {
  Hidden = 'Hidden',
  Visible = 'Visible',
  Disabled = 'Disabled',
}

/**
 * Tham số của `GET manga/admin/filter` — mirror `AdminFilterMangaQuery`.
 * Field nào bỏ trống thì không gửi lên, để backend hiểu là "không lọc theo tiêu
 * chí này" (gửi chuỗi rỗng sẽ bị bind thành giá trị thật và lọc sai).
 */
export interface AdminMangaFilter {
  pageNo?: number;
  pageSize?: number;
  name?: string | null;
  mangaId?: string | null;
  tagIds?: string[] | null;
  authorId?: string | null;
  artistId?: string | null;
  level?: string | number | null;
  status?: string | number | null;
  displayMode?: DisplayMode | string | null;
  type?: string | number | null;
  countries?: string | number | null;
  /** Lọc theo chủ sở hữu — backend đã thay `UserId` bằng `Owner`. */
  ownerId?: string | null;
  date?: string | null;
  timeZone?: string | null;
  sortBy?: string | null;
  reverseSort?: boolean;
  isDeleted?: boolean;
}

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

  /**
   * Chức năng: Liệt kê thuần truyện cho trang quản trị, KHÔNG có tham số sắp xếp
   *   / lọc. Danh sách chính không dùng hàm này nữa (nó cần sắp theo lần cập nhật
   *   gần nhất, mà chỉ `admin/filter` mới nhận `SortBy`) — giữ lại cho các chỗ
   *   chỉ cần đếm hoặc lấy nhanh một trang.
   * Yêu cầu: `page` 1-based, `pageSize` > 0; tài khoản phải có policy Admin.
   * Kết quả trả về: Observable emit response thô (`{ value: PagedResult<AdminMangaDto> }`).
   * Exception: không bắt lỗi — 401/403 để interceptor xử lý.
   */
  getAll(page = 1, pageSize = 20): Observable<any> {
    const params = new HttpParams().set('PageNo', page).set('PageSize', pageSize);
    return this.http.get(`${this.base}/admin/get-all-pagination`, { params });
  }

  /**
   * Chức năng: Lọc/tìm truyện cho trang quản trị (`AdminFilterMangaQuery`).
   *   `AdminMangaDto` trả về đã gồm cả description / tags / authors / artists nên
   *   endpoint này thay luôn cho `manga/detail` cũ.
   * Yêu cầu: `f` — các tiêu chí; field null/undefined/'' được BỎ QUA, không gửi
   *   lên (gửi rỗng thì model binder bind thành giá trị thật và lọc sai).
   *   `tagIds` là mảng, backend nhận chuỗi nối bằng dấu phẩy.
   * Kết quả trả về: Observable emit response thô (`{ value: PagedResult<AdminMangaDto> }`).
   * Exception: không bắt lỗi — caller tự xử lý.
   */
  filter(f: AdminMangaFilter): Observable<any> {
    let params = new HttpParams()
      .set('PageNo', f.pageNo ?? 1)
      .set('PageSize', f.pageSize ?? 20);

    const set = (key: string, value: unknown) => {
      if (value === null || value === undefined || value === '') return;
      params = params.set(key, String(value));
    };

    set('Name', f.name);
    set('MangaId', f.mangaId);
    set('TagIds', f.tagIds?.length ? f.tagIds.join(',') : null);
    set('AuthorId', f.authorId);
    set('ArtistId', f.artistId);
    set('Level', f.level);
    set('Status', f.status);
    set('DisplayMode', f.displayMode);
    set('Type', f.type);
    set('Countries', f.countries);
    set('OwnerId', f.ownerId);
    set('Date', f.date);
    set('TimeZone', f.timeZone);
    set('SortBy', f.sortBy);
    // Hai cờ bool: luôn gửi để lần lọc sau ghi đè được lần trước.
    params = params.set('ReverseSort', f.reverseSort ?? true);
    params = params.set('IsDeleted', f.isDeleted ?? false);

    return this.http.get(`${this.base}/admin/filter`, { params });
  }

  /**
   * Chức năng: Lấy chi tiết một truyện — dùng chính `admin/filter` lọc theo
   *   `MangaId` vì `AdminMangaDto` đã đủ field, backend không còn `manga/detail`
   *   cho phía admin.
   * Yêu cầu: `id` — id truyện.
   * Kết quả trả về: Observable emit đúng một `AdminMangaDto`, hoặc null nếu không
   *   tìm thấy.
   * Exception: không bắt lỗi — caller tự xử lý.
   */
  getDetail(id: string): Observable<any> {
    return this.filter({ mangaId: id, pageNo: 1, pageSize: 1 }).pipe(
      map((res: any) => {
        const d = res?.value ?? res;
        return (d?.data ?? d?.items ?? [])[0] ?? null;
      }),
    );
  }

  create(formData: FormData): Observable<any> {
    return this.http.post(`${this.base}/create`, formData);
  }

  /**
   * Chức năng: Cập nhật truyện. Route là `manga/update` với `Id` NẰM TRONG form
   *   (`UpdateMangaCommand`), không phải `/update/{id}` — backend không có route
   *   nào nhận id trên path.
   * Yêu cầu: `id` — id truyện; `formData` — các field muốn đổi (multipart, vì
   *   backend nhận `[FromForm]`). Hàm tự thêm `Id` nếu form chưa có.
   * Kết quả trả về: Observable emit response `UpdateMangaResponseDto`.
   * Exception: không bắt lỗi — caller tự xử lý.
   */
  update(id: string, formData: FormData): Observable<any> {
    if (!formData.has('Id')) formData.append('Id', id);
    return this.http.put(`${this.base}/update`, formData);
  }

  delete(id: string): Observable<any> {
    return this.http.delete(`${this.base}/delete/${id}`);
  }

  /**
   * Chức năng: Đổi chế độ hiển thị của một truyện (ẩn / hiện / khoá) — dùng chung
   *   endpoint `manga/update`, chỉ gửi đúng field cần đổi.
   * Yêu cầu: `manga` — dòng đang thao tác, cần có `id`; `mode` — chế độ đích.
   *   Chỉ gửi đúng 2 field: các field khác của `UpdateMangaCommand` đều nullable
   *   nên bỏ trống là "không đổi".
   * Kết quả trả về: Observable emit response của `manga/update`.
   * Exception: không bắt lỗi — caller tự xử lý.
   */
  updateDisplayMode(manga: { id: string }, mode: DisplayMode): Observable<any> {
    const fd = new FormData();
    fd.append('Id', manga.id);
    fd.append('DisplayMode', mode);
    return this.http.put(`${this.base}/update`, fd);
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

  /**
   * Chức năng: Dựng FormData cho `CreateChapterCommand` / update. Backend nhận
   *   `[FromForm]` nên phải là multipart, không phải JSON.
   * Yêu cầu: `p.index` là số chương (nguyên); `p.subIndex` là chương phụ — chương
   *   10.5 gửi `Index = 10`, `SubIndex = 5`; `title` là MÔ TẢ, được phép rỗng.
   * Kết quả trả về: FormData đã đủ field.
   * Exception: không ném.
   */
  private chapterForm(p: ChapterPayload): FormData {
    const fd = new FormData();
    fd.append('MangaId', p.mangaId);
    fd.append('Index', String(p.index));
    fd.append('SubIndex', String(p.subIndex ?? 0));
    // Chương không có mô tả thì bỏ hẳn field, đừng gửi chuỗi rỗng.
    if (p.title?.trim()) fd.append('Title', p.title.trim());
    if (p.chapterId) fd.append('ChapterId', p.chapterId);
    return fd;
  }

  /**
   * Chức năng: Tạo chương mới (`POST /chapter/create`).
   * Yêu cầu: `p.mangaId` hợp lệ; `p.index` ≥ 0.
   * Kết quả trả về: Observable emit **chapterId** — server trả `JsonResponse<string>`
   *   nên `value` là chuỗi id; vẫn đỡ trường hợp trả object có `id`.
   * Exception: emit lỗi HTTP để người gọi báo người dùng.
   */
  createChapter(p: ChapterPayload): Observable<string> {
    return this.http.post<any>(`${this.chapterBase}/create`, this.chapterForm(p)).pipe(
      map(res => {
        const v = res?.value ?? res;
        return (typeof v === 'string' ? v : v?.id ?? v?.chapterId ?? '') as string;
      }),
    );
  }

  /** Cập nhật thông tin chương (`PUT /chapter/update`). */
  updateChapter(p: ChapterPayload): Observable<any> {
    return this.http.put(`${this.chapterBase}/update`, this.chapterForm(p));
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
