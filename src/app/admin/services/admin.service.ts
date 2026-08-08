import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly userBase = environment.userApi;
  private readonly roleBase = environment.roleApi;
  private readonly userRoleBase = environment.userRoleApi;
  private readonly securityBase = environment.securityApi;
  private readonly notifBase = environment.notificationApi;

  constructor(private http: HttpClient) {}

  /**
   * Chức năng: Danh sách người dùng cho khu quản trị. Dùng endpoint riêng của
   *   admin (`user/admin/get-all-pagination` → AdminUserDto) vì bản công khai
   *   không trả `roles`, `status`, `level` — những thứ trang quản trị cần.
   * Yêu cầu: `page` bắt đầu từ 1.
   * Kết quả trả về: Observable phát nguyên response phân trang.
   * Exception: không bắt — để tầng gọi xử lý.
   */
  getAllUsers(page = 1, pageSize = 50): Observable<any> {
    const params = new HttpParams().set('PageNo', page).set('PageSize', pageSize);
    return this.http.get(`${this.userBase}/admin/get-all-pagination`, { params });
  }

  getUserById(id: string): Observable<any> {
    return this.http.get(`${this.userBase}/get-by-id`, { params: { id } });
  }

  /** GET /user/detail?UserId=... → UserDetailDto (thông tin đầy đủ cho card admin). */
  getUserDetail(id: string): Observable<any> {
    return this.http.get(`${this.userBase}/detail`, { params: { UserId: id } });
  }

  updateUser(data: FormData): Observable<any> {
    return this.http.put(`${this.userBase}/update`, data);
  }

  getAllRoles(): Observable<any[]> {
    return this.http.get<any[]>(`${this.roleBase}/get-all`);
  }

  getUserRoles(userId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.userRoleBase}/by-user`, { params: { userId } });
  }

  addUserRole(userId: string, roleId: string): Observable<any> {
    return this.http.post(`${this.userRoleBase}/add`, { userId, roleId });
  }

  removeUserRole(userId: string, roleId: string): Observable<any> {
    return this.http.delete(`${this.userRoleBase}/remove`, { body: { userId, roleId } });
  }

  lockUser(userId: string, daysToLock: number): Observable<any> {
    return this.http.post(`${this.securityBase}/lock`, { userId, daysToLock });
  }

  unlockUser(userId: string): Observable<any> {
    return this.http.post(`${this.securityBase}/unlock`, { userId });
  }

  // ── Reset password (mock — POST /security/reset-password) ─────────────────
  resetPassword(userId: string): Observable<any> {
    return this.http.post(`${this.securityBase}/admin-reset-password`, { userId });
  }

  // ── Send notification to user (mock — POST /notification/admin-send) ──────
  sendNotification(userId: string, data: { title: string; content: string; imageUrl?: string }): Observable<any> {
    return this.http.post(`${this.notifBase}/admin-send`, { userId, ...data });
  }

  // ── Feedback from user (mock — GET /user/{id}/feedbacks) ──────────────────
  getUserFeedbacks(userId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.userBase}/${userId}/feedbacks`);
  }

  updateFeedbackStatus(feedbackId: string, status: string): Observable<any> {
    return this.http.put(`${this.userBase}/feedbacks/${feedbackId}`, { status });
  }

  // ── Admin ↔ User messages (mock — GET/POST /user/{id}/admin-messages) ─────
  getAdminMessages(userId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.userBase}/${userId}/admin-messages`);
  }

  sendAdminMessage(userId: string, content: string): Observable<any> {
    return this.http.post(`${this.userBase}/${userId}/admin-messages`, { content });
  }

  // ── Internal Topics (mock — /topics) ──────────────────────────────────────
  getTopics(): Observable<any> {
    return this.http.get(`${this.securityBase}/topics`);
  }

  createTopic(data: { title: string; content: string; category: string; pinned: boolean }): Observable<any> {
    return this.http.post(`${this.securityBase}/topics`, data);
  }

  toggleTopicPin(topicId: string, pinned: boolean): Observable<any> {
    return this.http.put(`${this.securityBase}/topics/${topicId}/pin`, { pinned });
  }

  toggleTopicClose(topicId: string, closed: boolean): Observable<any> {
    return this.http.put(`${this.securityBase}/topics/${topicId}/close`, { closed });
  }

  deleteTopic(topicId: string): Observable<any> {
    return this.http.delete(`${this.securityBase}/topics/${topicId}`);
  }

  getTopicReplies(topicId: string): Observable<any> {
    return this.http.get(`${this.securityBase}/topics/${topicId}/replies`);
  }

  createTopicReply(topicId: string, content: string): Observable<any> {
    return this.http.post(`${this.securityBase}/topics/${topicId}/replies`, { content });
  }
}
