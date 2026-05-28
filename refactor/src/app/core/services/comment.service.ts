import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CommentData, ReplyData } from '../models/comment.interfaces';

@Injectable({ providedIn: 'root' })
export class CommentService {
  private readonly base = environment.commentApi;

  constructor(private http: HttpClient) {}

  // ── Queries ────────────────────────────────────────────────────────────────

  getAllMangaComments(mangaId: string, pageSize: number, page: number): Observable<any> {
    const params = new HttpParams()
      .set('MangaId', mangaId)
      .set('PageNumber', page)
      .set('PageSize', pageSize);
    return this.http.get(`${this.base}/filter-comment`, { params });
  }

  getChapterComments(mangaId: string, chapterId: string, page = 1, pageSize = 20): Observable<any> {
    const params = new HttpParams()
      .set('MangaId', mangaId)
      .set('PageNumber', page)
      .set('PageSize', pageSize);
    return this.http.get(`${this.base}/filter-comment`, { params });
  }

  getReplies(parentId: string, page = 1, pageSize = 50): Observable<any> {
    const params = new HttpParams()
      .set('PageNumber', page)
      .set('PageSize', pageSize);
    return this.http.get(`${this.base}/filter-comment`, { params });
  }

  getCount(mangaId: string): Observable<any> {
    const params = new HttpParams()
      .set('MangaId', mangaId)
      .set('PageSize', 1)
      .set('PageNumber', 1);
    return this.http.get(`${this.base}/filter-comment`, { params });
  }

  // ── Commands ───────────────────────────────────────────────────────────────

  createComment(userId: string, mangaId: string, text: string, chapterId = '', parentId = ''): Observable<any> {
    const form = new FormData();
    form.append('UserId', userId);
    form.append('MangaId', mangaId);
    form.append('Message', text);
    form.append('Type', '0');
    if (chapterId) form.append('ChapterId', chapterId);
    if (parentId) form.append('ParentId', parentId);
    return this.http.post(`${this.base}/create`, form);
  }

  createChapterComment(userId: string, mangaId: string, chapterId: string, text: string): Observable<any> {
    return this.createComment(userId, mangaId, text, chapterId);
  }

  editComment(commentId: string, text: string): Observable<any> {
    const form = new FormData();
    form.append('Id', commentId);
    form.append('Message', text);
    return this.http.put(`${this.base}/update`, form);
  }

  deleteComment(commentId: string): Observable<any> {
    return this.http.delete(`${this.base}/delete`, { body: { id: commentId } });
  }

  restoreComment(commentId: string): Observable<any> {
    return this.http.post(`${this.base}/restore`, { id: commentId });
  }

  // ── Replies (use create with parentId) ────────────────────────────────────

  createReply(parentId: string, userId: string, mangaIdOrText: string, text?: string): Observable<any> {
    const mangaId = text ? mangaIdOrText : '';
    const message = text ?? mangaIdOrText;
    return this.createComment(userId, mangaId, message, '', parentId);
  }

  editReply(replyId: string, text: string): Observable<any> {
    return this.editComment(replyId, text);
  }

  deleteReply(replyId: string): Observable<any> {
    return this.deleteComment(replyId);
  }

  // ── Reactions (update comment permissions) ─────────────────────────────────

  likeComment(commentId: string): Observable<any> {
    const form = new FormData();
    form.append('Id', commentId);
    form.append('CanLike', 'true');
    return this.http.put(`${this.base}/update`, form);
  }

  dislikeComment(commentId: string): Observable<any> {
    const form = new FormData();
    form.append('Id', commentId);
    form.append('CanLike', 'false');
    return this.http.put(`${this.base}/update`, form);
  }

  unlikeComment(commentId: string): Observable<any> {
    return this.likeComment(commentId);
  }

  undislikeComment(commentId: string): Observable<any> {
    return this.dislikeComment(commentId);
  }

  getReactions(commentId: string): Observable<any> {
    const params = new HttpParams().set('Id', commentId);
    return this.http.get(`${this.base}/filter-comment`, { params });
  }

  reportComment(commentId: string): Observable<any> {
    const form = new FormData();
    form.append('Title', 'Comment Report');
    form.append('Description', 'Reported comment');
    form.append('Content', commentId);
    form.append('Target', commentId);
    form.append('Type', '0');
    return this.http.post(`${environment.apiUrl}/Create`, form);
  }
}
