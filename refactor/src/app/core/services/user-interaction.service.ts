import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class UserInteractionService {
  private readonly svc = environment.serviceApi;

  constructor(private http: HttpClient) {}

  follow(userId: string, mangaId: string): Observable<any> {
    const form = new FormData();
    form.append('IdUser', userId);
    form.append('IdManga', mangaId);
    return this.http.post(`${this.svc}/TheoDoiTruyen`, form);
  }

  unfollow(userId: string, mangaId: string): Observable<any> {
    return this.http.delete(`${this.svc}/HuyTheoDoi/${userId}/${mangaId}`);
  }

  getFollowing(userId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.svc}/DanhsachTheoDoi/${userId}`);
  }

  rate(mangaId: string, star: number): Observable<any> {
    const form = new FormData();
    form.append('MangaId', mangaId);
    form.append('star', String(star));
    return this.http.post(`${this.svc}/rating`, form);
  }

  addView(mangaId: string): Observable<any> {
    const form = new FormData();
    form.append('MangaId', mangaId);
    return this.http.post(`${this.svc}/CapNhatView/${mangaId}`, form);
  }

  comment(userId: string, mangaId: string, chapterId: string, message: string): Observable<any> {
    const form = new FormData();
    form.append('IdUser', userId);
    form.append('IdManga', mangaId);
    form.append('IdChapter', chapterId);
    form.append('CommentData', message);
    return this.http.post(`${this.svc}/Comment`, form);
  }

  getComments(mangaId: string, chapterId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.svc}/GetListComment/${mangaId}/${chapterId}`);
  }

  replyComment(commentId: string, userReplyId: string, data: string): Observable<any> {
    const form = new FormData();
    form.append('IdComment', commentId);
    form.append('IdUserReply', userReplyId);
    form.append('ReplyData', data);
    return this.http.post(`${this.svc}/ReplyComment`, form);
  }

  getReplies(commentId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.svc}/ListReply/${commentId}`);
  }

  likeComment(commentId: string): Observable<any> {
    const form = new FormData();
    form.append('idcomment', commentId);
    return this.http.post(`${this.svc}/like_comment`, form);
  }

  dislikeComment(commentId: string): Observable<any> {
    const form = new FormData();
    form.append('idcomment', commentId);
    return this.http.post(`${this.svc}/dislike_comment`, form);
  }

  markNotificationRead(id: string): Observable<any> {
    const form = new FormData();
    form.append('idNotification', id);
    return this.http.post(`${this.svc}/SeenNotification`, form);
  }

  getUnreadNotifications(userId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.svc}/DanhSachThongBaoChuaXem/${userId}`);
  }
}
