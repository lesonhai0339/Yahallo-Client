import { Component, OnInit, OnDestroy, ElementRef, HostListener, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SeoService } from '../../../core/services/seo.service';
import { Subject, debounceTime, takeUntil, finalize } from 'rxjs';
import { MangaService } from '../../../core/services/manga.service';
import { MasterDataService } from '../../../core/services/master-data.service';
import { AuthorService } from '../../../core/services/author.service';
import { ArtistService } from '../../../core/services/artist.service';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';
import { Manga, Tag } from '../../../core/models/interfaces';
import { MangaSortBy } from '../../../core/models/manga.interface';
import {
  MANGA_STATUS_OPTIONS, MANGA_TYPE_OPTIONS, COUNTRY_OPTIONS, EnumOption, enumLabel,
} from '../../../core/models/manga-enums';

export interface RecommendItem {
  id: string;
  name: string;
}

/** Nhóm chip đã group theo chữ cái đầu (tính sẵn, KHÔNG dùng getter trong template). */
export interface LetterGroup<T = any> {
  letter: string;
  items: T[];
}

/**
 * Điều kiện tìm kiếm HỢP NHẤT cho đối tượng Manga — single source of truth.
 *
 * Trước đây mỗi kiểu search (ô search / chip tag / chip author / chip artist /
 * năm) tự gọi API riêng rồi tự gán kết quả, nên `reloadCurrentSearch` phải ĐOÁN
 * lại "đang search kiểu gì" (đổi trang khi chọn author bị mất — không nhánh nào
 * chạy), và các bộ lọc loại trừ nhau. Giờ mọi thứ đi qua:
 *   buildMangaCriteria() → runMangaSearch(page) → applyResult(r)
 * nên filter kết hợp được và phân trang luôn đúng.
 */
export interface MangaSearchCriteria {
  /** Từ khoá tên truyện (khi không phân giải được ra id cụ thể). */
  name?: string;
  tagIds: string[];
  authorId?: string;
  artistId?: string;
  season?: number;
  /** `MangaStatus` — đang ra / tạm ngưng / hoàn thành. */
  status?: number;
  /** `MangaType` — oneshot / OVA / doujinshi / nhiều chương. */
  type?: number;
  /** `CountriesEnum` — nước xuất xứ (Nhật/Hàn/Trung…). */
  countries?: number;
  sortBy?: MangaSortBy;
  reverseSort?: boolean;
}

export interface SearchPrefix {
  prefix: string;
  label: string;
  icon: string;
  hint: string;
}

/** Tier 1 — đối tượng tìm kiếm. Hiện chỉ `manga` hoạt động đầy đủ; tag/author/
 *  artist đang dựng khung (placeholder) cho phần tier tương lai. */
export type SearchTarget = 'manga' | 'tag' | 'author' | 'artist';

@Component({
  selector: 'app-manga-search',
  templateUrl: './manga-search.component.html',
  styleUrls: ['./manga-search.component.scss']
})
export class MangaSearchComponent implements OnInit, OnDestroy {
  results: Manga[] = [];
  categories: any[] = [];
  tags: Tag[] = [];
  selectedCategories: string[] = [];
  selectedYear: number | null = null;

  // Bộ lọc trạng thái / hình thức / xuất xứ — `filter-manga` đã nhận sẵn 3 param
  // này, trước đây client chỉ không gửi lên. Giá trị là số đúng enum backend.
  selectedStatus: number | null = null;
  selectedType: number | null = null;
  selectedCountry: number | null = null;

  readonly statusOptions = MANGA_STATUS_OPTIONS;
  readonly typeOptions = MANGA_TYPE_OPTIONS;
  readonly countryOptions = COUNTRY_OPTIONS;

  statusOpen = false;
  typeOpen = false;
  countryOpen = false;
  yearOpen = false;
  readonly years: number[] = Array.from(
    { length: new Date().getFullYear() - 1989 },
    (_, i) => new Date().getFullYear() - i
  );
  searchQuery = '';
  isLoading = false;
  hasSearched = false;

  currentPage = 1;
  totalPages = 1;
  totalCount = 0;
  pageSize = 10;
  pageSizeOptions = [10, 20, 50];
  viewMode: 'list' | 'grid' = 'grid';

  // ── Sắp xếp (server-side qua filter-manga) ────────────────────────────────
  /** null = mặc định của server (không gửi SortBy). */
  sortBy: MangaSortBy | null = null;
  reverseSort = true;
  readonly sortOptions: { value: MangaSortBy | null; label: string }[] = [
    { value: null,                      label: 'SEARCH.SORT_DEFAULT' },
    { value: MangaSortBy.LastUpdate,    label: 'SEARCH.SORT_LAST_UPDATE' },
    { value: MangaSortBy.ViewCount,     label: 'SEARCH.SORT_VIEWS' },
    { value: MangaSortBy.Rating,        label: 'SEARCH.SORT_RATING' },
    { value: MangaSortBy.ChapterCount,  label: 'SEARCH.SORT_CHAPTERS' },
    { value: MangaSortBy.CommentCount,  label: 'SEARCH.SORT_COMMENTS' },
  ];

  // Tier 1 — đối tượng tìm kiếm (mặc định manga). Danh mục lọc + loại kết quả
  // đổi theo giá trị này.
  searchTarget: SearchTarget = 'manga';
  readonly targetOptions: { value: SearchTarget; label: string; icon: string }[] = [
    { value: 'manga',  label: 'SEARCH.TARGET_MANGA',  icon: 'fa-solid fa-book' },
    { value: 'tag',    label: 'SEARCH.TARGET_TAG',    icon: 'fa-solid fa-tags' },
    { value: 'author', label: 'SEARCH.TARGET_AUTHOR', icon: 'fa-solid fa-pen-nib' },
    { value: 'artist', label: 'SEARCH.TARGET_ARTIST', icon: 'fa-solid fa-palette' },
  ];

  showPrefixHints = false;
  highlightedPrefixIndex = -1;
  selectedPrefix: SearchPrefix | null = null;
  showAuthorGrid = false;
  showArtistGrid = false;
  showCategoryGrid = false;
  showTagGrid = true;
  selectedAuthor: RecommendItem | null = null;
  selectedArtist: RecommendItem | null = null;
  /** Đối tượng Author/Artist: người đang xem thông tin (chọn từ list bên trái). */
  selectedPerson: { id: string; name: string; description?: string; birth?: string; lifeStatus?: number } | null = null;
  /** Đối tượng Tag: chỉ chọn MỘT thể loại (single-select), khác manga (multi). */
  selectedTag: any | null = null;
  /** Thông tin thể loại đang xem (từ /tag/get-by-id) — chỉ Name/Description. */
  tagInfo: { id: string; name: string; description?: string } | null = null;
  showRecommend = false;
  recommendList: RecommendItem[] = [];
  recommendIndex = -1;

  authors: RecommendItem[] = [];
  artists: RecommendItem[] = [];

  isFilterExpanded = true;
  authorFilter = '';
  artistFilter = '';
  categoryFilter = '';

  // Danh sách chip đã group theo chữ cái — TÍNH SẴN (property), không dùng getter:
  // template bind vào 6 chỗ *ngFor, nếu là getter thì groupByLetter sẽ chạy lại
  // (tạo array + sort mới) ở MỖI change-detection tick và *ngFor không tái dùng
  // DOM node. Recompute chỉ khi data hoặc ô lọc đổi.
  filteredGroupedAuthors: LetterGroup<RecommendItem>[] = [];
  filteredGroupedArtists: LetterGroup<RecommendItem>[] = [];
  filteredGroupedCategories: LetterGroup<any>[] = [];
  isAuthorFilterInvalid = false;
  isArtistFilterInvalid = false;
  isCategoryFilterInvalid = false;

  readonly prefixOptions: SearchPrefix[] = [
    { prefix: 'tag:',    label: 'SEARCH.PREFIX_TAG',    icon: 'fa-solid fa-tags',    hint: 'SEARCH.PREFIX_TAG_HINT' },
    { prefix: 'name:',   label: 'SEARCH.PREFIX_NAME',   icon: 'fa-solid fa-book',    hint: 'SEARCH.PREFIX_NAME_HINT' },
    { prefix: 'author:', label: 'SEARCH.PREFIX_AUTHOR', icon: 'fa-solid fa-pen-nib', hint: 'SEARCH.PREFIX_AUTHOR_HINT' },
    { prefix: 'artist:', label: 'SEARCH.PREFIX_ARTIST', icon: 'fa-solid fa-palette', hint: 'SEARCH.PREFIX_ARTIST_HINT' },
  ];
  filteredPrefixOptions: SearchPrefix[] = [];

  @ViewChild('searchInput') searchInputRef!: ElementRef<HTMLInputElement>;

  private searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();
  private _skipInput = false;
  private pendingQueryParams: any = null;

  /**
   * Keep the loading skeleton on screen for at least this long. The API on a
   * warm/local backend often answers in a few ms, so without a floor the
   * skeleton just flickers gray and is gone before it can be perceived.
   */
  private static readonly MIN_SKELETON_MS = 450;
  private loadStartedAt = 0;
  private skeletonTimer: any = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private mangaService: MangaService,
    private masterData: MasterDataService,
    private authorService: AuthorService,
    private artistService: ArtistService,
    private host: ElementRef,
    private prefs: UserPreferencesService,
    private seo: SeoService,
  ) {}

  ngOnInit(): void {
    // Tiêu đề tài liệu thay cho thẻ <h1> đã bỏ khỏi trang — nếu không đặt thì
    // tab trình duyệt vẫn giữ tiêu đề mặc định của site.
    this.seo.setSearchPage();

    this.pageSize = this.prefs.current.defaultPageSize;
    this.viewMode = this.prefs.current.defaultView;
    if (window.innerWidth <= 992) {
      this.isFilterExpanded = false;
    }

    this.masterData.categories$.pipe(takeUntil(this.destroy$)).subscribe(c => {
      this.categories = c;
      this.recomputeCategoryGroups();
      this.applyPendingParams();
      this.refreshRecommendIfActive();
    });
    this.masterData.tags$.pipe(takeUntil(this.destroy$)).subscribe(t => {
      this.tags = t;
      this.refreshRecommendIfActive();
    });
    this.masterData.authors$.pipe(takeUntil(this.destroy$)).subscribe(a => {
      this.authors = a;
      this.recomputeAuthorGroups();
      this.refreshRecommendIfActive();
    });
    this.masterData.artists$.pipe(takeUntil(this.destroy$)).subscribe(a => {
      this.artists = a;
      this.recomputeArtistGroups();
      this.refreshRecommendIfActive();
    });

    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      // Mọi param đều đi qua pending → applyPendingParams (cần categories/authors
      // đã load mới map được id → chip). `tagId` giữ lại cho link /the-loai/:id cũ.
      if (this.hasRestorableParams(params)) {
        this.pendingQueryParams = params;
        this.applyPendingParams();
      }
    });

    // Ô search: debounce rồi chạy qua ĐÚNG một pipeline runMangaSearch.
    // KHÔNG dùng distinctUntilChanged (xoá rồi gõ lại y hệt sẽ bị chặn).
    this.searchSubject.pipe(
      debounceTime(400),
      takeUntil(this.destroy$)
    ).subscribe(() => this.afterCriteriaChange());
  }

  ngOnDestroy(): void {
    this.seo.resetToDefault();
    if (this.skeletonTimer) clearTimeout(this.skeletonTimer);
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Show the skeleton and remember when it started (see MIN_SKELETON_MS). */
  private startLoading(): void {
    if (this.skeletonTimer) { clearTimeout(this.skeletonTimer); this.skeletonTimer = null; }
    this.loadStartedAt = Date.now();
    this.isLoading = true;
  }

  /** Hide the skeleton, but not before it has been visible for the minimum. */
  private stopLoading(): void {
    const remaining = MangaSearchComponent.MIN_SKELETON_MS - (Date.now() - this.loadStartedAt);
    if (remaining > 0) {
      this.skeletonTimer = setTimeout(() => { this.isLoading = false; this.skeletonTimer = null; }, remaining);
    } else {
      this.isLoading = false;
    }
  }

  /** Có param nào đáng phục hồi vào bộ lọc không? */
  private hasRestorableParams(params: any): boolean {
    return ['q', 'prefix', 'tagId', 'tags', 'author', 'artist', 'year', 'page', 'sort', 'asc',
            'status', 'type', 'country']
      .some(k => params?.[k] != null);
  }

  /**
   * Phục hồi bộ lọc từ query params (deep-link / share / back-button) rồi chạy
   * MỘT lần search. Chờ `categories` load xong mới map được id → chip.
   */
  private applyPendingParams(): void {
    if (!this.pendingQueryParams || this.categories.length === 0) return;
    const params = this.pendingQueryParams;
    this.pendingQueryParams = null;

    const q = params['q'];
    const prefix = params['prefix'];
    const tagId = params['tagId'];   // legacy: /the-loai/:id
    const tags = params['tags'];     // dạng mới: id,id,id

    if (tagId) {
      this.selectedCategories = [tagId];
    } else if (tags) {
      const ids: string[] = String(tags).split(',').filter(Boolean);
      this.selectedCategories = ids.filter(id => this.categories.some((c: any) => c.genreId === id));
    }

    if (params['author']) {
      this.selectedAuthor = this.authors.find(a => a.id === params['author']) ?? null;
    }
    if (params['artist']) {
      this.selectedArtist = this.artists.find(a => a.id === params['artist']) ?? null;
    }
    if (params['year'] != null) {
      const y = Number(params['year']);
      if (!Number.isNaN(y)) this.selectedYear = y;
    }
    // Chỉ nhận giá trị CÓ trong bảng lựa chọn — URL do người dùng sửa được, số
    // lạ lọt xuống API sẽ thành lỗi 400 thay vì im lặng bỏ qua bộ lọc.
    this.selectedStatus = this.parseEnumParam(params['status'], this.statusOptions);
    this.selectedType = this.parseEnumParam(params['type'], this.typeOptions);
    this.selectedCountry = this.parseEnumParam(params['country'], this.countryOptions);
    if (params['sort']) {
      const s = this.sortOptions.find(o => o.value === params['sort']);
      if (s) this.sortBy = s.value;
    }
    if (params['asc'] === '1' || params['asc'] === 'true') this.reverseSort = false;

    // `prefix=tag&q=<tên thể loại>` (link cũ từ header) → đổi thành chip tag.
    if (prefix === 'tag' && q) {
      const cat = this.categories.find((c: any) => c.genresIdName.toLowerCase() === String(q).toLowerCase());
      if (cat && !this.selectedCategories.includes(cat.genreId)) {
        this.selectedCategories = [...this.selectedCategories, cat.genreId];
      }
    } else {
      if (prefix) {
        const prefixOpt = this.prefixOptions.find(o => o.prefix === prefix + ':');
        if (prefixOpt) this.selectedPrefix = prefixOpt;
      }
      if (q) this.searchQuery = q;
    }

    const page = Number(params['page']);
    this.recomputeAllGroups();
    if (this.hasAnyQuery) {
      this.runMangaSearch(!Number.isNaN(page) && page > 0 ? page : 1, false);
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    // Đóng prefix/recommend khi click RA NGOÀI ô search — kể cả khi click sang
    // vùng khác trong trang (filter, kết quả...), không chỉ khi ra ngoài component.
    if (!target.closest('.search-box')) {
      this.showPrefixHints = false;
      this.showRecommend = false;
    }
    // Year dropdown đóng khi click ngoài chính nó.
    if (!target.closest('.year-dd')) {
      this.yearOpen = false;
    }
    if (!target.closest('.status-dd')) this.statusOpen = false;
    if (!target.closest('.type-dd')) this.typeOpen = false;
    if (!target.closest('.country-dd')) this.countryOpen = false;
  }

  selectYear(y: number | null): void {
    this.yearOpen = false;
    if (this.selectedYear === y) return;
    this.selectedYear = y;
    this.onYearChange();
  }

  /**
   * Chức năng: chọn trạng thái ra chương rồi chạy lại tìm kiếm.
   * Yêu cầu: `s` — giá trị `MangaStatus`, `null` để bỏ lọc.
   * Kết quả trả về: không (đổi `selectedStatus`, gọi lại API qua afterCriteriaChange).
   * Exception: không ném — chọn lại đúng giá trị cũ thì bỏ qua, không gọi API thừa.
   */
  selectStatus(s: number | null): void {
    this.statusOpen = false;
    if (this.selectedStatus === s) return;
    this.selectedStatus = s;
    this.afterCriteriaChange();
  }

  /**
   * Chức năng: chọn hình thức phát hành (oneshot/OVA/doujinshi/nhiều chương).
   * Yêu cầu: `t` — giá trị `MangaType`, `null` để bỏ lọc.
   * Kết quả trả về: không (đổi `selectedType`, gọi lại API).
   * Exception: không ném — trùng giá trị cũ thì bỏ qua.
   */
  selectType(t: number | null): void {
    this.typeOpen = false;
    if (this.selectedType === t) return;
    this.selectedType = t;
    this.afterCriteriaChange();
  }

  /**
   * Chức năng: chọn nước xuất xứ.
   * Yêu cầu: `c` — giá trị `CountriesEnum`, `null` để bỏ lọc.
   * Kết quả trả về: không (đổi `selectedCountry`, gọi lại API).
   * Exception: không ném — trùng giá trị cũ thì bỏ qua.
   */
  selectCountry(c: number | null): void {
    this.countryOpen = false;
    if (this.selectedCountry === c) return;
    this.selectedCountry = c;
    this.afterCriteriaChange();
  }

  /**
   * Chức năng: đọc một query param enum từ URL, chỉ chấp nhận giá trị có thật
   * trong bảng lựa chọn.
   * Yêu cầu: `raw` — giá trị thô từ URL; `options` — bảng lựa chọn hợp lệ.
   * Kết quả trả về: số enum hợp lệ, hoặc `null` nếu thiếu / không phải số /
   * không nằm trong bảng.
   * Exception: không ném — giá trị rác coi như không lọc.
   */
  private parseEnumParam(raw: any, options: EnumOption<number>[]): number | null {
    if (raw == null || raw === '') return null;
    const n = Number(raw);
    if (Number.isNaN(n)) return null;
    return options.some(o => o.value === n) ? n : null;
  }

  clearStatus(): void { this.selectStatus(null); }
  clearType(): void { this.selectType(null); }
  clearCountry(): void { this.selectCountry(null); }

  /** Nhãn đang chọn để hiện trên nút dropdown; `null` khi chưa lọc. */
  get statusLabel(): string | null { return enumLabel(this.statusOptions, this.selectedStatus); }
  get typeLabel(): string | null { return enumLabel(this.typeOptions, this.selectedType); }
  get countryLabel(): string | null { return enumLabel(this.countryOptions, this.selectedCountry); }

  /**
   * Tier 1 — đổi đối tượng tìm kiếm. Hiện chỉ Manga hoạt động đầy đủ (list manga
   * + full bộ lọc). Tag/Author/Artist đang DỰNG KHUNG: chỉ còn search-bar + lọc
   * năm, kết quả là placeholder "info entity" — sẽ wiring ở phần tier tương lai.
   */
  selectTarget(t: SearchTarget): void {
    if (this.searchTarget === t) return;
    this.searchTarget = t;
    this.results = [];
    this.hasSearched = false;
    // Reset lựa chọn thể loại khi rời/đổi đối tượng để tránh highlight "mồ côi".
    this.selectedTag = null;
    this.tagInfo = null;
    this.selectedPerson = null;
    // TODO(tier): dispatch search theo đối tượng khi làm tier1/tier2.
  }

  get isMangaTarget(): boolean {
    return this.searchTarget === 'manga';
  }

  /** Đối tượng Author/Artist chỉ để tra thông tin — không có ô search manga. */
  get isPersonTarget(): boolean {
    return this.searchTarget === 'author' || this.searchTarget === 'artist';
  }

  /** Kind thu hẹp cho <app-entity-detail> (chỉ dùng khi isPersonTarget). */
  get personKind(): 'author' | 'artist' {
    return this.searchTarget === 'artist' ? 'artist' : 'author';
  }

  /** Tiêu đề panel bên trái đổi theo đối tượng đang chọn. */
  get filterTitleKey(): string {
    switch (this.searchTarget) {
      case 'author': return 'SEARCH.AUTHOR_LIST';
      case 'artist': return 'SEARCH.ARTIST_LIST';
      default:       return 'SEARCH.FILTER_BY_GENRE';
    }
  }

  /** Panel bên trái có dữ liệu để hiển thị (list) theo đối tượng hiện tại? */
  get hasFilterData(): boolean {
    if (this.searchTarget === 'author') return this.authors.length > 0;
    if (this.searchTarget === 'artist') return this.artists.length > 0;
    return this.categories.length > 0;
  }

  // ── Prefix hints ──────────────────────────────────────────────────────────

  onSearchFocus(): void {
    if (!this.searchQuery.trim() && !this.selectedPrefix) {
      this.showPrefixHints = true;
      this.highlightedPrefixIndex = 0;
    }
  }

  togglePrefixHints(): void {
    this.showPrefixHints = !this.showPrefixHints;
  }

  selectPrefix(opt: SearchPrefix): void {
    this.selectedPrefix = opt;
    this.searchQuery = '';
    this.showPrefixHints = false;
    if (this.hasRecommendSource) {
      this.updateRecommend('');
    }
    setTimeout(() => this.searchInputRef?.nativeElement.focus(), 0);
  }

  clearPrefix(): void {
    this.selectedPrefix = null;
    this.searchQuery = '';
    this.hideRecommend();
    // Bỏ từ khoá nhưng chip lọc có thể vẫn còn → để pipeline quyết định.
    this.afterCriteriaChange();
    setTimeout(() => this.searchInputRef?.nativeElement.focus(), 0);
  }

  get activePrefixOption(): SearchPrefix | null {
    return this.selectedPrefix || this.prefixOptions.find(o => this.searchQuery.startsWith(o.prefix)) || null;
  }

  // ── Search logic ──────────────────────────────────────────────────────────

  onSearchInput(): void {
    if (this._skipInput) { this._skipInput = false; return; }
    const q = this.searchQuery.trim().toLowerCase();

    if (!this.selectedPrefix) {
      if (!q) {
        this.showPrefixHints = true;
        this.filteredPrefixOptions = [];
        this.highlightedPrefixIndex = 0;
        this.hideRecommend();
        return;
      }

      const exactPrefix = this.prefixOptions.find(o => o.prefix === q);
      if (exactPrefix) {
        this.showPrefixHints = true;
        this.filteredPrefixOptions = [];
        this.highlightedPrefixIndex = this.prefixOptions.indexOf(exactPrefix);
        this.hideRecommend();
        return;
      }

      const matchingPrefixes = this.getMatchingPrefixes(q);
      if (matchingPrefixes.length > 0) {
        this.showPrefixHints = true;
        this.filteredPrefixOptions = matchingPrefixes;
        this.highlightedPrefixIndex = 0;
        this.hideRecommend();
        return;
      }
    }

    this.showPrefixHints = false;
    this.filteredPrefixOptions = [];
    this.highlightedPrefixIndex = -1;

    if (this.hasRecommendSource) {
      this.updateRecommend(q);
      return;
    }

    this.hideRecommend();
    // URL được cập nhật bên trong runMangaSearch (sau debounce), không ghi ở đây
    // để tránh navigate mỗi lần gõ một ký tự.
    this.searchSubject.next(this.searchQuery);
  }

  onSearchKeyDown(event: KeyboardEvent): void {
    if (this.showPrefixHints) {
      const items = this.filteredPrefixOptions.length > 0 ? this.filteredPrefixOptions : this.prefixOptions;
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          this.highlightedPrefixIndex = Math.min(this.highlightedPrefixIndex + 1, items.length - 1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          this.highlightedPrefixIndex = Math.max(this.highlightedPrefixIndex - 1, 0);
          break;
        case 'Enter':
          event.preventDefault();
          if (this.highlightedPrefixIndex >= 0 && items[this.highlightedPrefixIndex]) {
            this.selectPrefix(items[this.highlightedPrefixIndex]);
          }
          break;
        case 'Escape':
          this.showPrefixHints = false;
          break;
      }
      return;
    }

    if (this.showRecommend && this.recommendList.length > 0) {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          this.recommendIndex = Math.min(this.recommendIndex + 1, this.recommendList.length - 1);
          return;
        case 'ArrowUp':
          event.preventDefault();
          this.recommendIndex = Math.max(this.recommendIndex - 1, 0);
          return;
        case 'Enter':
          event.preventDefault();
          if (this.recommendIndex >= 0 && this.recommendList[this.recommendIndex]) {
            this.selectRecommendItem(this.recommendList[this.recommendIndex]);
          }
          return;
        case 'Escape':
          this.hideRecommend();
          return;
      }
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      this.doSearch();
    }

    if (event.key === 'Backspace' && !this.searchQuery && this.selectedPrefix) {
      this.clearPrefix();
    }
  }

  private getMatchingPrefixes(input: string): SearchPrefix[] {
    if (!input || input.length === 0) return [];
    return this.prefixOptions.filter(opt =>
      opt.prefix.startsWith(input) && opt.prefix !== input
    );
  }

  doSearch(): void {
    this.afterCriteriaChange();
  }

  // ── Pipeline tìm kiếm hợp nhất (đối tượng Manga) ──────────────────────────

  /**
   * Gom TẤT CẢ lựa chọn đang có (ô search + prefix + chip tag/author/artist +
   * năm + sắp xếp) thành một bộ điều kiện duy nhất. Nhờ vậy các bộ lọc KẾT HỢP
   * được với nhau (vd: tác giả X + thể loại Y + năm 2024) thay vì loại trừ nhau.
   */
  private buildMangaCriteria(): MangaSearchCriteria {
    const c: MangaSearchCriteria = {
      tagIds: [...this.selectedCategories],
      authorId: this.selectedAuthor?.id,
      artistId: this.selectedArtist?.id,
      season: this.selectedYear ?? undefined,
      status: this.selectedStatus ?? undefined,
      type: this.selectedType ?? undefined,
      countries: this.selectedCountry ?? undefined,
      sortBy: this.sortBy ?? undefined,
      reverseSort: this.sortBy ? this.reverseSort : undefined,
    };

    const raw = this.searchQuery.trim();
    if (!raw) return c;

    // Prefix có thể do user chọn (selectedPrefix) hoặc gõ thẳng ("author:abc").
    const lower = raw.toLowerCase();
    const typed = this.prefixOptions.find(o => lower.startsWith(o.prefix));
    const prefix = this.selectedPrefix?.prefix ?? typed?.prefix;
    const keyword = typed ? raw.slice(typed.prefix.length).trim() : raw;
    if (!keyword) return c;

    switch (prefix) {
      case 'tag:': {
        const id = this.findTagIdByName(keyword);
        if (id) c.tagIds = Array.from(new Set([...c.tagIds, id]));
        else c.name = keyword;
        break;
      }
      case 'author:': {
        const a = this.findByName(this.authors, keyword);
        if (a) c.authorId = a.id; else c.name = keyword;
        break;
      }
      case 'artist:': {
        const a = this.findByName(this.artists, keyword);
        if (a) c.artistId = a.id; else c.name = keyword;
        break;
      }
      default:
        c.name = keyword;
    }
    return c;
  }

  /** Khớp tên không phân biệt hoa/thường; ưu tiên khớp chính xác rồi mới "chứa". */
  private findByName(list: RecommendItem[], name: string): RecommendItem | undefined {
    const q = name.trim().toLowerCase();
    return list.find(x => x.name.trim().toLowerCase() === q)
        ?? list.find(x => x.name.toLowerCase().includes(q));
  }

  private findTagIdByName(name: string): string | undefined {
    const q = name.trim().toLowerCase();
    const tag = this.tags.find((t: Tag) => t.name.toLowerCase() === q)
             ?? this.tags.find((t: Tag) => t.name.toLowerCase().includes(q));
    if (tag) return tag.id;
    const cat = this.categories.find((c: any) => c.genresIdName.toLowerCase() === q)
             ?? this.categories.find((c: any) => c.genresIdName.toLowerCase().includes(q));
    return cat?.genreId;
  }

  /** ĐƯỜNG DUY NHẤT gọi API cho đối tượng Manga (kể cả đổi trang / đổi sort). */
  private runMangaSearch(page = this.currentPage, syncUrl = true): void {
    const c = this.buildMangaCriteria();
    this.currentPage = page;
    this.startLoading();
    this.results = [];
    this.mangaService.filterPaginated({
      name: c.name,
      tagIds: c.tagIds.length ? c.tagIds : undefined,
      authorId: c.authorId,
      artistId: c.artistId,
      season: c.season,
      status: c.status,
      type: c.type,
      countries: c.countries,
      sortBy: c.sortBy,
      reverseSort: c.reverseSort,
      pageNo: page,
      pageSize: this.pageSize,
    }).pipe(
      takeUntil(this.destroy$),
      finalize(() => this.stopLoading())
    ).subscribe(r => this.applyResult(r));
    if (syncUrl) this.syncUrl();
  }

  /** MỘT chỗ duy nhất gán kết quả (trước đây khối này bị lặp 9 lần). */
  private applyResult(r: { data: Manga[]; totalPages: number; totalCount: number }): void {
    this.results = r.data;
    this.totalPages = r.totalPages;
    // KHÔNG suy ra từ `totalPages * pageSize`: đó là con số bịa, và với `||` thì
    // `totalCount = 0` hợp lệ (đối tượng chưa có truyện nào) cũng bị coi là
    // thiếu dữ liệu rồi hiện thành đúng một trang đầy — "(20)" dù chẳng có gì.
    // Thiếu thật thì lấy số mục đang cầm trên tay, ít nhất nó đúng.
    this.totalCount = r.totalCount || this.results.length;
    this.hasSearched = true;
  }

  /**
   * Gọi sau MỌI thay đổi điều kiện (chip, năm, sort, ô search): về trang 1 và
   * search lại; nếu không còn điều kiện nào thì xoá kết quả.
   */
  private afterCriteriaChange(): void {
    if (!this.isMangaTarget) return;
    this.currentPage = 1;
    if (this.hasAnyQuery) {
      this.runMangaSearch(1);
    } else {
      this.results = [];
      this.hasSearched = false;
      this.totalCount = 0;
      this.totalPages = 1;
      this.syncUrl();
    }
  }

  /** Đưa bộ lọc lên URL để share / bookmark / back-button hoạt động. */
  private syncUrl(): void {
    const qp: any = {};
    const raw = this.searchQuery.trim();
    if (raw) qp.q = raw;
    if (this.selectedPrefix) qp.prefix = this.selectedPrefix.prefix.replace(':', '');
    if (this.selectedCategories.length) qp.tags = this.selectedCategories.join(',');
    if (this.selectedAuthor) qp.author = this.selectedAuthor.id;
    if (this.selectedArtist) qp.artist = this.selectedArtist.id;
    if (this.selectedYear != null) qp.year = this.selectedYear;
    if (this.selectedStatus != null) qp.status = this.selectedStatus;
    if (this.selectedType != null) qp.type = this.selectedType;
    if (this.selectedCountry != null) qp.country = this.selectedCountry;
    if (this.sortBy) qp.sort = this.sortBy;
    if (this.sortBy && !this.reverseSort) qp.asc = 1;
    if (this.currentPage > 1) qp.page = this.currentPage;
    this.router.navigate([], { queryParams: qp, replaceUrl: true });
  }

  // ── View & Pagination ─────────────────────────────────────────────────────

  setViewMode(mode: 'list' | 'grid'): void {
    this.viewMode = mode;
  }

  setPageSize(size: number): void {
    if (size === this.pageSize) return;
    this.pageSize = size;
    this.currentPage = 1;
    // Luôn tải lại từ server: cắt mảng client cho "vừa mắt" sẽ làm totalPages và
    // dữ liệu lệch nhau ở các trang sau.
    this.reloadCurrentSearch();
  }

  /** Đổi tiêu chí sắp xếp (server-side). */
  setSort(value: MangaSortBy | null): void {
    if (this.sortBy === value) return;
    this.sortBy = value;
    this.reloadCurrentSearch(1);
  }

  /** Đảo chiều tăng/giảm — chỉ có nghĩa khi đã chọn 1 tiêu chí sắp xếp. */
  toggleSortDirection(): void {
    if (!this.sortBy) return;
    this.reverseSort = !this.reverseSort;
    this.reloadCurrentSearch(1);
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages || page === this.currentPage) return;
    this.reloadCurrentSearch(page);
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

  /**
   * Tải lại kết quả ở trang `page` cho ĐÚNG đối tượng đang xem.
   *
   * Trước đây hàm này phải đoán "đang search kiểu gì" qua chuỗi if/else, và khi
   * chỉ chọn chip author/artist thì không nhánh nào khớp (`hasActiveFilter` không
   * tính author/artist, `searchQuery` rỗng) → đổi trang bị mất im lặng. Giờ
   * đối tượng Manga luôn đi qua runMangaSearch nên không còn khe hở.
   */
  private reloadCurrentSearch(page = this.currentPage): void {
    this.currentPage = page;
    if (this.searchTarget === 'tag') {
      if (this.selectedTag) this.loadTagMangas(page);
      return;
    }
    if (this.isPersonTarget) {
      if (this.selectedPerson) this.loadPersonMangas(page);
      return;
    }
    if (this.hasAnyQuery) this.runMangaSearch(page);
  }

  // ── Recommend dropdown (tag / author / artist) ─────────────────────────────

  get hasRecommendSource(): boolean {
    const p = this.selectedPrefix?.prefix;
    return p === 'tag:' || p === 'author:' || p === 'artist:';
  }

  get recommendTitleKey(): string {
    switch (this.selectedPrefix?.prefix) {
      case 'tag:': return 'SEARCH.TAG_SUGGEST';
      case 'author:': return 'SEARCH.AUTHOR_SUGGEST';
      case 'artist:': return 'SEARCH.ARTIST_SUGGEST';
      default: return '';
    }
  }

  get recommendIcon(): string {
    return this.selectedPrefix?.icon ?? 'fa-solid fa-tags';
  }

  private get recommendSource(): RecommendItem[] {
    switch (this.selectedPrefix?.prefix) {
      case 'tag:':
        const catItems: RecommendItem[] = this.categories.map((c: any) => ({ id: c.genreId, name: c.genresIdName }));
        return [...this.tags, ...catItems];
      case 'author:': return this.authors;
      case 'artist:': return this.artists;
      default: return [];
    }
  }

  private refreshRecommendIfActive(): void {
    if (this.showRecommend && this.hasRecommendSource) {
      this.updateRecommend(this.searchQuery.trim().toLowerCase());
    }
  }

  private updateRecommend(query: string): void {
    const source = this.recommendSource;
    if (!query) {
      this.recommendList = source;
    } else {
      this.recommendList = source
        .filter(item => item.name.toLowerCase().includes(query));
    }
    this.showRecommend = true;
    this.recommendIndex = this.recommendList.length > 0 ? 0 : -1;
  }

  private hideRecommend(): void {
    this.showRecommend = false;
    this.recommendList = [];
    this.recommendIndex = -1;
  }

  selectRecommendItem(item: RecommendItem): void {
    this._skipInput = true;
    this.searchQuery = item.name;
    this.hideRecommend();
    setTimeout(() => this.doSearch());
  }

  removeCategory(id: string): void {
    this.selectedCategories = this.selectedCategories.filter(sid => sid !== id);
    this.afterCriteriaChange();
  }

  clearAllCategories(): void {
    this.selectedCategories = [];
    this.afterCriteriaChange();
  }

  /** Clear the active author/artist/year filter straight from its badge. */
  clearAuthor(): void { this.selectedAuthor = null; this.afterCriteriaChange(); }
  clearArtist(): void { this.selectedArtist = null; this.afterCriteriaChange(); }
  clearYear(): void { this.selectYear(null); }

  private groupByLetter(items: { name: string }[]): { letter: string; items: any[] }[] {
    const groups: { [key: string]: any[] } = {};
    for (const item of items) {
      const letter = (item.name?.[0] || '#').toUpperCase();
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push(item);
    }
    return Object.keys(groups).sort().map(letter => ({
      letter,
      items: groups[letter].sort((a, b) => a.name.length - b.name.length)
    }));
  }

  // ── Recompute nhóm chip (thay cho getter — xem chú thích ở khai báo field) ──

  private recomputeAllGroups(): void {
    this.recomputeAuthorGroups();
    this.recomputeArtistGroups();
    this.recomputeCategoryGroups();
  }

  /** Gọi từ template khi ô lọc tác giả đổi. */
  recomputeAuthorGroups(): void {
    const q = this.authorFilter.trim().toLowerCase();
    const filtered = q ? this.authors.filter(a => a.name.toLowerCase().includes(q)) : this.authors;
    this.filteredGroupedAuthors = this.groupByLetter(filtered);
    this.isAuthorFilterInvalid = !!q && filtered.length === 0;
  }

  recomputeArtistGroups(): void {
    const q = this.artistFilter.trim().toLowerCase();
    const filtered = q ? this.artists.filter(a => a.name.toLowerCase().includes(q)) : this.artists;
    this.filteredGroupedArtists = this.groupByLetter(filtered);
    this.isArtistFilterInvalid = !!q && filtered.length === 0;
  }

  recomputeCategoryGroups(): void {
    const mapped = this.categories.map((c: any) => ({ ...c, name: c.genresIdName }));
    const q = this.categoryFilter.trim().toLowerCase();
    const filtered = q ? mapped.filter(c => c.name.toLowerCase().includes(q)) : mapped;
    this.filteredGroupedCategories = this.groupByLetter(filtered);
    this.isCategoryFilterInvalid = !!q && filtered.length === 0;
  }

  // ── Chip lọc (đối tượng Manga) — CHỈ đổi state rồi để pipeline lo phần còn lại.
  // Không xoá lựa chọn khác nữa: tag + author + artist + năm giờ KẾT HỢP được.

  selectAuthorChip(author: RecommendItem): void {
    this.selectedAuthor = this.selectedAuthor?.id === author.id ? null : author;
    this.afterCriteriaChange();
  }

  selectArtistChip(artist: RecommendItem): void {
    this.selectedArtist = this.selectedArtist?.id === artist.id ? null : artist;
    this.afterCriteriaChange();
  }

  /**
   * Đối tượng Author/Artist — chọn 1 người từ list để XEM THÔNG TIN (không phải
   * lọc manga như đối tượng Manga). Tải meta của người đó + danh sách truyện họ
   * tham gia, hiển thị bằng <app-entity-detail> ở khu kết quả. Bấm lại để bỏ chọn.
   */
  selectPersonChip(item: RecommendItem): void {
    if (this.selectedPerson?.id === item.id) {
      this.selectedPerson = null;
      this.results = [];
      this.hasSearched = false;
      return;
    }
    this.currentPage = 1;
    this.loadPersonInfo(item);
    this.loadPersonMangas(1);
  }

  private loadPersonInfo(item: RecommendItem): void {
    // Hiển thị ngay tên đã biết; bổ sung meta (mô tả, năm sinh...) khi API trả về.
    this.selectedPerson = { id: item.id, name: item.name };
    const svc = this.searchTarget === 'author' ? this.authorService : this.artistService;
    svc.filter({ id: item.id, pageSize: 1 }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        const raw = res?.value ?? res;
        const found = (raw?.data ?? (Array.isArray(raw) ? raw : []))[0];
        if (found && this.selectedPerson?.id === item.id) {
          this.selectedPerson = {
            id: found.id,
            name: found.name,
            description: found.depscription ?? found.description ?? '',
            birth: found.birth,
            lifeStatus: found.lifeStatus,
          };
        }
      },
    });
  }

  private loadPersonMangas(page: number): void {
    if (!this.selectedPerson) return;
    this.startLoading();
    this.results = [];
    const params = this.searchTarget === 'author'
      ? { authorId: this.selectedPerson.id, pageNo: page, pageSize: this.pageSize }
      : { artistId: this.selectedPerson.id, pageNo: page, pageSize: this.pageSize };
    this.mangaService.filterPaginated(params).pipe(
      takeUntil(this.destroy$),
      finalize(() => this.stopLoading())
    ).subscribe(r => this.applyResult(r));
  }

  toggleCategoryChip(cat: any): void {
    this.selectedCategories = this.selectedCategories.includes(cat.genreId)
      ? this.selectedCategories.filter(id => id !== cat.genreId)
      : [...this.selectedCategories, cat.genreId];
    this.afterCriteriaChange();
  }

  /**
   * Đối tượng Tag — single-select: bấm 1 thể loại là gọi request ngay (bấm lại
   * để bỏ chọn). Hai request riêng lẻ: (1) /tag/get-by-id lấy Name/Description,
   * (2) filter-manga theo tagId để có grid + phân trang độc lập.
   */
  selectTagChip(cat: any): void {
    if (this.selectedTag?.genreId === cat.genreId) {
      this.selectedTag = null;
      this.tagInfo = null;
      this.results = [];
      this.hasSearched = false;
      return;
    }
    this.selectedTag = cat;
    this.currentPage = 1;
    this.tagInfo = null;
    this.mangaService.getTagInfo(cat.genreId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(info => { this.tagInfo = info; });
    this.loadTagMangas(1);
  }

  /** Part 2 — trang manga của thể loại đang chọn (phân trang độc lập). */
  private loadTagMangas(page: number): void {
    if (!this.selectedTag) return;
    this.startLoading();
    this.results = [];
    this.mangaService.filterPaginated({ tagIds: [this.selectedTag.genreId], pageNo: page, pageSize: this.pageSize }).pipe(
      takeUntil(this.destroy$),
      finalize(() => this.stopLoading())
    ).subscribe(r => this.applyResult(r));
  }

  /** @deprecated Giữ cho tương thích — mọi thứ giờ chạy qua afterCriteriaChange(). */
  searchByCategories(): void {
    this.afterCriteriaChange();
  }

  /**
   * Có bộ lọc dạng chip/dropdown nào đang bật? (dùng để hiện badge "đang lọc")
   * LƯU Ý: phải tính CẢ author/artist — thiếu 2 cái này chính là nguyên nhân bug
   * đổi trang trước đây.
   */
  get hasActiveFilter(): boolean {
    return this.selectedCategories.length > 0
        || this.selectedYear != null
        || this.selectedStatus != null
        || this.selectedType != null
        || this.selectedCountry != null
        || !!this.selectedAuthor
        || !!this.selectedArtist;
  }

  /** Có bất kỳ điều kiện nào (bộ lọc HOẶC từ khoá) để chạy search? */
  get hasAnyQuery(): boolean {
    return this.hasActiveFilter || !!this.searchQuery.trim();
  }

  onYearChange(): void {
    this.afterCriteriaChange();
  }

}
