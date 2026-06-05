import { Component, OnInit, OnDestroy, HostListener, ElementRef, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, of, debounceTime, distinctUntilChanged, switchMap, takeUntil, finalize } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { MangaService } from '../../core/services/manga.service';
import { NotificationService } from '../../core/services/notification.service';
import { UserInteractionService } from '../../core/services/user-interaction.service';
import { TranslationService, SupportedLang } from '../../core/services/translation.service';
import { ThemeService } from '../../core/services/theme.service';
import { AdminStateService } from '../../admin/services/admin-state.service';
import { TagService } from '../../core/services/tag.service';
import { AuthorService } from '../../core/services/author.service';
import { ArtistService } from '../../core/services/artist.service';
import { User, Tag } from '../../core/models/interfaces';

interface RecommendItem {
  id: string;
  name: string;
}

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
  showPrefixHints = false;
  highlightedResultIndex = -1;
  highlightedPrefixIndex = -1;
  selectedPrefix: SearchPrefix | null = null;
  notifications: any[] = [];
  unreadCount = 0;
  categories: any[] = [];
  tags: Tag[] = [];
  authors: RecommendItem[] = [];
  artists: RecommendItem[] = [];

  showRecommend = false;
  recommendList: RecommendItem[] = [];
  recommendIndex = -1;

  readonly prefixOptions: SearchPrefix[] = [
    { prefix: 'tag:',    label: 'SEARCH.PREFIX_TAG',    icon: 'fa-solid fa-tags',    hint: 'SEARCH.PREFIX_TAG_HINT' },
    { prefix: 'name:',   label: 'SEARCH.PREFIX_NAME',   icon: 'fa-solid fa-book',    hint: 'SEARCH.PREFIX_NAME_HINT' },
    { prefix: 'author:', label: 'SEARCH.PREFIX_AUTHOR', icon: 'fa-solid fa-pen-nib', hint: 'SEARCH.PREFIX_AUTHOR_HINT' },
    { prefix: 'artist:', label: 'SEARCH.PREFIX_ARTIST', icon: 'fa-solid fa-palette', hint: 'SEARCH.PREFIX_ARTIST_HINT' },
  ];
  filteredPrefixOptions: SearchPrefix[] = [];

  availableLangs: SupportedLang[] = [];
  currentLang: SupportedLang = 'vi';

  readonly langLabels: Record<SupportedLang, { label: string; flag: string }> = {
    vi: { label: 'VI', flag: '🇻🇳' },
    en: { label: 'EN', flag: '🇬🇧' },
  };

  private searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();

  constructor(
    private auth: AuthService,
    private mangaService: MangaService,
    private notifService: NotificationService,
    private userInteraction: UserInteractionService,
    public translation: TranslationService,
    public themeService: ThemeService,
    private adminState: AdminStateService,
    private tagService: TagService,
    private authorService: AuthorService,
    private artistService: ArtistService,
    private router: Router
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

    this.mangaService.getCategories().pipe(takeUntil(this.destroy$)).subscribe(cats => this.categories = cats || []);
    this.tagService.getAll().pipe(takeUntil(this.destroy$)).subscribe((res: any) => {
      this.tags = ((res?.value ?? res?.data ?? res) || []).sort((a: Tag, b: Tag) => a.name.localeCompare(b.name));
    });
    this.authorService.getAll().pipe(takeUntil(this.destroy$)).subscribe((res: any) => {
      const raw = res?.value ?? res?.data ?? res ?? [];
      this.authors = raw.map((a: any) => ({ id: a.id, name: a.name })).sort((a: RecommendItem, b: RecommendItem) => a.name.localeCompare(b.name));
    });
    this.artistService.getAll().pipe(takeUntil(this.destroy$)).subscribe((res: any) => {
      const raw = res?.value ?? res?.data ?? res ?? [];
      this.artists = raw.map((a: any) => ({ id: a.id, name: a.name })).sort((a: RecommendItem, b: RecommendItem) => a.name.localeCompare(b.name));
    });

    this.searchSubject.pipe(
      debounceTime(200),
      distinctUntilChanged(),
      switchMap(q => {
        const keyword = this.getSearchKeyword();
        if (keyword.length === 0) {
          this.isSearchLoading = false;
          this.hasSearched = false;
          this.searchResults = [];
          return of([]);
        }
        this.isSearchLoading = true;
        return this.searchByPrefix(q).pipe(
          finalize(() => this.isSearchLoading = false)
        );
      }),
      takeUntil(this.destroy$)
    ).subscribe(results => {
      this.searchResults = (results as any[]).slice(0, 6);
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
        this.searchResults = [];
        this.isSearchLoading = false;
        this.hasSearched = false;
        return;
      }

      const matchingPrefixes = this.getMatchingPrefixes(q);

      if (matchingPrefixes.length > 0) {
        this.showPrefixHints = true;
        this.filteredPrefixOptions = matchingPrefixes;
        this.highlightedPrefixIndex = 0;
        this.searchResults = [];
        this.isSearchLoading = false;
        this.hasSearched = false;
        return;
      }

      if (!q) {
        this.showPrefixHints = true;
        this.filteredPrefixOptions = [];
        this.highlightedPrefixIndex = 0;
        this.searchResults = [];
        this.isSearchLoading = false;
        this.hasSearched = false;
        return;
      }
    }

    this.showPrefixHints = false;
    this.filteredPrefixOptions = [];
    this.highlightedPrefixIndex = -1;

    if (this.hasRecommendSource) {
      this.updateRecommend(this.searchQuery.trim().toLowerCase());
      return;
    }

    this.hideRecommend();
    const keyword = this.getSearchKeyword();
    if (keyword.length > 0) {
      this.isSearchLoading = true;
      this.highlightedResultIndex = 0;
    } else {
      this.searchResults = [];
      this.isSearchLoading = false;
      this.hasSearched = false;
      this.highlightedResultIndex = -1;
    }
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
      }
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
            this.goToManga(this.searchResults[this.highlightedResultIndex]);
          } else {
            this.submitSearch();
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
      this.submitSearch();
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

  private getSearchKeyword(): string {
    const q = this.searchQuery.trim();
    if (this.selectedPrefix) return q;
    for (const opt of this.prefixOptions) {
      if (q.toLowerCase().startsWith(opt.prefix)) {
        return q.slice(opt.prefix.length).trim();
      }
    }
    return q;
  }

  togglePrefixHints(): void {
    this.showPrefixHints = !this.showPrefixHints;
  }

  selectPrefix(opt: SearchPrefix): void {
    this.selectedPrefix = opt;
    this.searchQuery = '';
    this.showPrefixHints = false;
    this.searchResults = [];
    if (this.hasRecommendSource) {
      this.updateRecommend('');
    }
    setTimeout(() => this.searchInputRef?.nativeElement.focus(), 0);
  }

  clearPrefix(): void {
    this.selectedPrefix = null;
    this.searchResults = [];
    this.hasSearched = false;
    this.hideRecommend();
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
    this.hideRecommend();
  }

  get activePrefixOption(): SearchPrefix | null {
    return this.selectedPrefix || this.prefixOptions.find(o => this.searchQuery.startsWith(o.prefix)) || null;
  }

  submitSearch(): void {
    if (!this.searchQuery.trim()) return;
    this.showPrefixHints = false;
    this.isSearchLoading = true;
    this.searchByPrefix(this.searchQuery).pipe(
      takeUntil(this.destroy$),
      finalize(() => this.isSearchLoading = false)
    ).subscribe(results => {
      this.searchResults = (results as any[]).slice(0, 6);
      this.hasSearched = true;
    });
  }

  private searchByPrefix(fullQuery: string) {
    const effectiveQuery = this.selectedPrefix ? this.selectedPrefix.prefix + fullQuery : fullQuery;
    const tagMatch = effectiveQuery.match(/^tag:(.+)/i);
    const nameMatch = effectiveQuery.match(/^name:(.+)/i);
    const authorMatch = effectiveQuery.match(/^author:(.+)/i);
    const artistMatch = effectiveQuery.match(/^artist:(.+)/i);

    if (tagMatch) {
      const tagName = tagMatch[1].trim();
      const tag = this.tags.find((t: Tag) => t.name.toLowerCase().includes(tagName.toLowerCase()));
      if (tag) {
        return this.mangaService.getByCategories([tag.id]);
      }
      const catTag = this.categories.find((c: any) => c.genresIdName.toLowerCase().includes(tagName.toLowerCase()));
      if (catTag) {
        return this.mangaService.getByCategories([catTag.genreId]);
      }
      return this.mangaService.filter({ name: tagName, pageSize: 6 });
    }

    if (nameMatch) {
      return this.mangaService.filter({ name: nameMatch[1].trim(), pageSize: 6 });
    }

    if (authorMatch || artistMatch) {
      const name = (authorMatch || artistMatch)![1].trim();
      return this.mangaService.filter({ name, pageSize: 6 });
    }

    return this.mangaService.filter({ name: fullQuery.trim(), pageSize: 6 });
  }

  // ── Recommend (tag / author / artist) ───────────────────────────────────────

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
      case 'tag:': return this.tags;
      case 'author:': return this.authors;
      case 'artist:': return this.artists;
      default: return [];
    }
  }

  private updateRecommend(query: string): void {
    const source = this.recommendSource;
    this.recommendList = (!query ? source : source.filter(item => item.name.toLowerCase().includes(query))).slice(0, 12);
    this.showRecommend = true;
    this.recommendIndex = this.recommendList.length > 0 ? 0 : -1;
  }

  private hideRecommend(): void {
    this.showRecommend = false;
    this.recommendList = [];
    this.recommendIndex = -1;
  }

  selectRecommendItem(item: RecommendItem): void {
    this.searchQuery = item.name;
    this.hideRecommend();
    this.isSearchLoading = true;

    const prefix = this.selectedPrefix?.prefix;
    const search$ = prefix === 'tag:'
      ? this.mangaService.getByCategories([item.id])
      : this.mangaService.filter({ name: item.name, pageSize: 6 });

    search$.pipe(
      takeUntil(this.destroy$),
      finalize(() => this.isSearchLoading = false)
    ).subscribe(r => {
      this.searchResults = (r as any[]).slice(0, 6);
      this.hasSearched = true;
    });
  }

  goToManga(item: any): void {
    this.router.navigate(['/manga', item.mangaId, encodeURIComponent(item.mangaName)]);
    this.searchResults = [];
    this.searchQuery = '';
  }

  loadNotifications(): void {
    if (!this.user) return;
    this.userInteraction.getUnreadNotifications(this.user.id).subscribe(notifs => {
      this.notifService.setNotifications(notifs as any);
    });
  }

  openNotif(item: any): void {
    this.userInteraction.markNotificationRead(item.id).subscribe();
    this.notifService.decrementUnread();
    if (item.idTarget) this.router.navigate(['/manga', item.idTarget, item.target]);
    this.isNotifOpen = false;
  }

  switchLang(lang: SupportedLang): void {
    this.translation.setLanguage(lang);
    this.isLangOpen = false;
  }

  logout(): void {
    this.auth.logout();
    this.notifService.stopHub();
    this.router.navigate(['/']);
  }
  t(key: string): string {
    return this.translation.get(key);
  }
}
