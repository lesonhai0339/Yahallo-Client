import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { toIsoWithOffset } from '../utils/date-format';

@Injectable({ providedIn: 'root' })
export class AuthorService {
  private readonly base = environment.authorApi;

  constructor(private http: HttpClient) {}

  getAll(): Observable<any> {
    return this.http.get(`${this.base}/get-all`);
  }

  getPaginated(page = 1, pageSize = 20): Observable<any> {
    const params = new HttpParams().set('PageNo', page).set('PageSize', pageSize);
    return this.http.get(`${this.base}/get-all-pagination`, { params });
  }

  filter(params: { id?: string; name?: string; countries?: number; birth?: string; lifeStatus?: number; page?: number; pageSize?: number }): Observable<any> {
    let hp = new HttpParams()
      .set('PageNo', params.page ?? 1)
      .set('PageSize', params.pageSize ?? 20);
    if (params.id) hp = hp.set('Id', params.id);
    if (params.name) hp = hp.set('Name', params.name);
    if (params.countries != null) hp = hp.set('Countries', params.countries);
    // `Birth` đi qua StrictDateTimeOffsetBinder (áp cả cho query param) nên PHẢI
    // có offset — chuẩn hoá tại đây để caller truyền "yyyy-MM-dd" cũng không bị 400.
    if (params.birth) {
      const birth = toIsoWithOffset(params.birth);
      if (birth) hp = hp.set('Birth', birth);
    }
    if (params.lifeStatus != null) hp = hp.set('LifeStatus', params.lifeStatus);
    return this.http.get(`${this.base}/filter-author`, { params: hp });
  }

  create(data: { name: string; countries?: number; birth?: string; lifeStatus?: number }): Observable<any> {
    return this.http.post(`${this.base}/create`, data);
  }

  update(data: { id: string; name?: string; countries?: number; birth?: string; lifeStatus?: number }): Observable<any> {
    return this.http.put(`${this.base}/update`, data);
  }

  delete(id: string): Observable<any> {
    return this.http.delete(`${this.base}/delete`, { body: { id } });
  }

  restore(id: string): Observable<any> {
    return this.http.post(`${this.base}/restore`, { id });
  }
}
