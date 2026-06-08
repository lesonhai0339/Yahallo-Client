import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { PermissionService } from '../services/permission.service';

@Injectable({ providedIn: 'root' })
export class AdminGuard implements CanActivate {
  constructor(
    private auth: AuthService,
    private permissionService: PermissionService,
    private router: Router
  ) {}

  canActivate(): Observable<boolean> {
    if (!this.auth.isLoggedIn) {
      this.router.navigate(['/auth/login']);
      return of(false);
    }
    return this.permissionService.roles$.pipe(
      map(() => {
        const hasAccess = this.permissionService.hasAdminAccess;
        if (!hasAccess) this.router.navigate(['/']);
        return hasAccess;
      }),
      catchError(() => {
        this.router.navigate(['/']);
        return of(false);
      })
    );
  }
}
