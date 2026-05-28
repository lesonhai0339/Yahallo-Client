import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
<<<<<<< HEAD:refactor/src/app/core/services/artist.service.ts
import { ArtistFilterParams } from '../models/interfaces';
=======
>>>>>>> ec3c891e4b7c756cd4ff03d5e3de118e40de4eb4:src/app/core/services/artist.service.ts

@Injectable({ providedIn: 'root' })
export class ArtistService {
  private readonly base = environment.artistApi;

  constructor(private http: HttpClient) {}

  getAll(): Observable<any> {
    return this.http.get(`${this.base}/get-all`);
  }

<<<<<<< HEAD:refactor/src/app/core/services/artist.service.ts
  getAllPagination(page: number, pageSize: number): Observable<any> {
    const params = new HttpParams()
      .set('PageNumber', page)
      .set('PageSize', pageSize);
    return this.http.get(`${this.base}/get-all-pagination`, { params });
  }

  filter(filters: ArtistFilterParams): Observable<any> {
    let params = new HttpParams();
    if (filters.PageNumber) params = params.set('PageNumber', filters.PageNumber);
    if (filters.PageSize) params = params.set('PageSize', filters.PageSize);
    if (filters.Id) params = params.set('Id', filters.Id);
    if (filters.Name) params = params.set('Name', filters.Name);
    if (filters.Countries) params = params.set('Countries', filters.Countries);
    if (filters.LifeStatus) params = params.set('LifeStatus', filters.LifeStatus);
    return this.http.get(`${this.base}/filter-artist`, { params });
  }

  create(data: { name: string; countryCode: number; depscription: string; birth: string; lifeStatus: number }): Observable<any> {
    return this.http.post(`${this.base}/create`, data);
  }

  update(data: { id: string; name?: string; countries: number; depscription?: string; birth?: string; lifeStatus: number }): Observable<any> {
=======
  getPaginated(page = 1, pageSize = 20): Observable<any> {
    const params = new HttpParams().set('PageNumber', page).set('PageSize', pageSize);
    return this.http.get(`${this.base}/get-all-pagination`, { params });
  }

  filter(params: { id?: string; name?: string; countries?: number; lifeStatus?: number; page?: number; pageSize?: number }): Observable<any> {
    let hp = new HttpParams()
      .set('PageNumber', params.page ?? 1)
      .set('PageSize', params.pageSize ?? 20);
    if (params.id) hp = hp.set('Id', params.id);
    if (params.name) hp = hp.set('Name', params.name);
    if (params.countries != null) hp = hp.set('Countries', params.countries);
    if (params.lifeStatus != null) hp = hp.set('LifeStatus', params.lifeStatus);
    return this.http.get(`${this.base}/filter-artist`, { params: hp });
  }

  create(data: { name: string; countries?: number; lifeStatus?: number }): Observable<any> {
    return this.http.post(`${this.base}/create`, data);
  }

  update(data: { id: string; name?: string; countries?: number; lifeStatus?: number }): Observable<any> {
>>>>>>> ec3c891e4b7c756cd4ff03d5e3de118e40de4eb4:src/app/core/services/artist.service.ts
    return this.http.put(`${this.base}/update`, data);
  }

  delete(id: string): Observable<any> {
    return this.http.delete(`${this.base}/delete`, { body: { id } });
  }

  restore(id: string): Observable<any> {
    return this.http.post(`${this.base}/restore`, { id });
  }
}
