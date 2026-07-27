import { Component, OnInit, OnDestroy, HostListener, ElementRef, ViewChild } from '@angular/core';
import { ActivatedRouteSnapshot, Router } from '@angular/router';
import { Subject, of, timer, debounce, switchMap, takeUntil, finalize, catchError } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { SearchService, SuggestType, SuggestResult } from '../../core/services/search.service';
import { NotificationService } from '../../core/services/notification.service';
import { UserInteractionService } from '../../core/services/user-interaction.service';
import { TranslationService, SupportedLang } from '../../core/services/translation.service';
import { ThemeService } from '../../core/services/theme.service';
import { AdminStateService } from '../../admin/services/admin-state.service';
import { MasterDataService } from '../../core/services/master-data.service';
import { User } from '../../core/models/interfaces';
import { AuthGuard } from '../../core/guards/auth.guard';
import { AdminGuard } from '../../core/guards/admin.guard';
import { PermissionGuard } from '../../core/guards/permission.guard';

export interface SearchPrefix {
  prefix: string;
  label: string;
  icon: string;
  hint: string;
}

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent implements OnInit, OnDestroy {
  @ViewChild('searchInput') searchInputRef!: ElementRef;

  isDropdownOpen = false;
  closeTimer: any;
  isScrolled = false;
  isMenuOpen = false;
  isSearchOpen = false;
  isNotifOpen = false;
  isUserMenuOpen = false;
  isLangOpen = false;

  user: User | null = null;
  isLoggedIn = false;
  isAdmin = false;
  searchQuery = '';
  searchResults: any[] = [];
  isSearchLoading = false;
  hasSearched = false;
  searchTotalCount = 0;
  showPrefixHints = false;
  highlightedResultIndex = -1;
  highlightedPrefixIndex = -1;
  selectedPrefix: SearchPrefix | null = null;
  notifications: any[] = [];
  unreadCount = 0;
  categories: any[] = [];

  // Search type (tier 2 của Manga). Mọi type đều gọi suggest và trả về MANGA:
  // - name  → manga theo tên
  // - tag    → manga có tag (theo tên tag, startsWith)
  // - author → manga của tác giả (theo tên, startsWith)
  // - artist → manga của hoạ sĩ (theo tên, startsWith)
  readonly prefixOptions: SearchPrefix[] = [
    { prefix: 'tag:',    label: 'SEARCH.PREFIX_TAG',    icon: 'fa-solid fa-tags',    hint: 'SEARCH.PREFIX_TAG_HINT' },
    { prefix: 'name:',   label: 'SEARCH.PREFIX_NAME',   icon: 'fa-solid fa-book',    hint: 'SEARCH.PREFIX_NAME_HINT' },
    { prefix: 'author:', label: 'SEARCH.PREFIX_AUTHOR', icon: 'fa-solid fa-pen-nib', hint: 'SEARCH.PREFIX_AUTHOR_HINT' },
    { prefix: 'artist:', label: 'SEARCH.PREFIX_ARTIST', icon: 'fa-solid fa-palette', hint: 'SEARCH.PREFIX_ARTIST_HINT' },
  ];
  filteredPrefixOptions: SearchPrefix[] = [];

  availableLangs: SupportedLang[] = [];
  currentLang: SupportedLang = 'vi';

  // Flag images from flagcdn (same source as the phone-country flag in register)
  // — emoji flags render blank on Windows desktop browsers.
  readonly langLabels: Record<SupportedLang, { label: string; iso: string }> = {
    vi: { label: 'VI', iso: 'vn' },
    en: { label: 'EN', iso: 'gb' },
  };

  /** URL ảnh cờ quốc gia (flagcdn) cho ngôn ngữ — giống flagUrl bên register. */
  flagUrl(lang: SupportedLang): string {
    return `https://flagcdn.com/h20/${this.langLabels[lang].iso}.png`;
  }

  /** Ảnh mặc định khi manga suggest không kèm thumbnailUrl. */
  private static readonly DEFAULT_THUMB = '/assets/noresult.png';

  private searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();

  constructor(
    private auth: AuthService,
    private searchService: SearchService,
    private notifService: NotificationService,
    private userInteraction: UserInteractionService,
    public translation: TranslationService,
    public themeService: ThemeService,
    private adminState: AdminStateService,
    private masterData: MasterDataService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.availableLangs = this.translation.getAvailableLangs();
    this.currentLang = this.translation.currentLang;
    this.translation.lang$.pipe(takeUntil(this.destroy$)).subscribe(l => this.currentLang = l);

    this.auth.auth$.pipe(takeUntil(this.destroy$)).subscribe(state => {
      this.isLoggedIn = state.status;
      this.user = this.auth.currentUser;
      if (state.status && this.user) {
        this.loadNotifications();
        this.notifService.startHub();
      }
    });

    this.adminState.isAdmin$.pipe(takeUntil(this.destroy$)).subscribe(v => this.isAdmin = v);

    this.notifService.unreadCount.pipe(takeUntil(this.destroy$)).subscribe(c => this.unreadCount = c);
    this.notifService.notifications.pipe(takeUntil(this.destroy$)).subscribe(n => this.notifications = n.slice(0, 8));

    // Categories cho mega-menu "Thể loại" ở nav (không liên quan search).
    this.masterData.categories$.pipe(takeUntil(this.destroy$)).subscribe(c => this.categories = c);

    // Header search: mọi type đều gọi /services/search/suggest (startsWith) và
    // đều trả về MANGA. Author/artist search tức thì (0ms), còn lại đợi 0.5s.
    // KHÔNG dùng distinctUntilChanged: nhánh xoá keyword (onSearchInput) không
    // đẩy giá trị rỗng vào subject, nên distinct sẽ "nhớ" từ khoá cũ và chặn lần
    // gõ lại y hệt (gõ "e" → xoá → gõ "e" lại sẽ không search). debounce đã gộp
    // các phím gõ nhanh rồi, và subject chỉ next khi input thực sự đổi.
    this.searchSubject.pipe(
      debounce(() => timer(this.isInstantSuggest ? 0 : 500)),
      switchMap(() => {
        const keyword = this.getSearchKeyword();
        if (keyword.length === 0) {
          this.isSearchLoading = false;
          this.hasSearched = false;
          this.searchResults = [];
          return of({ data: [] as SuggestResult[], totalCount: 0 });
        }
        this.isSearchLoading = true;
        return this.searchService.suggest(keyword, this.currentSuggestType(), 10).pipe(
          catchError(() => of({ data: [] as SuggestResult[], totalCount: 0 })),
          finalize(() => this.isSearchLoading = false)
        );
      }),
      takeUntil(this.destroy$)
    ).subscribe((res: { data: SuggestResult[]; totalCount: number }) => {
      this.searchResults = res.data.map(r => this.toResultItem(r));
      this.searchTotalCount = res.totalCount;
      this.hasSearched = true;
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('window:scroll')
  onScroll(): void {
    this.isScrolled = window.scrollY > 50;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (!target.closest('.notif-wrapper')) this.isNotifOpen = false;
    if (!target.closest('.user-menu-wrapper')) this.isUserMenuOpen = false;
    if (!target.closest('.search-wrapper')) { this.closeSearch(); }
    if (!target.closest('.lang-wrapper')) this.isLangOpen = false;
  }

  onSearchFocus(): void {
    if (!this.searchQuery.trim() && !this.selectedPrefix) {
      this.showPrefixHints = true;
      this.highlightedPrefixIndex = 0;
    }
  }

  onSearchInput(): void {
    const q = this.searchQuery.trim().toLowerCase();

    if (!this.selectedPrefix) {
      // Exact prefix typed (e.g. "tag:") → show full list to select
      const exactPrefix = this.prefixOptions.find(o => o.prefix === q);
      if (exactPrefix) {
        this.showPrefixHints = true;
        this.filteredPrefixOptions = [];
        this.highlightedPrefixIndex = this.prefixOptions.indexOf(exactPrefix);
        this.resetResults();
        return;
      }

      const matchingPrefixes = this.getMatchingPrefixes(q);
      if (matchingPrefixes.length > 0) {
        this.showPrefixHints = true;
        this.filteredPrefixOptions = matchingPrefixes;
        this.highlightedPrefixIndex = 0;
        this.resetResults();
        return;
      }

      if (!q) {
        this.showPrefixHints = true;
        this.filteredPrefixOptions = [];
        this.highlightedPrefixIndex = 0;
        this.resetResults();
        return;
      }
    }

    this.showPrefixHints = false;
    this.filteredPrefixOptions = [];
    this.highlightedPrefixIndex = -1;

    const keyword = this.getSearchKeyword();
    if (keyword.length === 0) {
      this.resetResults();
      this.highlightedResultIndex = -1;
      return;
    }

    this.isSearchLoading = true;
    this.highlightedResultIndex = 0;
    this.searchSubject.next(this.searchQuery);
  }

  private resetResults(): void {
    this.searchResults = [];
    this.isSearchLoading = false;
    this.hasSearched = false;
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
      }
      return;
    }

    if (this.searchResults.length > 0) {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          this.highlightedResultIndex = Math.min(this.highlightedResultIndex + 1, this.searchResults.length - 1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          this.highlightedResultIndex = Math.max(this.highlightedResultIndex - 1, 0);
          break;
        case 'Enter':
          event.preventDefault();
          if (this.highlightedResultIndex >= 0 && this.searchResults[this.highlightedResultIndex]) {
            this.goToResult(this.searchResults[this.highlightedResultIndex]);
          } else {
            this.goToAdvancedSearch();
          }
          return;
      }
    }

    if (event.key === 'Escape') {
      this.closeSearch();
      (event.target as HTMLElement)?.blur();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      this.goToAdvancedSearch();
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

  /**
   * Chỉ nhận DUY NHẤT 1 search type: tiền tố đứng đầu query (hoặc prefix đang
   * chọn). Query kiểu `tag:name:...` chỉ tách `tag:`, phần còn lại là keyword.
   */
  private resolvePrefix(fullQuery: string): { prefix: SearchPrefix | null; keyword: string } {
    if (this.selectedPrefix) {
      return { prefix: this.selectedPrefix, keyword: (fullQuery ?? '').trim() };
    }
    const q = (fullQuery ?? '').trim();
    const match = this.prefixOptions.find(o => q.toLowerCase().startsWith(o.prefix));
    if (match) {
      return { prefix: match, keyword: q.slice(match.prefix.length).trim() };
    }
    return { prefix: null, keyword: q };
  }

  private getSearchKeyword(): string {
    return this.resolvePrefix(this.searchQuery).keyword;
  }

  /** Chỉ search tức thì khi user đã chủ động chọn type author/artist. */
  private get isInstantSuggest(): boolean {
    const p = this.selectedPrefix?.prefix;
    return p === 'author:' || p === 'artist:';
  }

  /** Map prefix đang active → SuggestType cho API suggest. */
  private currentSuggestType(): SuggestType {
    switch (this.resolvePrefix(this.searchQuery).prefix?.prefix) {
      case 'tag:': return SuggestType.Tag;
      case 'author:': return SuggestType.Author;
      case 'artist:': return SuggestType.Artist;
      default: return SuggestType.Manga; // name: hoặc không có prefix
    }
  }

  /** SuggestResult luôn là manga → shape cho list kết quả. */
  private toResultItem(r: SuggestResult): any {
    const thumb = r.thumbnailUrl && r.thumbnailUrl.trim()
      ? r.thumbnailUrl
      : HeaderComponent.DEFAULT_THUMB;
    return { id: r.id, displayName: r.name, mangaThumbnail: thumb };
  }

  togglePrefixHints(): void {
    this.showPrefixHints = !this.showPrefixHints;
  }

  selectPrefix(opt: SearchPrefix): void {
    this.selectedPrefix = opt;
    this.searchQuery = '';
    this.showPrefixHints = false;
    this.searchResults = [];
    setTimeout(() => this.searchInputRef?.nativeElement.focus(), 0);
  }

  clearPrefix(): void {
    this.selectedPrefix = null;
    this.searchResults = [];
    this.hasSearched = false;
    setTimeout(() => this.searchInputRef?.nativeElement.focus(), 0);
  }

  openSearch(): void {
    this.isSearchOpen = true;
    // Ô input được *ngIf render sau khi isSearchOpen = true → focus ở macrotask kế.
    setTimeout(() => this.searchInputRef?.nativeElement.focus(), 0);
  }

  closeSearch(): void {
    this.isSearchOpen = false;
    this.searchResults = [];
    this.showPrefixHints = false;
    this.hasSearched = false;
    this.isSearchLoading = false;
    this.selectedPrefix = null;
    this.searchQuery = '';
    this.searchTotalCount = 0;
  }

  get activePrefixOption(): SearchPrefix | null {
    return this.selectedPrefix || this.prefixOptions.find(o => this.searchQuery.startsWith(o.prefix)) || null;
  }

  /** Kết quả suggest luôn là manga → mở trang chi tiết manga. */
  goToResult(item: any): void {
    this.router.navigate(['/manga', item.id]);
    this.closeSearch();
  }

  /**
   * Chỉ hiện dòng "N kết quả trùng khớp" khi CÒN kết quả chưa show (total > số
   * item đang hiển thị). Click sẽ sang advanced search (lọc theo contains).
   */
  get showSeeMore(): boolean {
    return this.searchTotalCount > this.searchResults.length;
  }

  get matchCount(): number {
    return this.searchTotalCount || this.searchResults.length;
  }

  goToAdvancedSearch(): void {
    // Chuyển sang advanced search, lọc đúng loại đã chọn. Tính trước khi close.
    const { prefix, keyword } = this.resolvePrefix(this.searchQuery);
    const prefixName = prefix?.prefix?.replace(':', '') || '';
    if (!keyword) { return; }
    this.closeSearch();
    const queryParams: any = { q: keyword };
    if (prefixName) queryParams.prefix = prefixName;
    this.router.navigate(['/search/advanced'], { queryParams });
  }

  loadNotifications(): void {
    if (!this.user) return;
    this.userInteraction.getUnreadNotifications(this.user.id).subscribe(notifs => {
      this.notifService.setNotifications(notifs as any);
    });
  }

  notifIcon(n: any): string { return this.notifService.iconFor(n); }

  openNotif(item: any): void {
    if (!item.seen) {
      // Mention (kind = 5) dùng endpoint riêng; còn lại dùng mark-read thường.
      const seen$ = this.notifService.isMention(item)
        ? this.notifService.markMentionSeen(item.id)
        : this.userInteraction.markNotificationRead(item.id);
      seen$.subscribe();
      // Bỏ khỏi danh sách chưa đọc + trừ badge ngay (optimistic).
      this.notifService.markSeen(item.id);
    }
    const link = this.notifService.linkFor(item);
    const queryParams = this.notifService.queryParamsFor(item);
    if (link) this.router.navigate(link, queryParams ? { queryParams } : undefined);
    this.isNotifOpen = false;
  }

  switchLang(lang: SupportedLang): void {
    this.translation.setLanguage(lang);
    this.isLangOpen = false;
  }

  logout(): void {
    // Trang hiện tại có yêu cầu đăng nhập không → quyết định sau khi logout xong:
    // cần login thì về home, còn lại reload tại chỗ để reset state sang khách.
    const needsAuth = this.currentRouteNeedsAuth();
    const done = () => {
      this.notifService.stopHub();
      // Full reload để dọn sạch mọi state in-memory (user, notifications, cache…):
      // cần login → về home; còn lại reload trang hiện tại.
      if (needsAuth) window.location.href = '/';
      else window.location.reload();
    };
    this.auth.logout().subscribe({ next: done, error: done });
  }

  /** Route đang active (kể cả route con) có gắn guard yêu cầu đăng nhập không. */
  private currentRouteNeedsAuth(): boolean {
    const authGuards = [AuthGuard, AdminGuard, PermissionGuard];
    let route: ActivatedRouteSnapshot | null = this.router.routerState.snapshot.root;
    while (route) {
      const guards = route.routeConfig?.canActivate ?? [];
      if (guards.some(g => authGuards.includes(g))) return true;
      route = route.firstChild;
    }
    return false;
  }
  t(key: string): string {
    return this.translation.get(key);
  }
}
