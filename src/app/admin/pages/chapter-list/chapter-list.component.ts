import { Component, OnInit, ViewChild, AfterViewInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { AdminMangaService } from '../../services/admin-manga.service';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';
import { ChapterFormDialogComponent } from '../../shared/chapter-form-dialog/chapter-form-dialog.component';

@Component({
  selector: 'app-chapter-list',
  templateUrl: './chapter-list.component.html',
  styleUrls: ['./chapter-list.component.scss']
})
export class ChapterListComponent implements OnInit, AfterViewInit {
  displayedColumns = ['index', 'title', 'createDate', 'actions'];
  dataSource = new MatTableDataSource<any>([]);
  mangaId = '';
  manga: any = null;
  totalCount = 0;
  pageSize = 50;
  pageIndex = 0;
  loading = false;

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private mangaService: AdminMangaService,
    private dialog: MatDialog,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    this.mangaId = this.route.snapshot.paramMap.get('mangaId') ?? '';
    this.loadChapters();
    this.loadMangaDetail();
  }

  ngAfterViewInit(): void {
    this.dataSource.sort = this.sort;
    this.dataSource.paginator = this.paginator;
  }

  loadMangaDetail(): void {
    if (!this.mangaId) return;
    this.mangaService.getDetail(this.mangaId).subscribe({
      next: (res: any) => {
        this.manga = res?.value ?? res;
      },
      error: () => {}
    });
  }

  loadChapters(): void {
    if (!this.mangaId) return;
    this.loading = true;
    this.mangaService.getChapters(this.mangaId, this.pageIndex + 1, this.pageSize).subscribe({
      next: (res: any) => {
        const d = res?.value ?? res;
        const items = d?.data ?? d?.items ?? (Array.isArray(d) ? d : []);
        this.totalCount = d?.totalCount ?? items.length;
        this.dataSource.data = items.sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0));
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  onPageChange(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadChapters();
  }

  applyFilter(event: Event): void {
    this.dataSource.filter = (event.target as HTMLInputElement).value.trim().toLowerCase();
  }

  openAddDialog(): void {
    const ref = this.dialog.open(ChapterFormDialogComponent, {
      width: '760px',
      maxWidth: '95vw',
      panelClass: 'light-dialog',
      data: { mangaId: this.mangaId }
    });
    ref.afterClosed().subscribe(result => { if (result) this.loadChapters(); });
  }

  openEditDialog(chapter: any): void {
    const ref = this.dialog.open(ChapterFormDialogComponent, {
      width: '760px',
      maxWidth: '95vw',
      panelClass: 'light-dialog',
      data: { mangaId: this.mangaId, chapter }
    });
    ref.afterClosed().subscribe(result => { if (result) this.loadChapters(); });
  }

  deleteChapter(chapter: any): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '360px',
      data: {
        title: 'Xóa chương',
        message: `Xóa "${chapter.title || 'Chapter ' + chapter.index}"?`,
        confirmText: 'Xóa',
        danger: true
      }
    });
    ref.afterClosed().subscribe(confirmed => {
      if (!confirmed) return;
      this.mangaService.deleteChapter(chapter.id).subscribe({
        next: () => { this.toastr.success('Đã xóa chương'); this.loadChapters(); },
        error: () => this.toastr.error('Không thể xóa chương')
      });
    });
  }

  getThumbnailUrl(path: string): string {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return this.mangaService.imgUrl(path);
  }

  formatNumber(n: number): string {
    if (!n) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  }

  goBack(): void {
    this.router.navigate(['/admin/manga']);
  }
}
