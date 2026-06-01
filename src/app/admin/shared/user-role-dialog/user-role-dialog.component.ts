import { Component, Inject, OnInit } from '@angular/core';
import { FormControl } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { forkJoin } from 'rxjs';
import { AdminService } from '../../services/admin.service';
import { ToastrService } from 'ngx-toastr';

export interface UserRoleDialogData {
  userId: string;
  userName: string;
}

@Component({
  selector: 'app-user-role-dialog',
  templateUrl: './user-role-dialog.component.html',
  styles: [`
    .role-dialog { padding: 4px; min-width: 340px; }
    .role-dialog h2 { font-size: 1.1rem; font-weight: 600; margin-bottom: 4px; color: var(--text-primary); }
    .role-dialog .subtitle { font-size: 0.8rem; color: var(--text-muted); margin-bottom: 18px; }
    .section-label { font-size: 0.8rem; color: var(--text-secondary); font-weight: 500; margin-bottom: 8px; }
    .roles-current { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; min-height: 36px; }
    .role-chip { display: inline-flex; align-items: center; gap: 6px; background: rgba(233,69,96,0.15); border: 1px solid var(--accent-primary); color: var(--accent-primary); padding: 4px 10px; border-radius: 20px; font-size: 0.78rem; font-weight: 500; }
    .role-chip button { background: none; border: none; color: var(--accent-primary); cursor: pointer; padding: 0; font-size: 0.9rem; line-height: 1; }
    .no-roles { font-size: 0.82rem; color: var(--text-muted); font-style: italic; }
    .add-role-row { display: flex; gap: 8px; margin-bottom: 20px; }
    .lock-section { border-top: 1px solid var(--border-color); padding-top: 16px; }
    .lock-row { display: flex; gap: 8px; align-items: center; }
    .lock-row input { width: 80px; }
    .dialog-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px; border-top: 1px solid var(--border-color); padding-top: 16px; }
  `]
})
export class UserRoleDialogComponent implements OnInit {
  allRoles: any[] = [];
  userRoles: any[] = [];
  selectedRoleId = new FormControl('');
  lockDays = new FormControl(1);
  loading = true;

  constructor(
    private adminService: AdminService,
    private toastr: ToastrService,
    public dialogRef: MatDialogRef<UserRoleDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: UserRoleDialogData
  ) {}

  ngOnInit(): void {
    forkJoin({
      allRoles: this.adminService.getAllRoles(),
      userRoles: this.adminService.getUserRoles(this.data.userId)
    }).subscribe({
      next: ({ allRoles, userRoles }) => {
        this.allRoles = allRoles ?? [];
        this.userRoles = userRoles ?? [];
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  get availableRoles(): any[] {
    const assignedIds = this.userRoles.map(r => r.id ?? r.roleId);
    return this.allRoles.filter(r => !assignedIds.includes(r.id ?? r.roleId));
  }

  addRole(): void {
    const roleId = this.selectedRoleId.value;
    if (!roleId) return;
    this.adminService.addUserRole(this.data.userId, roleId).subscribe({
      next: () => {
        const role = this.allRoles.find(r => (r.id ?? r.roleId) === roleId);
        if (role) this.userRoles.push(role);
        this.selectedRoleId.setValue('');
        this.toastr.success('Đã thêm role');
      },
      error: () => this.toastr.error('Không thể thêm role')
    });
  }

  removeRole(role: any): void {
    const roleId = role.id ?? role.roleId;
    this.adminService.removeUserRole(this.data.userId, roleId).subscribe({
      next: () => {
        this.userRoles = this.userRoles.filter(r => (r.id ?? r.roleId) !== roleId);
        this.toastr.success('Đã xóa role');
      },
      error: () => this.toastr.error('Không thể xóa role')
    });
  }

  lockUser(): void {
    const days = this.lockDays.value ?? 1;
    this.adminService.lockUser(this.data.userId, days).subscribe({
      next: () => this.toastr.success(`Đã khóa tài khoản ${days} ngày`),
      error: () => this.toastr.error('Không thể khóa tài khoản')
    });
  }

  unlockUser(): void {
    this.adminService.unlockUser(this.data.userId).subscribe({
      next: () => this.toastr.success('Đã mở khóa tài khoản'),
      error: () => this.toastr.error('Không thể mở khóa tài khoản')
    });
  }

  getRoleName(role: any): string {
    return role.roleName ?? role.name ?? 'Unknown';
  }
}
