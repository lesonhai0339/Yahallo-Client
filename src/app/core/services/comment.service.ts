import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { CacheService, CACHE_TTL } from './cache.service';

@Injectable({ providedIn: 'root' })
export class CommentService {
  private readonly base = environment.commentApi;

  constructor(private http: HttpClient, private cache: CacheService) {}

  /** Xóa cache danh sách comment (mọi trang) sau khi thêm/sửa/xóa comment. */
  private invalidateComments(): void {
    this.cache.invalidate('manga-comments:');
  }

  /**
   * Rút commentId từ response của /create. Backend giờ trả về id của comment vừa
   * tạo (thay cho chuỗi "success"/"failed" cũ), nhưng có thể ở nhiều dạng bao bọc:
   *   { value: { id } } | { value: "<id>" } | { id } | "<id>"
   * Trả '' nếu không tìm thấy id hợp lệ để caller tự xử lý fallback.
   */
  private extractCommentId(res: any): string {
    if (typeof res === 'string') return res;
    if (typeof res?.value === 'string') return res.value;
    return res?.value?.id ?? res?.data?.id ?? res?.id ?? '';
  }

  filter(params: {
    mangaId?: string;
    chapterId?:string;
    userId?: string;
    parentId?: string;
    page?: number;
    pageSize?: number;
    orderByDateDesc?: boolean;
    orderByLikeDesc?: boolean;
  }): Observable<any> {
    let hp = new HttpParams()
      .set('PageNo', params.page ?? 1)
      .set('PageSize', params.pageSize ?? 20);
    if (params.mangaId) hp = hp.set('MangaId', params.mangaId);
    if (params.chapterId) hp = hp.set('ChapterId', params.chapterId);
    if (params.userId) hp = hp.set('UserId', params.userId);
    if (params.parentId) hp = hp.set('ParentId', params.parentId);
    // Backend bind FilterCommentQuery: SortBy (Time|Like|Dislike) + ReverseSort (true = giảm dần / mới nhất trước)
    if (params.orderByLikeDesc != null) {
      hp = hp.set('SortBy', 'Like').set('ReverseSort', params.orderByLikeDesc);
    } else if (params.orderByDateDesc != null) {
      hp = hp.set('SortBy', 'Time').set('ReverseSort', params.orderByDateDesc);
    }
    return this.http.get(`${this.base}/filter-comment`, { params: hp });
  }

  getAllMangaComments(mangaId: string, pageSize: number, page: number): Observable<any> {
    // mới nhất lên đầu: SortBy=Time + ReverseSort=true (OrderByDescending CreateDate)
    // Cache 2 phút (khớp server); invalidate khi có comment mới để không hiện cũ.
    return this.cache.get(`manga-comments:${mangaId}:${page}:${pageSize}`, CACHE_TTL.COMMENTS, () =>
      this.filter({ mangaId, page, pageSize, orderByDateDesc: true })
    );
  }

  getChapterComments(mangaId: string, chapterId: string): Observable<any> {
    return this.filter({ mangaId, chapterId , pageSize: 50 });
  }

  /** Tạo comment; trả về commentId vừa tạo (chuỗi rỗng nếu backend không trả id). */
  createComment(userId: string, mangaId: string, message: string, type: number , commentToUserId = '', chapterId = '', parentId = '', replyCommentId = ''): Observable<string> {
    const form = new FormData();
    form.append('UserId', userId);
    form.append('MangaId', mangaId);
    form.append('Message', message);
    form.append('Type', type.toString());
    if (chapterId) form.append('ChapterId', chapterId);
    if (parentId) form.append('ParentId', parentId);
    if (replyCommentId) form.append('ReplyCommentId', replyCommentId);
    if(commentToUserId) form.append('CommentToUserId', commentToUserId);
    return this.http.post(`${this.base}/create`, form).pipe(
      tap(() => this.invalidateComments()),
      map(res => this.extractCommentId(res)),
    );
  }

  createChapterComment(userId: string, mangaId: string, chapterId: string, message: string): Observable<string> {
    return this.createComment(userId, mangaId, message, 2, '', chapterId, '', '');
  }

  editComment(commentId: string, message: string): Observable<any> {
    const form = new FormData();
    form.append('Id', commentId);
    form.append('Message', message);
    return this.http.put(`${this.base}/update`, form)
      .pipe(tap(() => this.invalidateComments()));
  }

  deleteComment(commentId: string): Observable<any> {
    return this.http.delete(`${this.base}/delete`, { body: { id: commentId } })
      .pipe(tap(() => this.invalidateComments()));
  }

  getReplies(commentId: string): Observable<any> {
    return this.filter({ parentId: commentId, pageSize: 50 });
  }

  /** Tạo reply; trả về commentId của reply vừa tạo. */
  createReply(parentId: string, userId: string, message: string, type: number, commentToUserId: string, replyCommentId = '', mangaId = '', chapterId = ''): Observable<string> {
    return this.createComment(userId, mangaId, message, type, commentToUserId, chapterId, parentId, replyCommentId);
  }

  getCount(mangaId: string): Observable<any> {
    return this.filter({ mangaId, pageSize: 1 });
  }

  likeComment(commentId: string): Observable<any> {
    return this.http.post(`${environment.serviceApi}/like_comment`, { commentId });
  }

  dislikeComment(commentId: string): Observable<any> {
    return this.http.post(`${environment.serviceApi}/dislike_comment`, { commentId });
  }

  unlikeComment(commentId: string): Observable<any> {
    return this.http.post(`${environment.serviceApi}/un_like_comment`, { commentId });
  }

  undislikeComment(commentId: string): Observable<any> {
    return this.http.post(`${environment.serviceApi}/un_dislike_comment`, { commentId });
  }

  deleteReply(replyId: string): Observable<any> {
    return this.deleteComment(replyId);
  }
}
