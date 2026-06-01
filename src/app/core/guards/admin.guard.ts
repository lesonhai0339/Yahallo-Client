import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { AdminStateService } from '../../admin/services/admin-state.service';

@Injectable({ providedIn: 'root' })
export class AdminGuard implements CanActivate {
  constructor(
    private auth: AuthService,
    private adminState: AdminStateService,
    private router: Router
  ) {}

  canActivate(): Observable<boolean> {
    if (!this.auth.isLoggedIn) {
      this.router.navigate(['/auth/login']);
      return of(false);
    }
    return this.adminState.isAdmin$.pipe(
      map(isAdmin => {
        if (!isAdmin) this.router.navigate(['/']);
        return isAdmin;
      }),
      catchError(() => {
        this.router.navigate(['/']);
        return of(false);
      })
    );
  }
}
