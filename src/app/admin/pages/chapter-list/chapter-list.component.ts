import { Component, OnInit, OnDestroy, ViewChild, AfterViewInit } from '@angular/core';
import { Subject, forkJoin, map, takeUntil } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { AdminMangaService } from '../../services/admin-manga.service';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';
import { ChapterFormDialogComponent } from '../../shared/chapter-form-dialog/chapter-form-dialog.component';
import { ChapterImageService } from '../../services/chapter-image.service';
import { chapterName, chapterNumber } from '../../../core/utils/chapter-label';

/** Một lỗi dữ liệu tìm thấy khi quét chương. */
export interface ChapterIssue {
  /** Rỗng với lỗi ở cấp danh sách (vd trùng số chương) — không trỏ về chương nào. */
  chapterId: string;
  label: string;
  kind: string;
  detail: string;
}

@Component({
  selector: 'app-chapter-list',
  templateUrl: './chapter-list.component.html',
  styleUrls: ['./chapter-list.component.scss']
})
export class ChapterListComponent implements OnInit, OnDestroy, AfterViewInit {
  /** Quét lỗi chương — trạng thái và kết quả. */
  scanning = false;
  scanDone = false;
  scanIssues: ChapterIssue[] = [];

  private destroy$ = new Subject<void>();

  /** Nhãn chương dựng từ index/subIndex (title là mô tả, có thể rỗng). */
  readonly chapterNumber = chapterNumber;
  readonly chapterName = chapterName;

  displayedColumns = ['index', 'title', 'createDate', 'actions'];
  dataSource = new MatTableDataSource<any>([]);
  mangaId = '';
  manga: any = null;
  totalCount = 0;
  pageSize = 50;
  pageIndex = 0;
  loading = false;
  /** Cột phải (thẻ thông tin truyện) nạp riêng, có skeleton riêng. */
  mangaLoading = false;

  @ViewChild(MatPaginator) paginator!: MatPaginator;

  /**
   * Bảng bị `*ngIf` che trong lúc hiện skeleton nên `MatSort` chưa tồn tại ở
   * `ngAfterViewInit` — phải nhận qua setter để nối lại đúng lúc bảng render.
   */
  @ViewChild(MatSort) set sortRef(sort: MatSort | undefined) {
    if (sort) this.dataSource.sort = sort;
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private mangaService: AdminMangaService,
    private dialog: MatDialog,
    private toastr: ToastrService,
    private chapterImages: ChapterImageService,
  ) {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * ⚠️ MODULE MỚI THÊM — mo trang quan ly anh cua chuong
   * (docs/ADMIN_MODULES_ADDED.md).
   */
  manageImages(chapter: any): void {
    this.router.navigate(['/admin/chapter', chapter.id, 'images'], {
      queryParams: {
        mangaId: this.mangaId,
        index: chapter.index,
        subIndex: chapter.subIndex ?? 0,
        title: chapter.title ?? '',
      },
    });
  }

  ngOnInit(): void {
    this.mangaId = this.route.snapshot.paramMap.get('mangaId') ?? '';
    this.loadChapters();
    this.loadMangaDetail();
  }

  ngAfterViewInit(): void {
    // `mat-paginator` nằm ngoài `*ngIf` nên luôn sẵn sàng ở đây; `sort` do setter lo.
    this.dataSource.paginator = this.paginator;
  }

  loadMangaDetail(): void {
    if (!this.mangaId) return;
    this.mangaLoading = true;
    this.mangaService.getDetail(this.mangaId).subscribe({
      next: (res: any) => {
        this.manga = res?.value ?? res;
        this.mangaLoading = false;
      },
      error: () => { this.mangaLoading = false; }
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
        // Chương phụ: 10.5 → `index: 10`, `subIndex: 5`. Server trả `null` cho
        // chương thường nên phải `?? 0` (bản công khai cũng xử lý y hệt).
        this.dataSource.data = items
          .map((c: any) => ({ ...c, subIndex: c.subIndex ?? 0 }))
          .sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0));
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  /**
   * Mở trang ảnh từ kết quả quét. Phải tra ngược chương trong `dataSource` chứ
   * không dựng `{ id }` rỗng: `manageImages()` còn đọc `index`/`subIndex`/`title`
   * để gắn query param, thiếu thì trang ảnh mở ra không có tiêu đề chương.
   */
  goToIssueImages(chapterId: string): void {
    const chapter = this.dataSource.data.find((c: any) => c.id === chapterId);
    if (chapter) this.manageImages(chapter);
  }

  // ── Quét lỗi chương ─────────────────────────────────────────────────────────
  /**
   * Chức năng: soát các chương ĐANG HIỂN THỊ tìm lỗi dữ liệu — chương rỗng ảnh,
   *   ảnh thiếu kích thước, trùng số thứ tự ảnh, và trùng số chương.
   *
   *   Chỉ quét trang hiện tại chứ không quét cả bộ: mỗi chương tốn một lời gọi
   *   `getImages`, quét truyện 300 chương là 300 request cùng lúc.
   *
   *   Ảnh thiếu `width`/`height` là lỗi đáng tìm nhất — trang đọc dựa vào hai
   *   trường này để chừa chỗ trước, thiếu thì ảnh nhảy khi cuộn.
   * Yêu cầu: `dataSource.data` đã có chương; không cần tham số.
   * Kết quả trả về: không (đổ vào `scanIssues`, bật/tắt `scanning`).
   * Exception: không ném — chương lỗi mạng bị `chapterImages.getImages` nuốt
   *   thành mảng rỗng nên sẽ hiện như "không có ảnh".
   */
  scanChapters(): void {
    const chapters = this.dataSource.data;
    if (!chapters.length || this.scanning) return;

    this.scanning = true;
    this.scanIssues = [];
    this.scanDone = false;

    // Trùng số chương tính ngay tại chỗ, không tốn request nào.
    const seen = new Map<string, number>();
    for (const c of chapters) {
      const key = `${c.index ?? 0}.${c.subIndex ?? 0}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }

    forkJoin(
      chapters.map((c: any) => this.chapterImages.getImages(c.id).pipe(
        map(imgs => ({ chapter: c, imgs })),
      )),
    ).pipe(takeUntil(this.destroy$)).subscribe(results => {
      const issues: ChapterIssue[] = [];

      for (const { chapter, imgs } of results) {
        const label = chapterName(chapter);

        if (!imgs.length) {
          issues.push({ chapterId: chapter.id, label, kind: 'Không có ảnh',
            detail: 'Chương rỗng, hoặc không tải được danh sách ảnh' });
          continue;
        }

        const noSize = imgs.filter(i => !i.width || !i.height).length;
        if (noSize) {
          issues.push({ chapterId: chapter.id, label, kind: 'Thiếu kích thước ảnh',
            detail: `${noSize}/${imgs.length} ảnh không có width/height` });
        }

        const indexes = imgs.map(i => i.index);
        if (new Set(indexes).size !== indexes.length) {
          issues.push({ chapterId: chapter.id, label, kind: 'Trùng số trang',
            detail: 'Có hai ảnh trở lên cùng một `index`' });
        }
      }

      for (const [key, count] of seen) {
        if (count > 1) {
          issues.push({ chapterId: '', label: `Chương ${key.replace(/\.0$/, '')}`,
            kind: 'Trùng số chương', detail: `${count} chương cùng số thứ tự` });
        }
      }

      this.scanIssues = issues;
      this.scanDone = true;
      this.scanning = false;
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
        message: `Xóa "${this.chapterName(chapter)}"?`,
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

  /**
   * Chức năng: Quay về trang thông tin của chính truyện này, không phải danh
   *   sách — người dùng vào đây từ `manga-info` nên quay lại phải về đúng chỗ đó.
   * Yêu cầu: `mangaId` đã lấy từ route.
   * Kết quả trả về: không (điều hướng).
   * Exception: không ném — thiếu id thì về danh sách.
   */
  goBack(): void {
    if (this.mangaId) this.router.navigate(['/admin/manga', this.mangaId, 'info']);
    else this.router.navigate(['/admin/manga']);
  }
}
