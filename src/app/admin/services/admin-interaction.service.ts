import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Mirror `AdminFollowDto`. KHÔNG còn `lastUpdate` — backend đã tách thành 3 mốc. */
export interface AdminFollow {
  userId: string;
  mangaId: string;
  userName?: string | null;
  userAvatar?: string | null;
  mangaName?: string | null;
  mangaThumbnail?: string | null;
  mangaBackground?: string | null;
  createDate?: string | null;
  updateDate?: string | null;
  deleteDate?: string | null;
}

/** Mirror `AdminCommentDto` — chỉ giữ field khu quản trị thực sự hiển thị. */
export interface AdminComment {
  id: string;
  userId?: string | null;
  mangaId?: string | null;
  mangaName?: string | null;
  chapterId?: string | null;
  chapterIndex?: number | null;
  chapterName?: string | null;
  parentId?: string | null;
  message?: string | null;
  dateTime?: string | null;
  like?: number;
  dislike?: number;
  isDeleted?: boolean;
  displayName?: string | null;
  avatar?: string | null;
  replyCount?: number;
  createDate?: string | null;
  deleteDate?: string | null;
}

export interface PagedResult<T> {
  data: T[];
  totalCount: number;
}

/**
 * Truy vấn tương tác (theo dõi / bình luận) cho khu quản trị.
 *
 * Tách khỏi `AdminMangaService` vì đây là dữ liệu về NGƯỜI DÙNG quanh một truyện,
 * không phải thuộc tính của truyện — và cùng hai endpoint này còn dùng được cho
 * trang hồ sơ người dùng (lọc theo `userId` thay vì `mangaId`).
 */
@Injectable({ providedIn: 'root' })
export class AdminInteractionService {
  private readonly followBase = environment.followMangaApi;
  private readonly commentBase = environment.commentApi;

  constructor(private http: HttpClient) {}

  /**
   * Chức năng: Danh sách lượt theo dõi, lọc theo truyện hoặc theo người dùng.
   * Yêu cầu: nên truyền `mangaId` HOẶC `userId` — không có cả hai thì backend
   *   trả lượt theo dõi của toàn site.
   * Kết quả trả về: Observable phát `{ data, totalCount }` đã bóc lớp `value`.
   * Exception: không bắt — để tầng gọi xử lý.
   */
  getFollows(q: {
    mangaId?: string | null;
    userId?: string | null;
    from?: string | null;
    to?: string | null;
    sortBy?: string | null;
    reverseSort?: boolean;
    isDeleted?: boolean;
    pageNo?: number;
    pageSize?: number;
  }): Observable<PagedResult<AdminFollow>> {
    return this.http
      .get(`${this.followBase}/admin/filter`, { params: this.buildParams(q) })
      .pipe(this.unwrap<AdminFollow>());
  }

  /**
   * Chức năng: Danh sách bình luận, lọc theo truyện / chương / người dùng.
   * Yêu cầu: như `getFollows` — không có bộ lọc nào thì trả bình luận toàn site.
   * Kết quả trả về: Observable phát `{ data, totalCount }`.
   * Exception: không bắt — để tầng gọi xử lý.
   */
  getComments(q: {
    id?: string | null;
    userId?: string | null;
    mangaId?: string | null;
    chapterId?: string | null;
    parentId?: string | null;
    from?: string | null;
    to?: string | null;
    sortBy?: string | null;
    reverseSort?: boolean;
    isDeleted?: boolean;
    pageNo?: number;
    pageSize?: number;
  }): Observable<PagedResult<AdminComment>> {
    return this.http
      .get(`${this.commentBase}/admin/filter`, { params: this.buildParams(q) })
      .pipe(this.unwrap<AdminComment>());
  }

  /**
   * Chức năng: Dựng query string — bỏ qua field rỗng, riêng hai cờ bool thì luôn
   *   gửi để lần lọc sau ghi đè được lần trước.
   * Yêu cầu: khoá của `q` trùng tên tham số backend, chỉ khác chữ hoa đầu.
   * Kết quả trả về: `HttpParams` đã đủ field.
   * Exception: không ném.
   */
  private buildParams(q: Record<string, any>): HttpParams {
    let params = new HttpParams()
      .set('PageNo', q['pageNo'] ?? 1)
      .set('PageSize', q['pageSize'] ?? 20)
      .set('ReverseSort', q['reverseSort'] ?? false)
      .set('IsDeleted', q['isDeleted'] ?? false);

    for (const key of ['id', 'userId', 'mangaId', 'chapterId', 'parentId', 'from', 'to', 'sortBy']) {
      const v = q[key];
      if (v === null || v === undefined || v === '') continue;
      params = params.set(key.charAt(0).toUpperCase() + key.slice(1), String(v));
    }
    return params;
  }

  /** Bóc lớp `value` của response và chuẩn hoá về `{ data, totalCount }`. */
  private unwrap<T>() {
    return (source: Observable<any>): Observable<PagedResult<T>> =>
      new Observable<PagedResult<T>>(sub => source.subscribe({
        next: (res: any) => {
          const raw = res?.value ?? res;
          const data = (raw?.data ?? raw?.items ?? []) as T[];
          sub.next({ data, totalCount: raw?.totalCount ?? data.length });
        },
        error: e => sub.error(e),
        complete: () => sub.complete(),
      }));
  }
}
