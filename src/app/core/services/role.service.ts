import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class RoleService {
  private readonly base = environment.roleApi;

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

  filter(filters: { PageNumber?: number; PageSize?: number; Id?: string; RoleCode?: number; RoleName?: string }): Observable<any> {
    let params = new HttpParams();
    if (filters.PageNumber) params = params.set('PageNumber', filters.PageNumber);
    if (filters.PageSize) params = params.set('PageSize', filters.PageSize);
    if (filters.Id) params = params.set('Id', filters.Id);
    if (filters.RoleCode !== undefined) params = params.set('RoleCode', filters.RoleCode);
    if (filters.RoleName) params = params.set('RoleName', filters.RoleName);
    return this.http.get(`${this.base}/filter-role`, { params });
  }

  create(data: { roleCode: number; roleName: string }): Observable<any> {
    return this.http.post(`${this.base}/create`, data);
  }

  update(data: { id: string; roleCode?: number; roleName?: string }): Observable<any> {
    return this.http.put(`${this.base}/update`, data);
  }

  delete(id: string): Observable<any> {
    return this.http.delete(`${this.base}/delete`, { body: { id } });
  }

  restore(id: string): Observable<any> {
    return this.http.post(`${this.base}/restore`, { id });
  }
}
