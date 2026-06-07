import { Component, OnInit, OnDestroy, ElementRef, HostListener, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, Observable, of, debounceTime, distinctUntilChanged, switchMap, takeUntil, finalize } from 'rxjs';
import { MangaService } from '../../../core/services/manga.service';
import { MasterDataService } from '../../../core/services/master-data.service';
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
  searchQuery = '';
  isLoading = false;
  hasSearched = false;
  isAdvanced = false;

  currentPage = 1;
  totalPages = 1;
  totalCount = 0;
  pageSize = 10;
  pageSizeOptions = [10, 20, 50];
  viewMode: 'list' | 'grid' = 'grid';

  showPrefixHints = false;
  highlightedPrefixIndex = -1;
  selectedPrefix: SearchPrefix | null = null;
  showTagDropdown = false;
  tagSearchText = '';
  tagHighlightedIndex = -1;

  showAuthorGrid = false;
  showArtistGrid = false;
  showCategoryGrid = false;
  selectedAuthor: RecommendItem | null = null;
  selectedArtist: RecommendItem | null = null;
  showRecommend = false;
  recommendList: RecommendItem[] = [];
  recommendIndex = -1;

  authors: RecommendItem[] = [];
  artists: RecommendItem[] = [];

  readonly prefixOptions: SearchPrefix[] = [
    { prefix: 'tag:',    label: 'SEARCH.PREFIX_TAG',    icon: 'fa-solid fa-tags',    hint: 'SEARCH.PREFIX_TAG_HINT' },
    { prefix: 'name:',   label: 'SEARCH.PREFIX_NAME',   icon: 'fa-solid fa-book',    hint: 'SEARCH.PREFIX_NAME_HINT' },
    { prefix: 'author:', label: 'SEARCH.PREFIX_AUTHOR', icon: 'fa-solid fa-pen-nib', hint: 'SEARCH.PREFIX_AUTHOR_HINT' },
    { prefix: 'artist:', label: 'SEARCH.PREFIX_ARTIST', icon: 'fa-solid fa-palette', hint: 'SEARCH.PREFIX_ARTIST_HINT' },
  ];
  filteredPrefixOptions: SearchPrefix[] = [];

  @ViewChild('searchInput') searchInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('tagInput') tagInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('tagDropdownEl') tagDropdownEl?: ElementRef<HTMLElement>;

  private searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();
  private _skipInput = false;
  private pendingQueryParams: any = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private mangaService: MangaService,
    private masterData: MasterDataService,
    private host: ElementRef
  ) {}

  ngOnInit(): void {
    this.isAdvanced = this.router.url.includes('advanced');

    this.masterData.categories$.pipe(takeUntil(this.destroy$)).subscribe(c => {
      this.categories = c;
      this.applyPendingParams();
    });
    this.masterData.tags$.pipe(takeUntil(this.destroy$)).subscribe(t => this.tags = t);
    this.masterData.authors$.pipe(takeUntil(this.destroy$)).subscribe(a => this.authors = a);
    this.masterData.artists$.pipe(takeUntil(this.destroy$)).subscribe(a => this.artists = a);

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
        this.isLoading = true;
        this.currentPage = 1;
        return this.executeSearchByPrefix(q, 1).pipe(
          finalize(() => this.isLoading = false)
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
    this.destroy$.next();
    this.destroy$.complete();
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
    if (!this.host.nativeElement.contains(e.target as Node)) {
      this.showPrefixHints = false;
      this.showTagDropdown = false;
      this.showRecommend = false;
    }
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
    this.isLoading = true;
    this.currentPage = 1;
    this.executeSearchByPrefix(this.searchQuery, 1).pipe(
      takeUntil(this.destroy$),
      finalize(() => this.isLoading = false)
    ).subscribe(r => {
      this.results = r.data;
      this.totalPages = r.totalPages;
      this.totalCount = r.totalCount || r.totalPages * this.pageSize;
      this.hasSearched = true;
    });
  }

  private executeSearch(query: string): void {
    this.isLoading = true;
    this.currentPage = 1;
    this.executeSearchByPrefix(query, 1).pipe(
      takeUntil(this.destroy$),
      finalize(() => this.isLoading = false)
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
    if (this.selectedCategories.length > 0) {
      this.searchByCategories();
    } else if (this.searchQuery.trim()) {
      this.isLoading = true;
      this.executeSearchByPrefix(this.searchQuery, this.currentPage).pipe(
        takeUntil(this.destroy$),
        finalize(() => this.isLoading = false)
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
      case 'tag:': return this.tags;
      case 'author:': return this.authors;
      case 'artist:': return this.artists;
      default: return [];
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

  // ── Category multi-tag selector (Advanced) ────────────────────────────────

  get selectedCategoryItems(): any[] {
    return this.categories.filter(c => this.selectedCategories.includes(c.genreId));
  }

  get filteredCategories(): any[] {
    const q = this.tagSearchText.toLowerCase().trim();
    return this.categories
      .filter(c =>
        !this.selectedCategories.includes(c.genreId) &&
        (!q || c.genresIdName.toLowerCase().includes(q))
      )
      .slice(0, 15);
  }

  focusTagInput(): void {
    this.tagInputRef?.nativeElement.focus();
  }

  toggleTagDropdown(): void {
    this.showTagDropdown = !this.showTagDropdown;
    if (this.showTagDropdown) {
      this.tagHighlightedIndex = this.filteredCategories.length ? 0 : -1;
      setTimeout(() => this.tagInputRef?.nativeElement.focus(), 0);
    }
  }

  onTagFocus(): void {
    this.showTagDropdown = true;
    this.tagHighlightedIndex = this.filteredCategories.length ? 0 : -1;
  }

  onTagInput(): void {
    this.showTagDropdown = true;
    this.tagHighlightedIndex = this.filteredCategories.length ? 0 : -1;
  }

  onTagKeyDown(event: KeyboardEvent): void {
    const items = this.filteredCategories;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.showTagDropdown = true;
        this.tagHighlightedIndex = Math.min(this.tagHighlightedIndex + 1, items.length - 1);
        this.scrollToTagHighlighted();
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.tagHighlightedIndex = Math.max(this.tagHighlightedIndex - 1, 0);
        this.scrollToTagHighlighted();
        break;
      case 'Enter':
        event.preventDefault();
        if (this.tagHighlightedIndex >= 0 && items[this.tagHighlightedIndex]) {
          this.selectCategory(items[this.tagHighlightedIndex]);
        }
        break;
      case 'Escape':
        this.showTagDropdown = false;
        break;
      case 'Backspace':
        if (!this.tagSearchText && this.selectedCategories.length) {
          this.removeLastCategory();
        }
        break;
    }
  }

  selectCategory(cat: any): void {
    if (!this.selectedCategories.includes(cat.genreId)) {
      this.selectedCategories = [...this.selectedCategories, cat.genreId];
      this.currentPage = 1;
      this.searchByCategories();
    }
    this.tagSearchText = '';
    this.showTagDropdown = false;
    this.tagHighlightedIndex = -1;
    setTimeout(() => this.tagInputRef?.nativeElement.focus(), 0);
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

  selectAuthorChip(author: RecommendItem): void {
    this.selectedAuthor = this.selectedAuthor?.id === author.id ? null : author;
    this.selectedArtist = null;
    this.selectedCategories = [];
    this.currentPage = 1;
    if (this.selectedAuthor) {
      this.isLoading = true;
      this.results = [];
      this.mangaService.filterPaginated({ authorId: author.id, pageNo: 1, pageSize: this.pageSize }).pipe(
        takeUntil(this.destroy$),
        finalize(() => this.isLoading = false)
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
      this.isLoading = true;
      this.results = [];
      this.mangaService.filterPaginated({ artistId: artist.id, pageNo: 1, pageSize: this.pageSize }).pipe(
        takeUntil(this.destroy$),
        finalize(() => this.isLoading = false)
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

  searchByCategories(): void {
    this.isLoading = true;
    this.results = [];
    this.mangaService.filterPaginated({ tagIds: this.selectedCategories, pageNo: this.currentPage, pageSize: this.pageSize }).pipe(
      takeUntil(this.destroy$),
      finalize(() => this.isLoading = false)
    ).subscribe(r => {
      this.results = r.data;
      this.totalPages = r.totalPages;
      this.totalCount = r.totalCount || r.totalPages * this.pageSize;
      this.hasSearched = true;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  private scrollToTagHighlighted(): void {
    if (!this.tagDropdownEl) return;
    const el = this.tagDropdownEl.nativeElement;
    const item = el.querySelectorAll('.tag-dropdown-item')[this.tagHighlightedIndex] as HTMLElement;
    item?.scrollIntoView({ block: 'nearest' });
  }
}
