import { Component, OnInit, OnDestroy } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Subject, takeUntil } from 'rxjs';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { AdminService } from '../../services/admin.service';
import { UserRoleDialogComponent } from '../../shared/user-role-dialog/user-role-dialog.component';
import { SendNotificationDialogComponent } from '../../shared/send-notification-dialog/send-notification-dialog.component';
import { UserMessagesDialogComponent } from '../../shared/user-messages-dialog/user-messages-dialog.component';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';
import { ResetPasswordDialogComponent } from '../../shared/reset-password-dialog/reset-password-dialog.component';
import { PermissionService } from '../../../core/services/permission.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-user-list',
  templateUrl: './user-list.component.html',
  styleUrls: ['./user-list.component.scss']
})
export class UserListComponent implements OnInit, OnDestroy {
  /** Một trang người dùng đang hiển thị — mảng thường, không còn MatTableDataSource. */
  items: any[] = [];
  /** 'grid' = nhiều cột; 'list' = mỗi người một hàng. Khớp với /admin/manga. */
  viewMode: 'grid' | 'list' = 'grid';
  /** Ô tìm kiếm — lọc TẠI CHỖ trong trang hiện tại (endpoint chưa nhận tham số tìm). */
  searchTerm = '';
  totalCount = 0;
  pageSize = 20;
  pageIndex = 0;
  loading = false;
  selectedUser: any = null;
  detailLoading = false;
  readonly imgBase = environment.serviceApi;

  private destroy$ = new Subject<void>();

  constructor(
    private adminService: AdminService,
    private dialog: MatDialog,
    private router: Router,
    private toastr: ToastrService,
    public perm: PermissionService
  ) {}

  ngOnInit(): void {
    this.loadUsers();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Chức năng: Tải một trang người dùng từ endpoint admin (AdminUserDto).
   * Yêu cầu: `pageIndex` / `pageSize` đã đặt.
   * Kết quả trả về: không (cập nhật `items`, `totalCount`, `loading`).
   * Exception: không ném — lỗi API thì chỉ tắt `loading`.
   */
  loadUsers(): void {
    this.loading = true;
    this.adminService.getAllUsers(this.pageIndex + 1, this.pageSize).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        const d = res?.value ?? res;
        const items = d?.data ?? d?.items ?? (Array.isArray(d) ? d : []);
        this.totalCount = d?.totalCount ?? items.length;
        // AdminUserDto: DisplayName / Avatar / PhoneNumber / Status / Level / Roles.
        // `roleList` trước đây luôn rỗng vì endpoint cũ không trả roles.
        this.items = items.map((u: any) => ({
          ...u,
          name: u.displayName ?? u.name ?? u.userName,
          avatarUrl: u.avatar ?? null,
          phone: u.phoneNumber ?? u.phone ?? null,
          roleList: Array.isArray(u.roles) ? u.roles : (u.roles ? [u.roles] : []),
        }));
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  /** Lọc tại chỗ theo tên / email — endpoint chưa nhận tham số tìm kiếm. */
  get visibleUsers(): any[] {
    const q = this.searchTerm.trim().toLowerCase();
    if (!q) return this.items;
    return this.items.filter(u =>
      String(u.name ?? '').toLowerCase().includes(q) ||
      String(u.email ?? '').toLowerCase().includes(q));
  }

  get totalPages(): number {
    return this.pageSize > 0 ? Math.ceil(this.totalCount / this.pageSize) : 1;
  }

  goPage(index: number): void {
    if (index < 0 || index >= this.totalPages || index === this.pageIndex) return;
    this.pageIndex = index;
    this.loadUsers();
  }

  setPageSize(size: number): void {
    if (size === this.pageSize) return;
    this.pageSize = size;
    this.pageIndex = 0;
    this.loadUsers();
  }

  setViewMode(mode: 'grid' | 'list'): void {
    this.viewMode = mode;
  }

  /** Mở hồ sơ người dùng — tương ứng nút "Chi tiết" của /admin/manga. */
  goProfile(user: any): void {
    this.router.navigate(['/admin/users', user.id]);
  }


  selectUser(user: any): void {
    if (this.selectedUser?.id === user.id) { this.selectedUser = null; return; }
    // Hiển thị ngay dữ liệu list, rồi nạp chi tiết đầy đủ từ /user/detail và gộp vào.
    this.selectedUser = user;
    this.loadUserDetail(user.id);
  }

  private loadUserDetail(id: string): void {
    this.detailLoading = true;
    this.adminService.getUserDetail(id).subscribe({
      next: (res: any) => {
        const d = res?.value ?? res;   // UserDetailDto
        if (d && this.selectedUser?.id === (d.id ?? id)) {
          this.selectedUser = {
            ...this.selectedUser,
            ...d,
            name: d.displayName ?? this.selectedUser.name,
            avatarUrl: d.avatar ?? this.selectedUser.avatarUrl,
          };
        }
        this.detailLoading = false;
      },
      error: () => { this.detailLoading = false; },
    });
  }

  /** Họ tên đầy đủ (firstName + lastName) nếu có. */
  fullName(u: any): string {
    return [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim();
  }

  /** UserStatus: None=1 (bình thường), Lock=2 (bị khóa). */
  userStatusLabel(status: any): string {
    const map: Record<string, string> = { '1': 'Bình thường', '2': 'Bị khóa', 'None': 'Bình thường', 'Lock': 'Bị khóa' };
    return map[String(status)] ?? '—';
  }

  userStatusClass(status: any): string {
    return (String(status) === '2' || String(status) === 'Lock') ? 'status--locked' : 'status--active';
  }

  openRoleDialog(user: any): void {
    if (!this.perm.canManageRoles()) {
      this.toastr.warning('Bạn không có quyền quản lý role');
      return;
    }
    this.dialog.open(UserRoleDialogComponent, {
      width: '480px',
      panelClass: 'light-dialog',
      data: { userId: user.id, userName: user.name ?? user.userName }
    });
  }

  goAnalytics(user: any): void {
    this.router.navigate(['/admin/users', user.id, 'analytics']);
  }

  getInitials(name: string): string {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  }

  getRoleBadge(role: string): string {
    const map: Record<string, string> = { Admin: 'admin', Moderator: 'mod', User: 'user' };
    return map[role] ?? 'user';
  }

  openSendNotification(user: any): void {
    this.dialog.open(SendNotificationDialogComponent, {
      width: '540px',
      panelClass: 'light-dialog',
      data: { userId: user.id, userName: user.name ?? user.userName }
    });
  }

  openMessages(user: any, tab: 'feedback' | 'conversation' = 'feedback'): void {
    this.dialog.open(UserMessagesDialogComponent, {
      width: '620px',
      maxWidth: '95vw',
      panelClass: 'light-dialog',
      data: { userId: user.id, userName: user.name ?? user.userName, initialTab: tab }
    });
  }

  resetPassword(user: any): void {
    this.dialog.open(ResetPasswordDialogComponent, {
      width: '440px',
      panelClass: 'light-dialog',
      disableClose: true,
      data: { userId: user.id, userName: user.name ?? user.userName }
    });
  }
}
