import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

/**
 * ⚠️ MODULE MỚI THÊM — xem `docs/ADMIN_MODULES_ADDED.md` để biết cách remove.
 *
 * Service cho 2 trang admin mới: kiểm duyệt bình luận (`/admin/comments`) và
 * thùng rác / phục hồi (`/admin/trash`).
 */

/** User rút gọn (backend: AdminUserDto) — người được trả lời tới. */
export interface AdminCommentUser {
  id?: string;
  displayName?: string;
  avatar?: string | null;
  email?: string;
}

/**
 * Khớp 1-1 với `AdminCommentDto` phía backend (camelCase khi qua JSON).
 * Giữ nguyên tên field của DTO để dễ đối chiếu, KHÔNG đổi tên tuỳ ý.
 */
export interface AdminComment {
  id: string;
  userId: string | null;
  mangaId: string | null;
  mangaName: string | null;
  chapterId: string | null;
  chapterIndex: number | null;
  chapterName: string | null;
  parentId: string | null;
  blogId: string | null;
  replyToCommentId: string | null;
  message: string;
  dateTime: string | null;
  like: number;
  dislike: number;
  isDeleted: boolean;
  displayName: string;
  avatar: string | null;
  replyCount: number;
  userCommentTo: AdminCommentUser | null;
  createDate: string | null;
  deleteDate: string | null;
  idUserDeleted: string | null;
}

export type TrashKind = 'manga' | 'chapter' | 'comment' | 'author' | 'artist';

export interface TrashItem {
  id: string;
  kind: TrashKind;
  name: string;
  /** Mô tả phụ (vd tên truyện của chương, đoạn đầu nội dung comment). */
  note?: string;
  deletedAt?: string;
}

export interface PagedList<T> {
  data: T[];
  totalCount: number;
}

@Injectable({ providedIn: 'root' })
export class AdminModerationService {
  private readonly commentBase = environment.commentApi;
  private readonly mangaBase = environment.mangaApi;
  private readonly chapterBase = environment.chapterApi;
  private readonly authorBase = environment.authorApi;
  private readonly artistBase = environment.artistApi;

  constructor(private http: HttpClient) {}

  /**
   * Backend lưu `DateTime.UtcNow` nhưng chuỗi JSON THIẾU 'Z' (EF trả
   * Kind=Unspecified). Nếu để nguyên, `new Date(...)` / pipe `| date` sẽ hiểu là
   * giờ LOCAL → lệch đúng bằng offset múi giờ. Thêm 'Z' để nó hiểu là UTC rồi tự
   * quy đổi sang giờ máy. Cùng cách xử lý với `parseUtc` trong comment-item.
   */
  private toUtcIso(value: any): string | null {
    if (!value) return null;
    const s = String(value);
    const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(s);
    return hasTz ? s : s + 'Z';
  }

  // ── Kiểm duyệt bình luận ───────────────────────────────────────────────────

  /**
   * Danh sách bình luận để kiểm duyệt — dùng endpoint DÀNH RIÊNG CHO ADMIN
   * `GET /comment/admin/filter` (trả về AdminCommentDto, đủ field + cờ IsDeleted).
   *
   * KHÔNG dùng `/comment/filter-comment` ở trang admin: endpoint đó là bản public
   * cho người đọc, không trả các field quản trị (deleteDate, idUserDeleted...).
   */
  filterComments(opts: {
    keyword?: string;
    mangaId?: string;
    userId?: string;
    includeDeleted?: boolean;
    page?: number;
    pageSize?: number;
  }): Observable<PagedList<AdminComment>> {
    let params = new HttpParams()
      .set('PageNo', opts.page ?? 1)
      .set('PageSize', opts.pageSize ?? 20);
    // Nội dung comment ở field `Message` (theo AdminCommentDto).
    if (opts.keyword) params = params.set('Message', opts.keyword);
    if (opts.mangaId) params = params.set('MangaId', opts.mangaId);
    if (opts.userId) params = params.set('UserId', opts.userId);
    if (opts.includeDeleted) params = params.set('IsDeleted', true);

    return this.http.get<any>(`${this.commentBase}/admin/filter`, { params }).pipe(
      map(res => {
        const raw = res?.value ?? res;
        const list: any[] = raw?.data ?? (Array.isArray(raw) ? raw : []);
        return {
          data: list.map(c => this.toComment(c)),
          totalCount: raw?.totalCount ?? list.length,
        };
      }),
      catchError(() => of({ data: [], totalCount: 0 })),
    );
  }

  /** Map thẳng từ AdminCommentDto (giữ tên field của DTO). */
  private toComment(c: any): AdminComment {
    return {
      id: c.id,
      userId: c.userId ?? null,
      mangaId: c.mangaId ?? null,
      mangaName: c.mangaName ?? null,
      chapterId: c.chapterId ?? null,
      chapterIndex: c.chapterIndex ?? null,
      chapterName: c.chapterName ?? null,
      parentId: c.parentId ?? null,
      blogId: c.blogId ?? null,
      replyToCommentId: c.replyToCommentId ?? null,
      // Nội dung nằm ở `Message` (không phải `content`).
      message: c.message ?? '',
      // Mốc thời gian: chuẩn hoá sang ISO UTC để `| date` render ra giờ local.
      dateTime: this.toUtcIso(c.dateTime),
      like: c.like ?? 0,
      dislike: c.dislike ?? 0,
      isDeleted: !!c.isDeleted,
      displayName: c.displayName || 'N/A',
      avatar: c.avatar ?? null,
      replyCount: c.replyCount ?? 0,
      userCommentTo: c.userCommentTo ?? null,
      createDate: this.toUtcIso(c.createDate),
      deleteDate: this.toUtcIso(c.deleteDate),
      idUserDeleted: c.idUserDeleted ?? null,
    };
  }

  deleteComment(id: string): Observable<any> {
    return this.http.delete(`${this.commentBase}/delete`, { body: { id } });
  }

  restoreComment(id: string): Observable<any> {
    return this.http.post(`${this.commentBase}/restore`, { id });
  }

  // ── Thùng rác / phục hồi ───────────────────────────────────────────────────

  private trashBase(kind: TrashKind): string {
    switch (kind) {
      case 'manga':   return this.mangaBase;
      case 'chapter': return this.chapterBase;
      case 'comment': return this.commentBase;
      case 'author':  return this.authorBase;
      case 'artist':  return this.artistBase;
    }
  }

  /** Endpoint filter tương ứng từng loại (khác nhau theo controller). */
  private trashFilterPath(kind: TrashKind): string {
    switch (kind) {
      case 'manga':   return 'filter-manga';
      case 'chapter': return 'filter-chapter';
      // Comment dùng endpoint admin (có cờ IsDeleted), không dùng bản public.
      case 'comment': return 'admin/filter';
      case 'author':  return 'filter-author';
      case 'artist':  return 'filter-artist';
    }
  }

  /**
   * Liệt kê bản ghi ĐÃ XOÁ MỀM theo loại.
   *
   * MOCK/GIẢ ĐỊNH QUAN TRỌNG: các endpoint `filter-*` hiện chưa chắc nhận param
   * `IsDeleted`. Mình vẫn gửi `IsDeleted=true`; nếu backend bỏ qua param đó thì
   * list trả về sẽ là bản ghi CHƯA xoá → trang sẽ lọc lại phía client theo cờ
   * `isDeleted`, và thường ra rỗng. Khi backend bổ sung filter thật thì trang
   * này tự hoạt động đúng, không cần sửa code.
   *
   * Ngược lại, các API `restore` là THẬT và đã có sẵn cho cả 5 loại.
   */
  getTrash(kind: TrashKind, page = 1, pageSize = 20): Observable<PagedList<TrashItem>> {
    const params = new HttpParams()
      .set('PageNo', page)
      .set('PageSize', pageSize)
      .set('IsDeleted', true);

    return this.http.get<any>(`${this.trashBase(kind)}/${this.trashFilterPath(kind)}`, { params }).pipe(
      map(res => {
        const raw = res?.value ?? res;
        const list: any[] = raw?.data ?? (Array.isArray(raw) ? raw : []);
        // Chỉ giữ bản ghi thực sự đã xoá (phòng khi server bỏ qua IsDeleted).
        const deleted = list.filter(x => x?.isDeleted ?? x?.deleted ?? false);
        return {
          data: deleted.map(x => this.toTrashItem(kind, x)),
          totalCount: deleted.length,
        };
      }),
      catchError(() => of({ data: [], totalCount: 0 })),
    );
  }

  private toTrashItem(kind: TrashKind, x: any): TrashItem {
    const name =
      kind === 'comment' ? (x.message ?? '').slice(0, 80) || '(trống)'
      : kind === 'chapter' ? (x.title || x.chapterName || `Chương ${x.index ?? x.chapterIndex ?? '?'}`)
      : (x.displayName ?? x.name ?? '(không tên)');
    const note =
      kind === 'chapter' ? (x.mangaName ?? x.mangaId ?? undefined)
      : kind === 'comment' ? (x.displayName ?? undefined)
      : undefined;
    return {
      id: x.id,
      kind,
      name,
      note,
      deletedAt: this.toUtcIso(x.deleteDate ?? x.updateDate ?? x.deletedAt) ?? undefined,
    };
  }

  /** Phục hồi bản ghi đã xoá mềm — API thật, có sẵn cho cả 5 loại. */
  restoreItem(kind: TrashKind, id: string): Observable<any> {
    return this.http.post(`${this.trashBase(kind)}/restore`, { id });
  }
}
