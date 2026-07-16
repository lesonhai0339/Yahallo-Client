import { Component, OnInit, OnDestroy, ElementRef, HostListener, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, Observable, of, debounceTime, distinctUntilChanged, switchMap, takeUntil, finalize } from 'rxjs';
import { MangaService } from '../../../core/services/manga.service';
import { MasterDataService } from '../../../core/services/master-data.service';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';
import { Manga, Tag } from '../../../core/models/interfaces';

export interface RecommendItem {
  id: string;
  name: string;
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
    private host: ElementRef,
    private prefs: UserPreferencesService
  ) {}

  ngOnInit(): void {
    this.pageSize = this.prefs.current.defaultPageSize;
    this.viewMode = this.prefs.current.defaultView;
    if (window.innerWidth <= 992) {
      this.isFilterExpanded = false;
    }

    this.masterData.categories$.pipe(takeUntil(this.destroy$)).subscribe(c => {
      this.categories = c;
      this.applyPendingParams();
      this.refreshRecommendIfActive();
    });
    this.masterData.tags$.pipe(takeUntil(this.destroy$)).subscribe(t => {
      this.tags = t;
      this.refreshRecommendIfActive();
    });
    this.masterData.authors$.pipe(takeUntil(this.destroy$)).subscribe(a => {
      this.authors = a;
      this.refreshRecommendIfActive();
    });
    this.masterData.artists$.pipe(takeUntil(this.destroy$)).subscribe(a => {
      this.artists = a;
      this.refreshRecommendIfActive();
    });

    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      if (params['tagId'] || (params['prefix'] && params['q'])) {
        this.pendingQueryParams = params;
        this.applyPendingParams();
      } else if (params['q']) {
        this.searchQuery = params['q'];
        this.executeSearch(this.searchQuery);
      }
    });

    this.searchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged(),
      switchMap(q => {
        if (!q.trim()) {
          this.results = [];
          this.hasSearched = false;
          return of(null);
        }
        this.startLoading();
        this.currentPage = 1;
        return this.executeSearchByPrefix(q, 1).pipe(
          finalize(() => this.stopLoading())
        );
      }),
      takeUntil(this.destroy$)
    ).subscribe(r => {
      if (!r) return;
      this.results = r.data;
      this.totalPages = r.totalPages;
      this.totalCount = r.totalCount || r.totalPages * this.pageSize;
      this.hasSearched = true;
    });
  }

  ngOnDestroy(): void {
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

  private applyPendingParams(): void {
    if (!this.pendingQueryParams || this.categories.length === 0) return;
    const params = this.pendingQueryParams;
    this.pendingQueryParams = null;
    const prefix = params['prefix'];
    const q = params['q'];
    const tagId = params['tagId'];

    if (tagId) {
      this.selectedCategories = [tagId];
      this.searchByCategories();
      return;
    }

    if (prefix === 'tag' && q) {
      const cat = this.categories.find((c: any) => c.genresIdName.toLowerCase() === q.toLowerCase());
      if (cat) {
        this.selectedCategories = [cat.genreId];
        this.searchByCategories();
        return;
      }
    }

    if (prefix) {
      const prefixOpt = this.prefixOptions.find(o => o.prefix === prefix + ':');
      if (prefixOpt) {
        this.selectedPrefix = prefixOpt;
      }
    }
    if (q) {
      this.searchQuery = q;
      this.doSearch();
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
  }

  selectYear(y: number | null): void {
    this.yearOpen = false;
    if (this.selectedYear === y) return;
    this.selectedYear = y;
    this.onYearChange();
  }

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
    // TODO(tier): dispatch search theo đối tượng khi làm tier1/tier2.
  }

  get isMangaTarget(): boolean {
    return this.searchTarget === 'manga';
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
    this.results = [];
    this.hasSearched = false;
    this.hideRecommend();
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
    this.searchSubject.next(this.searchQuery);
    this.router.navigate([], { queryParams: { q: this.searchQuery }, replaceUrl: true });
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
    if (!this.searchQuery.trim()) return;
    this.startLoading();
    this.currentPage = 1;
    this.executeSearchByPrefix(this.searchQuery, 1).pipe(
      takeUntil(this.destroy$),
      finalize(() => this.stopLoading())
    ).subscribe(r => {
      this.results = r.data;
      this.totalPages = r.totalPages;
      this.totalCount = r.totalCount || r.totalPages * this.pageSize;
      this.hasSearched = true;
    });
  }

  private executeSearch(query: string): void {
    this.startLoading();
    this.currentPage = 1;
    this.executeSearchByPrefix(query, 1).pipe(
      takeUntil(this.destroy$),
      finalize(() => this.stopLoading())
    ).subscribe(r => {
      this.results = r.data;
      this.totalPages = r.totalPages;
      this.totalCount = r.totalCount || r.totalPages * this.pageSize;
      this.hasSearched = true;
    });
  }

  private executeSearchByPrefix(fullQuery: string, page: number): Observable<{ data: Manga[]; totalPages: number; totalCount: number }> {
    const effectiveQuery = this.selectedPrefix ? this.selectedPrefix.prefix + fullQuery : fullQuery;
    const tagMatch = effectiveQuery.match(/^tag:(.+)/i);
    const nameMatch = effectiveQuery.match(/^name:(.+)/i);
    const authorMatch = effectiveQuery.match(/^author:(.+)/i);
    const artistMatch = effectiveQuery.match(/^artist:(.+)/i);

    if (tagMatch) {
      const tagName = tagMatch[1].trim();
      const tag = this.tags.find((t: Tag) => t.name.toLowerCase().includes(tagName.toLowerCase()));
      if (tag) {
        return this.mangaService.filterPaginated({ tagIds:  [tag.id], pageNo : page, pageSize: this.pageSize });
        //return this.mangaService.filterByTagsPaginated({ tagIds: [tag.id], page, pageSize: this.pageSize });
      }
      const catTag = this.categories.find((c: any) => c.genresIdName.toLowerCase().includes(tagName.toLowerCase()));
      if (catTag) {
        return this.mangaService.filterPaginated({ tagIds:  [catTag.genreId], pageNo : page, pageSize: this.pageSize });
        //return this.mangaService.filterByTagsPaginated({ tagIds: [catTag.genreId], page, pageSize: this.pageSize });
      }
      return this.mangaService.filterPaginated({ name: tagName, pageNo : page, pageSize: this.pageSize });
    }

    if (nameMatch) {
      return this.mangaService.filterPaginated({ name: nameMatch[1].trim(), pageNo: page, pageSize: this.pageSize });
    }

    if(authorMatch)
    {
      const name = authorMatch[1].trim();
      const author = this.authors.find(x => x.name.trim() == name);
      return  this.mangaService.filterPaginated({pageNo: page, pageSize: this.pageSize, authorId: author?.id})
    }

    if(artistMatch)
    {
      const name = artistMatch[1].trim();
      const artist = this.artists.find(x => x.name.trim() == name);
      return  this.mangaService.filterPaginated({pageNo: page, pageSize: this.pageSize, artistId: artist?.id})
    }

    return this.mangaService.filterPaginated({ name: fullQuery.trim(), pageNo: page, pageSize: this.pageSize });
  }

  // ── View & Pagination ─────────────────────────────────────────────────────

  setViewMode(mode: 'list' | 'grid'): void {
    this.viewMode = mode;
  }

  setPageSize(size: number): void {
    if (size === this.pageSize) return;
    this.pageSize = size;
    this.currentPage = 1;
    this.totalPages = Math.max(1, Math.ceil(this.totalCount / size));
    if (size <= this.results.length) {
      this.results = this.results.slice(0, size);
    } else {
      this.reloadCurrentSearch();
    }
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages || page === this.currentPage) return;
    this.currentPage = page;
    this.reloadCurrentSearch();
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

  private reloadCurrentSearch(): void {
    // Đối tượng Tag: đổi trang gọi lại filter-manga theo tagId đang chọn.
    if (this.searchTarget === 'tag') {
      if (this.selectedTag) this.loadTagMangas(this.currentPage);
      return;
    }
    if (this.hasActiveFilter) {
      this.searchByCategories();
    } else if (this.searchQuery.trim()) {
      this.startLoading();
      this.executeSearchByPrefix(this.searchQuery, this.currentPage).pipe(
        takeUntil(this.destroy$),
        finalize(() => this.stopLoading())
      ).subscribe(r => {
        this.results = r.data;
        this.totalPages = r.totalPages;
        this.totalCount = r.totalCount || r.totalPages * this.pageSize;
        this.hasSearched = true;
      });
    }
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
    this.currentPage = 1;
    if (this.selectedCategories.length > 0) {
      this.searchByCategories();
    } else {
      this.results = [];
      this.hasSearched = false;
    }
  }

  clearAllCategories(): void {
    this.selectedCategories = [];
    this.results = [];
    this.hasSearched = false;
  }

  /** Clear the active author/artist/year filter straight from its badge. */
  clearAuthor(): void { if (this.selectedAuthor) this.selectAuthorChip(this.selectedAuthor); }
  clearArtist(): void { if (this.selectedArtist) this.selectArtistChip(this.selectedArtist); }
  clearYear(): void { this.selectYear(null); }

  private removeLastCategory(): void {
    this.selectedCategories = this.selectedCategories.slice(0, -1);
    if (this.selectedCategories.length > 0) {
      this.searchByCategories();
    } else {
      this.results = [];
      this.hasSearched = false;
    }
  }

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

  get groupedAuthors(): { letter: string; items: RecommendItem[] }[] {
    return this.groupByLetter(this.authors);
  }

  get groupedArtists(): { letter: string; items: RecommendItem[] }[] {
    return this.groupByLetter(this.artists);
  }

  get groupedCategories(): { letter: string; items: any[] }[] {
    const mapped = this.categories.map((c: any) => ({ ...c, name: c.genresIdName }));
    return this.groupByLetter(mapped);
  }

  get filteredGroupedAuthors(): { letter: string; items: RecommendItem[] }[] {
    const q = this.authorFilter.trim().toLowerCase();
    const filtered = q ? this.authors.filter(a => a.name.toLowerCase().includes(q)) : this.authors;
    return this.groupByLetter(filtered);
  }

  get filteredGroupedArtists(): { letter: string; items: RecommendItem[] }[] {
    const q = this.artistFilter.trim().toLowerCase();
    const filtered = q ? this.artists.filter(a => a.name.toLowerCase().includes(q)) : this.artists;
    return this.groupByLetter(filtered);
  }

  get filteredGroupedCategories(): { letter: string; items: any[] }[] {
    const mapped = this.categories.map((c: any) => ({ ...c, name: c.genresIdName }));
    const q = this.categoryFilter.trim().toLowerCase();
    const filtered = q ? mapped.filter(c => c.name.toLowerCase().includes(q)) : mapped;
    return this.groupByLetter(filtered);
  }

  get isAuthorFilterInvalid(): boolean {
    const q = this.authorFilter.trim().toLowerCase();
    return !!q && !this.authors.some(a => a.name.toLowerCase().includes(q));
  }

  get isArtistFilterInvalid(): boolean {
    const q = this.artistFilter.trim().toLowerCase();
    return !!q && !this.artists.some(a => a.name.toLowerCase().includes(q));
  }

  get isCategoryFilterInvalid(): boolean {
    const q = this.categoryFilter.trim().toLowerCase();
    return !!q && !this.categories.some((c: any) => c.genresIdName.toLowerCase().includes(q));
  }

  selectAuthorChip(author: RecommendItem): void {
    this.selectedAuthor = this.selectedAuthor?.id === author.id ? null : author;
    this.selectedArtist = null;
    this.selectedCategories = [];
    this.currentPage = 1;
    if (this.selectedAuthor) {
      this.startLoading();
      this.results = [];
      this.mangaService.filterPaginated({ authorId: author.id, pageNo: 1, pageSize: this.pageSize }).pipe(
        takeUntil(this.destroy$),
        finalize(() => this.stopLoading())
      ).subscribe(r => {
        this.results = r.data;
        this.totalPages = r.totalPages;
        this.totalCount = r.totalCount || r.totalPages * this.pageSize;
        this.hasSearched = true;
      });
    } else {
      this.results = [];
      this.hasSearched = false;
    }
  }

  selectArtistChip(artist: RecommendItem): void {
    this.selectedArtist = this.selectedArtist?.id === artist.id ? null : artist;
    this.selectedAuthor = null;
    this.selectedCategories = [];
    this.currentPage = 1;
    if (this.selectedArtist) {
      this.startLoading();
      this.results = [];
      this.mangaService.filterPaginated({ artistId: artist.id, pageNo: 1, pageSize: this.pageSize }).pipe(
        takeUntil(this.destroy$),
        finalize(() => this.stopLoading())
      ).subscribe(r => {
        this.results = r.data;
        this.totalPages = r.totalPages;
        this.totalCount = r.totalCount || r.totalPages * this.pageSize;
        this.hasSearched = true;
      });
    } else {
      this.results = [];
      this.hasSearched = false;
    }
  }

  toggleCategoryChip(cat: any): void {
    this.currentPage = 1;
    if (this.selectedCategories.includes(cat.genreId)) {
      this.removeCategory(cat.genreId);
    } else {
      this.selectedCategories = [...this.selectedCategories, cat.genreId];
      this.searchByCategories();
    }
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
    ).subscribe(r => {
      this.results = r.data;
      this.totalPages = r.totalPages;
      this.totalCount = r.totalCount || r.totalPages * this.pageSize;
      this.hasSearched = true;
    });
  }

  searchByCategories(): void {
    this.startLoading();
    this.results = [];
    this.mangaService.filterPaginated({
      tagIds: this.selectedCategories.length ? this.selectedCategories : undefined,
      season: this.selectedYear ?? undefined,
      pageNo: this.currentPage,
      pageSize: this.pageSize,
    }).pipe(
      takeUntil(this.destroy$),
      finalize(() => this.stopLoading())
    ).subscribe(r => {
      this.results = r.data;
      this.totalPages = r.totalPages;
      this.totalCount = r.totalCount || r.totalPages * this.pageSize;
      this.hasSearched = true;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /** Has any structured filter (category or year) been applied? */
  get hasActiveFilter(): boolean {
    return this.selectedCategories.length > 0 || this.selectedYear != null;
  }

  onYearChange(): void {
    this.currentPage = 1;
    if (this.hasActiveFilter) {
      this.searchByCategories();
    } else {
      this.results = [];
      this.hasSearched = false;
    }
  }

}
