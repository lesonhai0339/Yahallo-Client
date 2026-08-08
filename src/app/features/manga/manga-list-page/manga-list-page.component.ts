import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { MangaService } from '../../../core/services/manga.service';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';
import { AuthorService } from '../../../core/services/author.service';
import { ArtistService } from '../../../core/services/artist.service';
import { MangaSumaryDto, MangaSortBy } from '../../../core/models/manga.interface';

/**
 * latest/popular = danh sách toàn site sắp theo tiêu chí; author/artist/tag =
 * cùng giao diện đó nhưng lọc theo một đối tượng (link "xem thêm" ở trang
 * /author/:id, /artist/:id, /tag/:id).
 */
type ListMode = 'latest' | 'new' | 'popular' | 'author' | 'artist' | 'tag';

@Component({
  selector: 'app-manga-list-page',
  templateUrl: './manga-list-page.component.html',
  styleUrls: ['./manga-list-page.component.scss']
})
export class MangaListPageComponent implements OnInit, OnDestroy {
  mangaList: MangaSumaryDto[] = [];
  displayList: MangaSumaryDto[] = [];
  isLoading = true;
  currentPage = 1;
  totalPages = 1;
  totalCount = 0;
  pageSize = 10;
  pageSizeOptions = [10, 20, 50];
  viewMode: 'list' | 'grid' = 'grid';
  /** true = gần nhất (descending), false = xa nhất (ascending) */
  sortDescending = true;

  titleKey = '';
  icon = '';
  mode: ListMode = 'latest';
  /** Tên đối tượng đang lọc (author/artist/tag) — hiện cạnh tiêu đề. Rỗng ở latest/popular. */
  subject = '';
  /** Link quay lại trang đối tượng; null ở latest/popular. */
  backLink: any[] | null = null;

  private entityId = '';
  private destroy$ = new Subject<void>();

  constructor(
    private mangaService: MangaService,
    private route: ActivatedRoute,
    private router: Router,
    private prefs: UserPreferencesService,
    private authorService: AuthorService,
    private artistService: ArtistService,
  ) {}

  ngOnInit(): void {
    this.pageSize = this.prefs.current.defaultPageSize;
    this.viewMode = this.prefs.current.defaultView;
    this.mode = this.route.snapshot.data['mode'] ?? 'latest';
    this.titleKey = this.route.snapshot.data['titleKey'] ?? 'HOME.LATEST_UPDATE';
    this.icon = this.route.snapshot.data['icon'] ?? 'fa-solid fa-clock-rotate-left';
    this.entityId = this.route.snapshot.paramMap.get('id') ?? '';

    if (this.isEntityMode) {
      this.backLink = [`/${this.mode}`, this.entityId];
      this.loadEntityName();
    }
    this.loadPage();
  }

  /** true khi trang đang lọc theo một tác giả / hoạ sĩ / thể loại. */
  get isEntityMode(): boolean {
    return this.mode === 'author' || this.mode === 'artist' || this.mode === 'tag';
  }

  /**
   * Chức năng: Lấy tên tác giả / hoạ sĩ / thể loại để hiện cạnh tiêu đề trang.
   * Yêu cầu: `entityId` + `mode` đã xác định (chỉ gọi ở chế độ lọc theo đối tượng).
   * Kết quả trả về: không (gán `subject`).
   * Exception: không ném — lỗi API thì để trống, tiêu đề vẫn hiển thị bình thường.
   */
  private loadEntityName(): void {
    if (this.mode === 'tag') {
      this.mangaService.getTagInfo(this.entityId).pipe(takeUntil(this.destroy$))
        .subscribe({ next: info => this.subject = info?.name ?? '', error: () => {} });
      return;
    }
    const svc = this.mode === 'author' ? this.authorService : this.artistService;
    svc.filter({ id: this.entityId, pageSize: 1 }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        const raw = res?.value ?? res;
        const item = (raw?.data ?? (Array.isArray(raw) ? raw : []))[0] ?? null;
        this.subject = item?.name ?? '';
      },
      error: () => {},
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadPage(): void {
    this.isLoading = true;
    // 'new' = mới THÊM vào site (CreateDate), khác 'latest' = mới RA CHƯƠNG (LastUpdate).
    const sortBy = this.mode === 'popular' ? MangaSortBy.ViewCount
      : this.mode === 'new' ? MangaSortBy.CreateDate
      : MangaSortBy.LastUpdate;
    const filters = this.mode === 'author' ? { authorId: this.entityId }
      : this.mode === 'artist' ? { artistId: this.entityId }
      : this.mode === 'tag' ? { tagIds: [this.entityId] }
      : undefined;
    const api$ = this.mangaService.getSortedPaginated(
      this.currentPage, this.pageSize, sortBy, this.sortDescending, filters,
    );
    api$.pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.mangaList = result.data;
          this.totalPages = result.totalPages;
          this.totalCount = result.totalCount;
          this.displayList = [...this.mangaList];
          this.isLoading = false;
        },
        error: () => { this.isLoading = false; }
      });
  }

  setViewMode(mode: 'list' | 'grid'): void {
    this.viewMode = mode;
  }

  setSortDirection(descending: boolean): void {
    if (descending === this.sortDescending) return;
    this.sortDescending = descending;
    this.currentPage = 1;
    this.loadPage();
  }

  setPageSize(size: number): void {
    if (size === this.pageSize) return;
    this.pageSize = size;
    this.currentPage = 1;
    this.loadPage();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages || page === this.currentPage) return;
    this.currentPage = page;
    this.loadPage();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  get paginationPages(): number[] {
    const pages: number[] = [];
    const delta = 2;
    const from = Math.max(1, this.currentPage - delta);
    const to = Math.min(this.totalPages, this.currentPage + delta);
    for (let i = from; i <= to; i++) pages.push(i);
    return pages;
  }

  goToTag(event: Event, tagId: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.router.navigate(['/search/advanced'], { queryParams: { tagId } });
  }

  formatViews(views: number): string {
    if (!views) return 'N/A';
    if (views >= 1_000_000) return (views / 1_000_000).toFixed(1) + 'M';
    if (views >= 1_000) return (views / 1_000).toFixed(1) + 'K';
    return views.toString();
  }
}
