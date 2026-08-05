import { Component, OnInit, OnDestroy, HostListener, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { MasterDataService } from '../../core/services/master-data.service';
import { MangaService } from '../../core/services/manga.service';
import { MangaSumaryDto, TopMangaDto } from '../../core/models/manga.interface';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit, OnDestroy {
  latestManga: MangaSumaryDto[] = [];
  popularManga: MangaSumaryDto[] = [];
  /** Truyện mới — nằm sẵn trong payload homepage, không gọi API riêng. */
  newManga: MangaSumaryDto[] = [];
  categories: any[] = [];
  randomCategories: any[] = [];
  isLoading = true;

  topByDay: TopMangaDto[] = [];
  topByMonth: TopMangaDto[] = [];
  topByYear: TopMangaDto[] = [];
  topListPeriod: 'day' | 'month' | 'year' = 'month';

  /**
   * Mặc định desktop khi render ở server (không có `window`). Client chỉnh lại
   * trong `ngOnInit` sau khi hydrate.
   */
  isMobile = false;
  isCategoriesCollapsed = false;
  isTopListCollapsed = false;

  private destroy$ = new Subject<void>();

  constructor(
    private masterData: MasterDataService,
    private mangaService: MangaService,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {}

  /**
   * Chức năng: Xác định khổ màn hình rồi nạp dữ liệu trang chủ. Phần đọc
   *   `window` phải nằm sau guard: ở server không có `window`, để trần thì
   *   `ngOnInit` ném lỗi và `loadData()` phía dưới không bao giờ chạy — SSR ra
   *   trang rỗng toàn skeleton.
   * Yêu cầu: không.
   * Kết quả trả về: không (cập nhật `isMobile`, các cờ collapse tại chỗ).
   * Exception: không ném.
   */
  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.isMobile = window.innerWidth <= 992;
      if (this.isMobile) {
        this.isCategoriesCollapsed = true;
        this.isTopListCollapsed = true;
      }
    }
    this.loadData();
  }

  @HostListener('window:resize')
  onResize(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.isMobile = window.innerWidth <= 992;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadData(): void {
    this.isLoading = true;

    this.masterData.categories$.pipe(takeUntil(this.destroy$)).subscribe(c => {
      this.categories = c;
      this.randomCategories = [...c].sort(() => Math.random() - 0.5).slice(0, 20);
    });

    this.masterData.homepage$.pipe(takeUntil(this.destroy$)).subscribe({
      next: (homepage) => {
        this.newManga = homepage.newManga || [];
        this.latestManga = homepage.lastUpdate || [];
        this.popularManga = homepage.popular || [];
        this.topByDay = homepage.topMangaByDate || [];
        this.topByMonth = homepage.topMangaByMonth || [];
        this.topByYear = homepage.topMangaByYear || [];
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
      }
    });
  }

  get currentTopList(): TopMangaDto[] {
    switch (this.topListPeriod) {
      case 'day': return this.topByDay;
      case 'month': return this.topByMonth;
      case 'year': return this.topByYear;
    }
  }

  onTopListPeriodChange(period: 'day' | 'month' | 'year'): void {
    this.topListPeriod = period;
  }

  /** Top list is a dropdown on mobile only; desktop always shows it in full. */
  toggleTopList(): void {
    if (this.isMobile) this.isTopListCollapsed = !this.isTopListCollapsed;
  }
}
