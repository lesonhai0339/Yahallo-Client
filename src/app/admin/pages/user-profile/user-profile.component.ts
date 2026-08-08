import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AdminService } from '../../services/admin.service';
import { AdminMangaService, DisplayMode } from '../../services/admin-manga.service';
import { MangaSortBy } from '../../../core/models/manga.interface';

/**
 * Trang hồ sơ một người dùng ở khu quản trị: thông tin tài khoản + danh sách
 * truyện họ đã đăng. Cố ý KHÔNG dùng lại giao diện bảng của `/admin/users` —
 * ở đây là hồ sơ của một người, nên trình bày dạng thẻ + lưới truyện.
 *
 * Vào bằng cách bấm tên người đăng ở cột "Người đăng" của `/admin/manga`.
 */
@Component({
  selector: 'app-user-profile',
  templateUrl: './user-profile.component.html',
  styleUrls: ['./user-profile.component.scss'],
})
export class UserProfileComponent implements OnInit, OnDestroy {
  userId = '';
  user: any = null;
  userLoading = true;
  notFound = false;

  mangas: any[] = [];
  mangaLoading = true;
  totalCount = 0;
  pageIndex = 0;
  pageSize = 12;

  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private adminService: AdminService,
    private mangaService: AdminMangaService,
  ) {}

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(pm => {
      const id = pm.get('id') ?? '';
      if (id && id !== this.userId) {
        this.userId = id;
        this.pageIndex = 0;
        this.loadUser();
        this.loadMangas();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Chức năng: Nạp thông tin tài khoản.
   * Yêu cầu: `userId` đã có.
   * Kết quả trả về: không (gán `user`, `userLoading`, `notFound`).
   * Exception: không ném — lỗi API thì bật `notFound`.
   */
  private loadUser(): void {
    this.userLoading = true;
    this.notFound = false;
    this.adminService.getUserDetail(this.userId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        const d = res?.value ?? res;
        if (!d) { this.notFound = true; this.userLoading = false; return; }
        this.user = {
          ...d,
          name: d.displayName ?? d.name ?? d.userName ?? 'Không tên',
          avatarUrl: d.avatar ?? d.avatarUrl ?? null,
        };
        this.userLoading = false;
      },
      error: () => { this.notFound = true; this.userLoading = false; },
    });
  }

  /**
   * Chức năng: Nạp danh sách truyện người này đã đăng, sắp theo lần cập nhật
   *   gần nhất — dùng chính `manga/admin/filter` với `OwnerId`.
   * Yêu cầu: `userId`, `pageIndex`, `pageSize`.
   * Kết quả trả về: không (gán `mangas`, `totalCount`, `mangaLoading`).
   * Exception: không ném — lỗi API thì trả danh sách rỗng.
   */
  private loadMangas(): void {
    this.mangaLoading = true;
    this.mangaService.filter({
      ownerId: this.userId,
      pageNo: this.pageIndex + 1,
      pageSize: this.pageSize,
      sortBy: MangaSortBy.LastUpdate,
      reverseSort: true,
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        const page = res?.value ?? res;
        const items = page?.data ?? page?.items ?? [];
        this.totalCount = page?.totalCount ?? items.length;
        this.mangas = items.map((m: any) => ({
          id: m.id,
          name: m.displayName ?? m.name,
          thumbnail: m.mangaThumbnail ?? null,
          totalChapters: m.totalChapter ?? 0,
          totalViews: m.totalView ?? 0,
          totalComments: m.totalComment ?? 0,
          rating: m.rating,
          updateDate: m.updateDate ?? null,
          hidden: m.mode === 0 || String(m.mode) === DisplayMode.Hidden,
        }));
        this.mangaLoading = false;
      },
      error: () => { this.mangas = []; this.totalCount = 0; this.mangaLoading = false; },
    });
  }

  /** Tổng số chương của mọi truyện TRONG TRANG hiện tại (không phải toàn bộ). */
  get chaptersOnPage(): number {
    return this.mangas.reduce((sum, m) => sum + (m.totalChapters || 0), 0);
  }

  /** Tổng lượt xem của mọi truyện TRONG TRANG hiện tại. */
  get viewsOnPage(): number {
    return this.mangas.reduce((sum, m) => sum + (m.totalViews || 0), 0);
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.totalCount / this.pageSize));
  }

  goPage(index: number): void {
    if (index < 0 || index >= this.totalPages || index === this.pageIndex) return;
    this.pageIndex = index;
    this.loadMangas();
  }

  goManga(manga: any): void {
    this.router.navigate(['/admin/manga/edit', manga.id]);
  }

  goAllManga(): void {
    this.router.navigate(['/admin/manga']);
  }

  goUserList(): void {
    this.router.navigate(['/admin/users']);
  }

  goAnalytics(): void {
    this.router.navigate(['/admin/users', this.userId, 'analytics']);
  }
}
