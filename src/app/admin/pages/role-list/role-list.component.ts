import { Component, OnInit, OnDestroy } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { Subject, takeUntil } from 'rxjs';
import { AdminRoleService, AdminRole } from '../../services/admin-role.service';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';
import { AppRole, Permission, ROLE_PERMISSIONS } from '../../../core/models/permission.model';

/**
 * ⚠️ MODULE MỚI THÊM — xem `docs/ADMIN_MODULES_ADDED.md`.
 *
 * Quản lý Role: CRUD role (API thật /role/*) + ma trận quyền tham chiếu.
 *
 * LƯU Ý: ma trận quyền hiển thị là hằng số PHÍA CLIENT (ROLE_PERMISSIONS trong
 * core/models/permission.model.ts), không phải cấu hình lấy từ backend. Nó chỉ
 * để tra cứu "role nào làm được gì"; sửa quyền phải sửa trong permission.model.ts.
 */
@Component({
  selector: 'app-role-list',
  templateUrl: './role-list.component.html',
  styleUrls: ['./role-list.component.scss']
})
export class RoleListComponent implements OnInit, OnDestroy {
  roles: AdminRole[] = [];
  isLoading = false;
  busyId: string | null = null;

  // Form thêm/sửa inline (không cần dialog riêng cho gọn).
  showForm = false;
  editingId: string | null = null;
  nameInput = '';
  descInput = '';
  saving = false;

  /** Ma trận quyền tham chiếu (client-side). */
  readonly matrixRoles: AppRole[] = [AppRole.Admin, AppRole.Moderator, AppRole.Trans, AppRole.User];
  readonly allPermissions: Permission[] = Object.values(Permission);
  readonly permLabels: Record<string, string> = {
    [Permission.ViewDashboard]:     'Xem dashboard',
    [Permission.ManageManga]:       'Quản lý truyện',
    [Permission.CreateManga]:       'Tạo truyện',
    [Permission.EditManga]:         'Sửa truyện',
    [Permission.DeleteManga]:       'Xoá truyện',
    [Permission.ManageChapters]:    'Quản lý chương',
    [Permission.ManageUsers]:       'Quản lý user',
    [Permission.ManageRoles]:       'Quản lý role',
    [Permission.LockUsers]:         'Khoá user',
    [Permission.ViewAnalytics]:     'Xem thống kê',
    [Permission.ViewOwnMangaOnly]:  'Chỉ xem truyện của mình',
    [Permission.ManageTaxonomy]:    'Quản lý tag/tác giả',
    [Permission.RequestTaxonomy]:   'Gửi yêu cầu tag/tác giả',
    [Permission.ModerateComments]:  'Kiểm duyệt bình luận',
  };

  private destroy$ = new Subject<void>();

  constructor(
    private roleService: AdminRoleService,
    private dialog: MatDialog,
    private toastr: ToastrService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.isLoading = true;
    this.roleService.getRoles(1, 50).pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        this.roles = res.data;
        this.isLoading = false;
        // Đếm user mỗi role (best-effort, xem chú thích trong service).
        this.roles.forEach(r => {
          this.roleService.countUsersInRole(r.id)
            .pipe(takeUntil(this.destroy$))
            .subscribe(n => r.userCount = n);
        });
      },
      error: () => { this.isLoading = false; },
    });
  }

  openCreate(): void {
    this.showForm = true;
    this.editingId = null;
    this.nameInput = '';
    this.descInput = '';
  }

  openEdit(r: AdminRole): void {
    this.showForm = true;
    this.editingId = r.id;
    this.nameInput = r.name;
    this.descInput = r.description ?? '';
  }

  cancelForm(): void {
    this.showForm = false;
    this.editingId = null;
    this.nameInput = '';
    this.descInput = '';
  }

  save(): void {
    const name = this.nameInput.trim();
    if (!name) { this.toastr.warning('Nhập tên role'); return; }
    this.saving = true;
    const done = () => { this.saving = false; this.cancelForm(); this.load(); };
    const fail = () => { this.saving = false; this.toastr.error('Lưu thất bại'); };

    if (this.editingId) {
      this.roleService.update({ id: this.editingId, name, description: this.descInput.trim() || undefined })
        .pipe(takeUntil(this.destroy$))
        .subscribe({ next: () => { this.toastr.success('Đã cập nhật role'); done(); }, error: fail });
    } else {
      this.roleService.create({ name, description: this.descInput.trim() || undefined })
        .pipe(takeUntil(this.destroy$))
        .subscribe({ next: () => { this.toastr.success('Đã tạo role'); done(); }, error: fail });
    }
  }

  askDelete(r: AdminRole): void {
    this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Xoá role',
        message: `Xoá role "${r.name}"? User đang gán role này sẽ mất quyền tương ứng.`,
        confirmText: 'Xoá',
      },
    }).afterClosed().subscribe(ok => { if (ok) this.remove(r); });
  }

  private remove(r: AdminRole): void {
    this.busyId = r.id;
    this.roleService.delete(r.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.busyId = null; this.toastr.success('Đã xoá role'); this.load(); },
      error: () => { this.busyId = null; this.toastr.error('Xoá thất bại'); },
    });
  }

  /** Role (theo hằng client) có quyền này không? */
  roleHas(role: AppRole, p: Permission): boolean {
    return (ROLE_PERMISSIONS[role] ?? []).includes(p);
  }

  permLabel(p: Permission): string {
    return this.permLabels[p] ?? p;
  }

  trackById = (_: number, r: AdminRole) => r.id;
}
