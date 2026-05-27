import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CommentData, ReplyData } from '../models/comment.interfaces';

@Injectable({ providedIn: 'root' })
export class CommentService {
  private readonly svc = environment.serviceApi;
  private readonly api = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // ── Root comments ──────────────────────────────────────────────────────────

  /** All manga comments (includes chapter-tagged comments) */
  getAllMangaComments(mangaId: string, pageSize: number, page: number): Observable<any> {
    return this.http.get(`${this.svc}/manga_comment_manga/${mangaId}/${pageSize}/${page}`);
  }

  /** Chapter-only comments */
  getChapterComments(mangaId: string, chapterId: string): Observable<CommentData[]> {
    return this.http.get<CommentData[]>(`${this.svc}/GetListComment/${mangaId}/${chapterId}`);
  }

  createComment(userId: string, mangaId: string, text: string, chapterId = ''): Observable<any> {
    const form = new FormData();
    form.append('IdUser', userId);
    form.append('IdManga', mangaId);
    if (chapterId) form.append('IdChapter', chapterId);
    form.append('CommentData', text);
    return this.http.post(`${this.svc}/Comment`, form);
  }

  createChapterComment(userId: string, mangaId: string, chapterId: string, text: string): Observable<any> {
    return this.createComment(userId, mangaId, text, chapterId);
  }

  /** Edit comment text — expects PUT /Services/comment/{id} */
  editComment(commentId: string, text: string): Observable<any> {
    const form = new FormData();
    form.append('commentData', text);
    return this.http.put(`${this.svc}/comment/${commentId}`, form);
  }

  /** Soft-delete — backend should mark isDeleted=true and store "deleted" text */
  deleteComment(commentId: string): Observable<any> {
    return this.http.delete(`${this.svc}/comment/${commentId}`);
  }

  // ── Replies ────────────────────────────────────────────────────────────────

  getReplies(commentId: string): Observable<ReplyData[]> {
    return this.http.get<ReplyData[]>(`${this.svc}/ListReply/${commentId}`);
  }

  createReply(commentId: string, userReplyId: string, text: string): Observable<any> {
    const form = new FormData();
    form.append('IdComment', commentId);
    form.append('IdUserReply', userReplyId);
    form.append('ReplyData', text);
    return this.http.post(`${this.svc}/ReplyComment`, form);
  }

  editReply(replyId: string, text: string): Observable<any> {
    const form = new FormData();
    form.append('replyData', text);
    return this.http.put(`${this.svc}/reply/${replyId}`, form);
  }

  deleteReply(replyId: string): Observable<any> {
    return this.http.delete(`${this.svc}/reply/${replyId}`);
  }

  // ── Reactions ──────────────────────────────────────────────────────────────

  getReactions(commentId: string): Observable<{ likes: number; dislikes: number }> {
    return this.http.get<any>(`${this.svc}/get_like_and_unlike_comment/${commentId}`);
  }

  likeComment(commentId: string): Observable<any> {
    const form = new FormData(); form.append('idcomment', commentId);
    return this.http.post(`${this.svc}/like_comment`, form);
  }

  dislikeComment(commentId: string): Observable<any> {
    const form = new FormData(); form.append('idcomment', commentId);
    return this.http.post(`${this.svc}/dislike_comment`, form);
  }

  unlikeComment(commentId: string): Observable<any> {
    const form = new FormData(); form.append('idcomment', commentId);
    return this.http.post(`${this.svc}/un_like_comment`, form);
  }

  undislikeComment(commentId: string): Observable<any> {
    const form = new FormData(); form.append('idcomment', commentId);
    return this.http.post(`${this.svc}/un_dislike_comment`, form);
  }

  reportComment(commentId: string): Observable<any> {
    const form = new FormData(); form.append('idcomment', commentId);
    return this.http.post(`${this.svc}/comment/report`, form);
  }

  getCount(mangaId: string): Observable<number> {
    return this.http.get<number>(`${this.svc}/comment_count/${mangaId}`);
  }
}
