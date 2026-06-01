import { Component, OnInit, ViewChild, AfterViewInit } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { AdminService } from '../../services/admin.service';
import { UserRoleDialogComponent } from '../../shared/user-role-dialog/user-role-dialog.component';
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
  readonly imgBase = environment.serviceApi;

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  constructor(
    private adminService: AdminService,
    private dialog: MatDialog,
    private toastr: ToastrService
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
          avatarUrl: u.avatarUri ? `data:image/png;base64,${u.avatarUri}` :
                     u.avatar ? `${this.imgBase}/image?filepath=${u.avatar}` : null,
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

  openRoleDialog(user: any): void {
    this.dialog.open(UserRoleDialogComponent, {
      width: '480px',
      data: { userId: user.id, userName: user.name ?? user.userName }
    });
  }

  getInitials(name: string): string {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  }
}
