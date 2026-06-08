import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { PermissionService } from '../services/permission.service';
import { Permission } from '../models/permission.model';

@Injectable({ providedIn: 'root' })
export class PermissionGuard implements CanActivate {
  constructor(
    private auth: AuthService,
    private permissionService: PermissionService,
    private router: Router
  ) {}

  canActivate(route: ActivatedRouteSnapshot): Observable<boolean> {
    if (!this.auth.isLoggedIn) {
      this.router.navigate(['/auth/login']);
      return of(false);
    }

    const requiredPermission = route.data['permission'] as Permission | undefined;
    if (!requiredPermission) return of(true);

    return this.permissionService.permissions$.pipe(
      map(() => {
        const hasAccess = this.permissionService.hasPermission(requiredPermission);
        if (!hasAccess) this.router.navigate(['/admin/dashboard']);
        return hasAccess;
      }),
      catchError(() => {
        this.router.navigate(['/admin/dashboard']);
        return of(false);
      })
    );
  }
}
