import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { switchMap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/services/auth.service';

interface UserRole {
  roleId: string;
  roleName: string;
  userId: string;
  userName: string;
}

interface UserRolePagination {
  pageCount: number;
  pageNumber: number;
  pageSize: number;
  totalCount: number;
  data: UserRole[];
}

@Injectable({ providedIn: 'root' })
export class AdminStateService {
  private isAdminSubject = new BehaviorSubject<boolean>(false);
  isAdmin$ = this.isAdminSubject.asObservable();

  constructor(private auth: AuthService, private http: HttpClient) {
    this.auth.auth$.pipe(
      switchMap(state => {
        if (!state.status) {
          this.isAdminSubject.next(false);
          return of(null);
        }
        const userId = this.auth.currentUser?.id;
        if (!userId) return of(null);

        const params = { PageNumber: 1, PageSize: 1, UserId: userId };
        return this.http.get<{ value: UserRolePagination }>(
          `${environment.userRoleApi}/filter-user-role`, { params }
        ).pipe(catchError(() => of(null)));
      })
    ).subscribe((res: any) => {
      const pagination: UserRolePagination | undefined = res?.value ?? res;
      const isAdmin = pagination?.data?.some(
        (r: UserRole) => r.roleName?.toLowerCase() === 'admin'
      ) ?? false;
      this.isAdminSubject.next(isAdmin);
    });
  }

  get isAdmin(): boolean {
    return this.isAdminSubject.value;
  }
}
