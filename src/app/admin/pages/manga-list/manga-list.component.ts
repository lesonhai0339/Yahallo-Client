import { Component, OnInit, ViewChild, AfterViewInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { AdminMangaService } from '../../services/admin-manga.service';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-manga-list',
  templateUrl: './manga-list.component.html',
  styleUrls: ['./manga-list.component.scss']
})
export class MangaListComponent implements OnInit, AfterViewInit {
  displayedColumns = ['thumbnail', 'name', 'type', 'status', 'totalChapters', 'totalViews', 'updateDate', 'actions'];
  dataSource = new MatTableDataSource<any>([]);
  totalCount = 0;
  pageSize = 20;
  pageIndex = 0;
  filterValue = '';
  loading = false;

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  constructor(
    private mangaService: AdminMangaService,
    private dialog: MatDialog,
    private router: Router,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    this.loadData();
  }

  ngAfterViewInit(): void {
    this.dataSource.sort = this.sort;
  }

  loadData(): void {
    this.loading = true;
    this.mangaService.getAll(this.pageIndex + 1, this.pageSize).subscribe({
      next: (res: any) => {
        const d = res?.value ?? res;
        const items = d?.data ?? d?.items ?? [];
        this.totalCount = d?.totalCount ?? 0;
        this.dataSource.data = items.map((m: any) => ({
          ...m,
          thumbnail: m.thumbnail ?? null
        }));
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  onPageChange(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadData();
  }

  applyFilter(event: Event): void {
    const value = (event.target as HTMLInputElement).value.trim().toLowerCase();
    this.dataSource.filter = value;
  }

  goCreate(): void {
    this.router.navigate(['/admin/manga/create']);
  }

  goEdit(manga: any): void {
    this.router.navigate(['/admin/manga/edit', manga.id]);
  }

  goChapters(manga: any): void {
    this.router.navigate(['/admin/manga', manga.id, 'chapters']);
  }

  toggleStatus(manga: any): void {
    const newStatus = manga.status === 'Hidden' ? 'Ongoing' : 'Hidden';
    this.mangaService.updateStatus(manga.id, newStatus).subscribe({
      next: () => {
        manga.status = newStatus;
        this.toastr.success(`Đã ${newStatus === 'Hidden' ? 'ẩn' : 'hiện'} truyện`);
      },
      error: () => this.toastr.error('Không thể cập nhật trạng thái')
    });
  }

  deleteManga(manga: any): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '360px',
      data: {
        title: 'Xóa truyện',
        message: `Bạn có chắc muốn xóa "${manga.name}"? Hành động này không thể hoàn tác.`,
        confirmText: 'Xóa',
        danger: true
      }
    });

    ref.afterClosed().subscribe(confirmed => {
      if (!confirmed) return;
      this.mangaService.delete(manga.id).subscribe({
        next: () => {
          this.toastr.success('Đã xóa truyện');
          this.loadData();
        },
        error: () => this.toastr.error('Không thể xóa truyện')
      });
    });
  }

  getStatusClass(status: string): string {
    const map: Record<string, string> = {
      'Ongoing': 'status--ongoing',
      'Completed': 'status--completed',
      'Hiatus': 'status--hiatus',
      'Hidden': 'status--hidden',
    };
    return map[status] ?? '';
  }

  getStatusLabel(status: string): string {
    const map: Record<string, string> = {
      'Ongoing': 'Đang ra',
      'Completed': 'Hoàn thành',
      'Hiatus': 'Tạm dừng',
      'Hidden': 'Đã ẩn',
    };
    return map[status] ?? status;
  }
}
