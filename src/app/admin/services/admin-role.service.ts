import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

/**
 * ⚠️ MODULE MỚI THÊM — xem `docs/ADMIN_MODULES_ADDED.md` để biết cách remove.
 *
 * Service cho trang `/admin/roles` — CRUD role (API thật: /role/*) và xem ma trận
 * quyền. Ma trận quyền lấy từ ROLE_PERMISSIONS phía client (permission.model.ts),
 * vì backend chưa có endpoint trả permission theo role.
 */

export interface AdminRole {
  id: string;
  name: string;
  description?: string;
  userCount?: number;
  isDeleted?: boolean;
}

@Injectable({ providedIn: 'root' })
export class AdminRoleService {
  private readonly roleBase = environment.roleApi;
  private readonly userRoleBase = environment.userRoleApi;

  constructor(private http: HttpClient) {}

  /** Danh sách role — API thật `/role/get-all-pagination`. */
  getRoles(page = 1, pageSize = 50): Observable<{ data: AdminRole[]; totalCount: number }> {
    const params = new HttpParams().set('PageNo', page).set('PageSize', pageSize);
    return this.http.get<any>(`${this.roleBase}/get-all-pagination`, { params }).pipe(
      map(res => {
        const raw = res?.value ?? res;
        const list: any[] = raw?.data ?? (Array.isArray(raw) ? raw : []);
        return {
          data: list.map(r => ({
            id: r.id,
            name: r.name ?? r.roleName ?? '',
            description: r.description ?? '',
            userCount: r.userCount,
            isDeleted: !!(r.isDeleted ?? r.deleted),
          } as AdminRole)),
          totalCount: raw?.totalCount ?? list.length,
        };
      }),
      catchError(() => of({ data: [], totalCount: 0 })),
    );
  }

  create(data: { name: string; description?: string }): Observable<any> {
    return this.http.post(`${this.roleBase}/create`, data);
  }

  update(data: { id: string; name?: string; description?: string }): Observable<any> {
    return this.http.put(`${this.roleBase}/update`, data);
  }

  delete(id: string): Observable<any> {
    return this.http.delete(`${this.roleBase}/delete`, { body: { id } });
  }

  restore(id: string): Observable<any> {
    return this.http.post(`${this.roleBase}/restore`, { id });
  }

  /**
   * Số user thuộc từng role.
   *
   * MOCK/GIẢ ĐỊNH: chưa có endpoint đếm trực tiếp, nên gọi
   * `/user-role/filter-user-role?RoleId=...&PageSize=1` và đọc `totalCount`.
   * Nếu API không trả totalCount thì hàm trả 0 (UI hiện "—").
   */
  countUsersInRole(roleId: string): Observable<number> {
    const params = new HttpParams().set('RoleId', roleId).set('PageNo', 1).set('PageSize', 1);
    return this.http.get<any>(`${this.userRoleBase}/filter-user-role`, { params }).pipe(
      map(res => {
        const raw = res?.value ?? res;
        return raw?.totalCount ?? 0;
      }),
      catchError(() => of(0)),
    );
  }
}
