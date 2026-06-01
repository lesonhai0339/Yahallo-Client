import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly userBase = environment.userApi;
  private readonly roleBase = environment.roleApi;
  private readonly userRoleBase = environment.userRoleApi;
  private readonly securityBase = environment.securityApi;

  constructor(private http: HttpClient) {}

  getAllUsers(page = 1, pageSize = 50): Observable<any> {
    const params = new HttpParams().set('PageNumber', page).set('PageSize', pageSize);
    return this.http.get(`${this.userBase}/get-all-pagination`, { params });
  }

  getUserById(id: string): Observable<any> {
    return this.http.get(`${this.userBase}/get-by-id`, { params: { id } });
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
}
