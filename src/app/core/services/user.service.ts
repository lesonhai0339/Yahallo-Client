import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { UserProfile } from '../models/interfaces';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly base = environment.userApi;

  constructor(private http: HttpClient) {}

  /** GET /user/get-profile?Id=... → UserProfileDto */
  getProfile(id: string): Observable<UserProfile> {
    const params = new HttpParams().set('Id', id);
    return this.http.get<any>(`${this.base}/get-profile`, { params }).pipe(
      map(res => (res?.value ?? res) as UserProfile)
    );
  }
}
