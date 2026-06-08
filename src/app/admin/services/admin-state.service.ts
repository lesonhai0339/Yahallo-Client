import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { PermissionService } from '../../core/services/permission.service';

@Injectable({ providedIn: 'root' })
export class AdminStateService {
  isAdmin$: Observable<boolean>;

  constructor(private permissionService: PermissionService) {
    this.isAdmin$ = this.permissionService.roles$.pipe(
      map(() => this.permissionService.hasAdminAccess)
    );
  }

  get isAdmin(): boolean {
    return this.permissionService.hasAdminAccess;
  }
}
