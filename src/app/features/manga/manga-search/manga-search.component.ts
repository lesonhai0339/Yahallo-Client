import { Component, OnInit, OnDestroy, ElementRef, HostListener, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, of, debounceTime, distinctUntilChanged, switchMap, takeUntil, finalize } from 'rxjs';
import { MangaService } from '../../../core/services/manga.service';
import { TagService } from '../../../core/services/tag.service';
import { Manga, Tag } from '../../../core/models/interfaces';

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

  showPrefixHints = false;
  highlightedPrefixIndex = -1;
  selectedPrefix: SearchPrefix | null = null;
  showTagDropdown = false;
  tagSearchText = '';
  tagHighlightedIndex = -1;

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

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private mangaService: MangaService,
    private tagService: TagService,
    private host: ElementRef
  ) {}

  ngOnInit(): void {
    this.isAdvanced = this.router.url.includes('advanced');

    this.mangaService.getCategories().pipe(takeUntil(this.destroy$)).subscribe(c => this.categories = c || []);
    this.tagService.getAll().pipe(takeUntil(this.destroy$)).subscribe((res: any) => {
      this.tags = (res?.value ?? res?.data ?? res) || [];
    });

    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      if (params['q']) {
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
          return of([]);
        }
        this.isLoading = true;
        return this.executeSearchByPrefix(q).pipe(
          finalize(() => this.isLoading = false)
        );
      }),
      takeUntil(this.destroy$)
    ).subscribe(r => {
      this.results = r as Manga[];
      this.hasSearched = true;
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: MouseEvent): void {
    if (!this.host.nativeElement.contains(e.target as Node)) {
      this.showPrefixHints = false;
      this.showTagDropdown = false;
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
    setTimeout(() => this.searchInputRef?.nativeElement.focus(), 0);
  }

  clearPrefix(): void {
    this.selectedPrefix = null;
    this.searchQuery = '';
    this.results = [];
    this.hasSearched = false;
    setTimeout(() => this.searchInputRef?.nativeElement.focus(), 0);
  }

  get activePrefixOption(): SearchPrefix | null {
    return this.selectedPrefix || this.prefixOptions.find(o => this.searchQuery.startsWith(o.prefix)) || null;
  }

  // ── Search logic ──────────────────────────────────────────────────────────

  onSearchInput(): void {
    const q = this.searchQuery.trim().toLowerCase();

    if (!this.selectedPrefix) {
      if (!q) {
        this.showPrefixHints = true;
        this.filteredPrefixOptions = [];
        this.highlightedPrefixIndex = 0;
        return;
      }

      const exactPrefix = this.prefixOptions.find(o => o.prefix === q);
      if (exactPrefix) {
        this.showPrefixHints = true;
        this.filteredPrefixOptions = [];
        this.highlightedPrefixIndex = this.prefixOptions.indexOf(exactPrefix);
        return;
      }

      const matchingPrefixes = this.getMatchingPrefixes(q);
      if (matchingPrefixes.length > 0) {
        this.showPrefixHints = true;
        this.filteredPrefixOptions = matchingPrefixes;
        this.highlightedPrefixIndex = 0;
        return;
      }
    }

    this.showPrefixHints = false;
    this.filteredPrefixOptions = [];
    this.highlightedPrefixIndex = -1;
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
    this.executeSearchByPrefix(this.searchQuery).pipe(
      takeUntil(this.destroy$),
      finalize(() => this.isLoading = false)
    ).subscribe(r => {
      this.results = r as Manga[];
      this.hasSearched = true;
    });
  }

  private executeSearch(query: string): void {
    this.isLoading = true;
    this.executeSearchByPrefix(query).pipe(
      takeUntil(this.destroy$),
      finalize(() => this.isLoading = false)
    ).subscribe(r => {
      this.results = r as Manga[];
      this.hasSearched = true;
    });
  }

  private executeSearchByPrefix(fullQuery: string) {
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
      return this.mangaService.filter({ name: tagName, pageSize: 30 });
    }

    if (nameMatch) {
      return this.mangaService.filter({ name: nameMatch[1].trim(), pageSize: 30 });
    }

    if (authorMatch || artistMatch) {
      const name = (authorMatch || artistMatch)![1].trim();
      return this.mangaService.filter({ name: name, pageSize: 30 });
    }

    return this.mangaService.filter({ name: fullQuery.trim(), pageSize: 30 });
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
      this.searchByCategories();
    }
    this.tagSearchText = '';
    this.showTagDropdown = false;
    this.tagHighlightedIndex = -1;
    setTimeout(() => this.tagInputRef?.nativeElement.focus(), 0);
  }

  removeCategory(id: string): void {
    this.selectedCategories = this.selectedCategories.filter(sid => sid !== id);
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

  toggleCategoryChip(cat: any): void {
    if (this.selectedCategories.includes(cat.genreId)) {
      this.removeCategory(cat.genreId);
    } else {
      this.selectedCategories = [...this.selectedCategories, cat.genreId];
      this.searchByCategories();
    }
  }

  searchByCategories(): void {
    this.isLoading = true;
    this.mangaService.getByCategories(this.selectedCategories).pipe(
      takeUntil(this.destroy$),
      finalize(() => this.isLoading = false)
    ).subscribe(r => {
      this.results = r as Manga[];
      this.hasSearched = true;
    });
  }

  private scrollToTagHighlighted(): void {
    if (!this.tagDropdownEl) return;
    const el = this.tagDropdownEl.nativeElement;
    const item = el.querySelectorAll('.tag-dropdown-item')[this.tagHighlightedIndex] as HTMLElement;
    item?.scrollIntoView({ block: 'nearest' });
  }
}
