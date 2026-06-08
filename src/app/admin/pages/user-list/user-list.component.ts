import { Component, OnInit, ViewChild, AfterViewInit } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatDialog } from '@angular/material/dialog';
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
export class UserListComponent implements OnInit, AfterViewInit {
  displayedColumns = ['avatar', 'name', 'email', 'roles', 'actions'];
  dataSource = new MatTableDataSource<any>([]);
  totalCount = 0;
  pageSize = 20;
  pageIndex = 0;
  loading = false;
  selectedUser: any = null;
  readonly imgBase = environment.serviceApi;

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

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

  ngAfterViewInit(): void {
    this.dataSource.sort = this.sort;
  }

  loadUsers(): void {
    this.loading = true;
    this.adminService.getAllUsers(this.pageIndex + 1, this.pageSize).subscribe({
      next: (res: any) => {
        const d = res?.value ?? res;
        const items = d?.data ?? d?.items ?? (Array.isArray(d) ? d : []);
        this.totalCount = d?.totalCount ?? items.length;
        this.dataSource.data = items.map((u: any) => ({
          ...u,
          avatarUrl:  u.avatar ?? null,
          roleList: []
        }));
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  onPageChange(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadUsers();
  }

  applyFilter(event: Event): void {
    this.dataSource.filter = (event.target as HTMLInputElement).value.trim().toLowerCase();
  }

  selectUser(user: any): void {
    this.selectedUser = this.selectedUser?.id === user.id ? null : user;
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
