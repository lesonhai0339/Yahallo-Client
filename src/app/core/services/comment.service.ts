import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class CommentService {
  private readonly base = environment.commentApi;

  constructor(private http: HttpClient) {}

  filter(params: {
    mangaId?: string;
    userId?: string;
    parentId?: string;
    page?: number;
    pageSize?: number;
    orderByDateDesc?: boolean;
    orderByLikeDesc?: boolean;
  }): Observable<any> {
    let hp = new HttpParams()
      .set('PageNumber', params.page ?? 1)
      .set('PageSize', params.pageSize ?? 20);
    if (params.mangaId) hp = hp.set('MangaId', params.mangaId);
    if (params.userId) hp = hp.set('UserId', params.userId);
    if (params.parentId) hp = hp.set('ParentId', params.parentId);
    if (params.orderByDateDesc != null) hp = hp.set('IsDateTimeReverser', params.orderByDateDesc);
    if (params.orderByLikeDesc != null) hp = hp.set('IsLikeReserver', params.orderByLikeDesc);
    return this.http.get(`${this.base}/filter-comment`, { params: hp });
  }

  getAllMangaComments(mangaId: string, pageSize: number, page: number): Observable<any> {
    return this.filter({ mangaId, page, pageSize });
  }

  getChapterComments(mangaId: string, chapterId: string): Observable<any> {
    return this.filter({ mangaId, pageSize: 50 });
  }

  createComment(userId: string, mangaId: string, message: string, chapterId = '', parentId = ''): Observable<any> {
    const form = new FormData();
    form.append('UserId', userId);
    form.append('MangaId', mangaId);
    form.append('Message', message);
    form.append('Type', '0');
    if (chapterId) form.append('ChapterId', chapterId);
    if (parentId) form.append('ParentId', parentId);
    return this.http.post(`${this.base}/create`, form);
  }

  createChapterComment(userId: string, mangaId: string, chapterId: string, message: string): Observable<any> {
    return this.createComment(userId, mangaId, message, chapterId);
  }

  editComment(commentId: string, message: string): Observable<any> {
    const form = new FormData();
    form.append('Id', commentId);
    form.append('Message', message);
    return this.http.put(`${this.base}/update`, form);
  }

  deleteComment(commentId: string): Observable<any> {
    return this.http.delete(`${this.base}/delete`, { body: { id: commentId } });
  }

  getReplies(commentId: string): Observable<any> {
    return this.filter({ parentId: commentId, pageSize: 50 });
  }

  createReply(parentId: string, userId: string, message: string, mangaId = ''): Observable<any> {
    return this.createComment(userId, mangaId, message, '', parentId);
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
