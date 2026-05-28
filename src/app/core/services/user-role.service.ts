import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class UserRoleService {
  private readonly base = `${environment.apiUrl}/user-role`;

  constructor(private http: HttpClient) {}

  getAll(): Observable<any> {
    return this.http.get(`${this.base}/get-all`);
  }

  getAllPagination(page: number, pageSize: number): Observable<any> {
    const params = new HttpParams()
      .set('PageNumber', page)
      .set('PageSize', pageSize);
    return this.http.get(`${this.base}/get-all-pagination`, { params });
  }

  filter(filters: { PageNumber?: number; PageSize?: number; UserId?: string; RoleId?: string; UserName?: string; RoleName?: string; RoleCode?: number }): Observable<any> {
    let params = new HttpParams();
    if (filters.PageNumber) params = params.set('PageNumber', filters.PageNumber);
    if (filters.PageSize) params = params.set('PageSize', filters.PageSize);
    if (filters.UserId) params = params.set('UserId', filters.UserId);
    if (filters.RoleId) params = params.set('RoleId', filters.RoleId);
    if (filters.UserName) params = params.set('UserName', filters.UserName);
    if (filters.RoleName) params = params.set('RoleName', filters.RoleName);
    if (filters.RoleCode !== undefined) params = params.set('RoleCode', filters.RoleCode);
    return this.http.get(`${this.base}/filter-user-role`, { params });
  }

  assign(userId: string, roleId: string): Observable<any> {
    return this.http.post(`${this.base}/create`, { userId, roleId });
  }

  revoke(userId: string, roleId: string): Observable<any> {
    return this.http.delete(`${this.base}/delete`, { body: { userId, roleId } });
  }

  restore(userId: string, roleId: string): Observable<any> {
    return this.http.post(`${this.base}/restore`, { userId, roleId });
  }
}
