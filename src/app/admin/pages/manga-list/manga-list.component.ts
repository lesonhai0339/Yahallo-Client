import { Component, OnInit, ViewChild, AfterViewInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { AdminMangaService } from '../../services/admin-manga.service';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';
import { PermissionService } from '../../../core/services/permission.service';
import { AuthService } from '../../../core/services/auth.service';

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
  /** Mobile: id of the card whose details/actions dropdown is open. */
  expandedId: string | null = null;
  /** Desktop: manga whose detail card is shown in the right aside. */
  selectedManga: any = null;
  /** Full detail (authors/artists/description) of the selected manga. */
  detail: any = null;
  detailLoading = false;

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  constructor(
    private mangaService: AdminMangaService,
    private dialog: MatDialog,
    private router: Router,
    private toastr: ToastrService,
    public perm: PermissionService,
    private auth: AuthService
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
        let items = d?.data ?? d?.items ?? [];

        if (this.perm.isOwnMangaOnly()) {
          const userId = this.auth.currentUser?.id;
          items = items.filter((m: any) => m.userId === userId);
        }

        this.totalCount = this.perm.isOwnMangaOnly() ? items.length : (d?.totalCount ?? 0);
        // API trả MangaDto: displayName / viewCount / lastestChapter... nhưng
        // template card + bảng đọc name / totalViews / totalChapters / updateDate.
        this.dataSource.data = items.map((m: any) => ({
          ...m,
          name: m.displayName ?? m.name,
          thumbnail: m.mangaThumbnail ?? null,
          totalViews: m.viewCount ?? m.totalViews ?? 0,
          totalChapters: m.lastestChapter?.index ?? m.totalChapters ?? 0,
          updateDate: m.lastestChapter?.createDate ?? m.updateDate ?? null,
        }));
        this.loading = false;
        // Mặc định chọn phần tử đầu để hiển thị card chi tiết bên phải.
        const first = this.dataSource.data[0];
        if (first) {
          this.selectManga(first, false);
        } else {
          this.selectedManga = null;
          this.detail = null;
        }
      },
      error: () => { this.loading = false; }
    });
  }

  /** Chọn manga để hiện card chi tiết. toggle=true: click lại thì bỏ chọn. */
  selectManga(manga: any, toggle = true): void {
    if (toggle && this.selectedManga?.id === manga.id) {
      this.selectedManga = null;
      this.detail = null;
      return;
    }
    this.selectedManga = manga;
    this.loadDetail(manga.id);
  }

  private loadDetail(id: string): void {
    this.detail = null;
    this.detailLoading = true;
    this.mangaService.getDetail(id).subscribe({
      next: (res: any) => {
        const d = res?.value ?? res;
        this.detail = d;
        // Gộp dữ liệu chi tiết (displayName, tags, description, authors, artists...)
        // vào selectedManga để card hiển thị đầy đủ; giữ id đúng của dòng đang chọn.
        if (d && this.selectedManga?.id === d.id) {
          this.selectedManga = {
            ...this.selectedManga,
            ...d,
            name: d.displayName ?? this.selectedManga.name,
            thumbnail: d.mangaThumbnail ?? this.selectedManga.thumbnail,
          };
        }
        this.detailLoading = false;
      },
      error: () => { this.detailLoading = false; }
    });
  }

  authorNames(d: any): string {
    return (d?.authors ?? []).map((a: any) => a.name).join(', ');
  }

  artistNames(d: any): string {
    return (d?.artists ?? []).map((a: any) => a.name).join(', ');
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

  toggleExpand(manga: any): void {
    this.expandedId = this.expandedId === manga.id ? null : manga.id;
  }

  goCreate(): void {
    this.router.navigate(['/admin/manga/create']);
  }

  goEdit(manga: any): void {
    if (!this.perm.canEditManga(manga)) {
      this.toastr.warning('Bạn không có quyền chỉnh sửa truyện này');
      return;
    }
    this.router.navigate(['/admin/manga/edit', manga.id]);
  }

  goChapters(manga: any): void {
    if (!this.perm.canEditManga(manga)) {
      this.toastr.warning('Bạn không có quyền quản lý chương này');
      return;
    }
    this.router.navigate(['/admin/manga', manga.id, 'chapters']);
  }

  goAnalytics(manga: any): void {
    this.router.navigate(['/admin/manga', manga.id, 'analytics']);
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

  getStatusClass(status: any): string {
    const map: Record<string, string> = {
      // Enum số backend: Active=1, Paused=2, Finished=3
      '1': 'status--ongoing', '2': 'status--hiatus', '3': 'status--completed',
      // Nhãn chuỗi cũ (tương thích)
      'Ongoing': 'status--ongoing', 'Completed': 'status--completed',
      'Hiatus': 'status--hiatus', 'Hidden': 'status--hidden',
    };
    return map[String(status)] ?? '';
  }

  getStatusLabel(status: any): string {
    const map: Record<string, string> = {
      '1': 'Đang ra', '2': 'Tạm dừng', '3': 'Hoàn thành',
      'Ongoing': 'Đang ra', 'Completed': 'Hoàn thành', 'Hiatus': 'Tạm dừng', 'Hidden': 'Đã ẩn',
    };
    return map[String(status)] ?? String(status ?? '—');
  }

  /** MangaType backend: Oneshot=1, Ova=2, Dojinshi=3, Series=4. */
  getTypeLabel(type: any): string {
    const map: Record<string, string> = {
      '1': 'Oneshot', '2': 'OVA', '3': 'Dojinshi', '4': 'Series',
    };
    return map[String(type)] ?? String(type ?? '—');
  }

  get pageTitle(): string {
    if (this.perm.isOwnMangaOnly()) return 'Truyện của tôi';
    return 'Quản lý Truyện';
  }
}
