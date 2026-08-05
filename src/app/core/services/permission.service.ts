import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from './auth.service';
import { AppRole, Permission, ROLE_PERMISSIONS, ROLE_PRIORITY, ADMIN_ROLES } from '../models/permission.model';

@Injectable({ providedIn: 'root' })
export class PermissionService {
  private realRoles: AppRole[] = [];
  private viewAsRole: AppRole | null = null;

  private rolesSubject = new BehaviorSubject<AppRole[]>([]);
  private permissionsSubject = new BehaviorSubject<Permission[]>([]);
  private grantedExtrasSubject = new BehaviorSubject<Permission[]>([]);

  roles$ = this.rolesSubject.asObservable();
  permissions$ = this.permissionsSubject.asObservable();

  constructor(private auth: AuthService) {
    // Roles lấy thẳng từ phiên đăng nhập (getme đã trả `roles`, cùng nguồn
    // RoleEntity.RoleName như filter-user-role cũ) — auth dùng cookie httpOnly,
    // không còn bearer token để gọi filter-user-role riêng.
    this.auth.auth$.subscribe(state => {
      if (!state.status) {
        this.clear();
        return;
      }
      const roleNames = (this.auth.currentUser?.roles ?? []).map(r => (r ?? '').toLowerCase());

      const appRoles: AppRole[] = [];
      if (roleNames.includes('admin')) appRoles.push(AppRole.Admin);
      if (roleNames.includes('moderator')) appRoles.push(AppRole.Moderator);
      if (roleNames.includes('trans')) appRoles.push(AppRole.Trans);

      this.realRoles = appRoles;
      this.applyRoles();
    });
  }

  private clear(): void {
    this.realRoles = [];
    this.viewAsRole = null;
    this.rolesSubject.next([]);
    this.permissionsSubject.next([]);
    this.grantedExtrasSubject.next([]);
  }

  private applyRoles(): void {
    if (this.viewAsRole) {
      this.rolesSubject.next([this.viewAsRole]);
    } else {
      this.rolesSubject.next(this.realRoles);
    }
    this.rebuildPermissions();
  }

  get isRealAdmin(): boolean {
    return this.realRoles.includes(AppRole.Admin);
  }

  get isViewingAs(): boolean {
    return this.viewAsRole !== null;
  }

  get viewingAsRole(): AppRole | null {
    return this.viewAsRole;
  }

  setViewAs(role: AppRole | null): void {
    if (!this.isRealAdmin) return;
    this.viewAsRole = role;
    this.applyRoles();
  }

  clearViewAs(): void {
    this.viewAsRole = null;
    this.applyRoles();
  }

  private rebuildPermissions(): void {
    const roles = this.rolesSubject.value;
    const perms = new Set<Permission>();

    for (const role of roles) {
      const rolePerms = ROLE_PERMISSIONS[role] ?? [];
      rolePerms.forEach(p => perms.add(p));
    }

    for (const extra of this.grantedExtrasSubject.value) {
      perms.add(extra);
    }

    this.permissionsSubject.next(Array.from(perms));
  }

  grantExtra(permission: Permission): void {
    const extras = [...this.grantedExtrasSubject.value];
    if (!extras.includes(permission)) {
      extras.push(permission);
      this.grantedExtrasSubject.next(extras);
      this.rebuildPermissions();
    }
  }

  get highestRole(): AppRole | null {
    const roles = this.rolesSubject.value;
    if (!roles.length) return null;
    return [...roles].sort((a, b) => (ROLE_PRIORITY[b] ?? 0) - (ROLE_PRIORITY[a] ?? 0))[0];
  }

  get currentRoles(): AppRole[] {
    return this.rolesSubject.value;
  }

  get currentPermissions(): Permission[] {
    return this.permissionsSubject.value;
  }

  hasRole(role: AppRole): boolean {
    return this.rolesSubject.value.includes(role);
  }

  hasPermission(perm: Permission): boolean {
    return this.permissionsSubject.value.includes(perm);
  }

  hasAnyRole(...roles: AppRole[]): boolean {
    return roles.some(r => this.hasRole(r));
  }

  get isAdmin(): boolean {
    return this.hasRole(AppRole.Admin);
  }

  get isModerator(): boolean {
    return this.hasRole(AppRole.Moderator);
  }

  get isTrans(): boolean {
    return this.hasRole(AppRole.Trans);
  }

  get hasAdminAccess(): boolean {
    return this.rolesSubject.value.some(r => ADMIN_ROLES.includes(r));
  }

  canDeleteManga(): boolean {
    return this.hasPermission(Permission.DeleteManga);
  }

  canManageUsers(): boolean {
    return this.hasPermission(Permission.ManageUsers);
  }

  canManageRoles(): boolean {
    return this.hasPermission(Permission.ManageRoles);
  }

  isOwnMangaOnly(): boolean {
    return this.hasPermission(Permission.ViewOwnMangaOnly) && !this.isAdmin && !this.isModerator;
  }

  /**
   * Chức năng: Kiểm tra truyện có thuộc về người đang đăng nhập không.
   * Yêu cầu: `manga` — item bất kỳ. API admin trả chủ sở hữu ở `owner.id`, các
   *   endpoint cũ trả `userId` ở cấp gốc — chấp nhận cả hai.
   * Kết quả trả về: true nếu trùng id người đang đăng nhập.
   * Exception: không ném — thiếu dữ liệu thì trả false.
   */
  private ownsManga(manga: any): boolean {
    const owner = manga?.owner?.id ?? manga?.userId;
    return !!owner && owner === this.auth.currentUser?.id;
  }

  canEditManga(manga: any): boolean {
    if (this.isAdmin || this.isModerator) return true;
    if (this.isTrans && this.ownsManga(manga)) return true;
    return false;
  }

  canDeleteSpecificManga(manga: any): boolean {
    if (this.isAdmin) return true;
    if (this.isTrans && this.ownsManga(manga)) return true;
    return false;
  }

  getRoleLabel(): string {
    const role = this.highestRole;
    switch (role) {
      case AppRole.Admin: return 'Admin';
      case AppRole.Moderator: return 'Moderator';
      case AppRole.Trans: return 'Translator';
      default: return '';
    }
  }

  getRoleBadgeClass(): string {
    const role = this.highestRole;
    switch (role) {
      case AppRole.Admin: return 'role-badge--admin';
      case AppRole.Moderator: return 'role-badge--mod';
      case AppRole.Trans: return 'role-badge--trans';
      default: return '';
    }
  }
}
