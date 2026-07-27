import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { UserProfile } from '../models/interfaces';
import { CacheService, CACHE_TTL } from './cache.service';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly base = environment.userApi;

  constructor(private http: HttpClient, private cache: CacheService) {}

  /**
   * GET /user/get-profile?Id=... → UserProfileDto
   *
   * Cache theo id (giống manga-detail): ProfileComponent bị destroy/recreate mỗi
   * lần chuyển giữa tab info (route `user/:id/:name`) và các tab con
   * (`user/:id/:name/:tab`), nên nếu không cache thì mỗi lần đều gọi lại API và
   * cả trang "chớp". Cache trả stream đồng bộ khi còn hạn → không còn nhấp nháy.
   */
  getProfile(id: string): Observable<UserProfile> {
    return this.cache.get(`user-profile:${id}`, CACHE_TTL.PROFILE, () => {
      const params = new HttpParams().set('Id', id);
      return this.http.get<any>(`${this.base}/get-profile`, { params }).pipe(
        map(res => (res?.value ?? res) as UserProfile)
      );
    });
  }

  /** Xoá cache profile (gọi sau khi cập nhật profile để lần đọc kế lấy dữ liệu mới). */
  invalidateProfile(id: string): void {
    this.cache.invalidate(`user-profile:${id}`);
  }
}
