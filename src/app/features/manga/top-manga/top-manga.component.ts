import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { MangaService } from '../../../core/services/manga.service';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';
import { Manga } from '../../../core/models/interfaces';

export interface SortOption {
  key: string;
  labelKey: string;
  icon: string;
  direction: 'desc' | 'asc';
}

@Component({
  selector: 'app-top-manga',
  templateUrl: './top-manga.component.html',
  styleUrls: ['./top-manga.component.scss']
})
export class TopMangaComponent implements OnInit, OnDestroy {
  mangaList: Manga[] = [];
  sortedList: Manga[] = [];
  isLoading = true;
  currentPage = 1;
  totalPages = 1;
  totalCount = 0;
  pageSize = 20;
  pageSizeOptions = [10, 20, 50];
  viewMode: 'list' | 'grid' = 'list';

  sortOptions: SortOption[] = [
    { key: 'totalViews',    labelKey: 'TOP.VIEWS',    icon: 'fa-solid fa-eye',              direction: 'desc' },
    { key: 'averageRating', labelKey: 'TOP.RATING',   icon: 'fa-solid fa-star',             direction: 'desc' },
    { key: 'totalChapters', labelKey: 'TOP.CHAPTERS', icon: 'fa-solid fa-book',             direction: 'desc' },
    { key: 'totalComments', labelKey: 'TOP.COMMENTS', icon: 'fa-solid fa-comment',          direction: 'desc' },
    { key: 'updateDate',    labelKey: 'TOP.UPDATED',  icon: 'fa-solid fa-clock-rotate-left', direction: 'desc' },
  ];

  activeSort: SortOption = this.sortOptions[0];
  showFilters = false;

  filterDateFrom = '';
  filterDateTo = '';
  filterRatingMin = 0;
  filterRatingMax = 10;

  readonly criterionMap: Record<string, string> = {
    views: 'totalViews',
    rating: 'averageRating',
    chapters: 'totalChapters',
    comments: 'totalComments',
    updated: 'updateDate',
  };

  private destroy$ = new Subject<void>();

  constructor(
    private mangaService: MangaService,
    private route: ActivatedRoute,
    private router: Router,
    private prefs: UserPreferencesService
  ) {}

  ngOnInit(): void {
    this.pageSize = this.prefs.current.defaultPageSize;
    this.viewMode = this.prefs.current.defaultView;
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const criterion = params['criterion'];
      if (criterion && this.criterionMap[criterion]) {
        const opt = this.sortOptions.find(o => o.key === this.criterionMap[criterion]);
        if (opt) this.activeSort = opt;
      }
      this.loadPage();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadPage(): void {
    this.isLoading = true;
    this.mangaService.getTopMangaPaginated(this.currentPage, this.pageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data, totalPages, totalCount }) => {
          this.mangaList = data;
          this.totalPages = totalPages;
          this.totalCount = totalCount || totalPages * this.pageSize;
          this.applySorting();
          this.isLoading = false;
        },
        error: () => { this.isLoading = false; }
      });
  }

  setViewMode(mode: 'list' | 'grid'): void {
    this.viewMode = mode;
  }

  setPageSize(size: number): void {
    if (size === this.pageSize) return;
    const oldSize = this.pageSize;
    this.pageSize = size;
    this.currentPage = 1;
    this.totalPages = Math.max(1, Math.ceil(this.totalCount / size));

    if (size <= this.mangaList.length) {
      this.mangaList = this.mangaList.slice(0, size);
      this.applySorting();
    } else {
      this.loadPage();
    }
  }

  setSort(option: SortOption): void {
    if (this.activeSort.key === option.key) {
      option.direction = option.direction === 'desc' ? 'asc' : 'desc';
    }
    this.activeSort = option;
    const slug = Object.entries(this.criterionMap).find(([, v]) => v === option.key)?.[0] || 'views';
    this.router.navigate(['/top-manga', slug], { replaceUrl: true });
    this.applySorting();
  }

  private applySorting(): void {
    const key = this.activeSort.key;
    const dir = this.activeSort.direction === 'desc' ? -1 : 1;

    let filtered = [...this.mangaList];

    if (this.filterDateFrom) {
      const from = new Date(this.filterDateFrom).getTime();
      filtered = filtered.filter((m: any) => {
        const d = m.updateDate ? new Date(m.updateDate).getTime() : 0;
        return d >= from;
      });
    }
    if (this.filterDateTo) {
      const to = new Date(this.filterDateTo).getTime() + 86400000;
      filtered = filtered.filter((m: any) => {
        const d = m.updateDate ? new Date(m.updateDate).getTime() : 0;
        return d <= to;
      });
    }

    if (key === 'averageRating') {
      filtered = filtered.filter((m: any) => {
        const r = m.averageRating ?? 0;
        return r >= this.filterRatingMin && r <= this.filterRatingMax;
      });
    }

    this.sortedList = filtered.sort((a: any, b: any) => {
      let valA = a[key];
      let valB = b[key];

      if (key === 'updateDate') {
        valA = valA ? new Date(valA).getTime() : 0;
        valB = valB ? new Date(valB).getTime() : 0;
      }

      if (key === 'totalComments') {
        valA = a.comments?.length ?? 0;
        valB = b.comments?.length ?? 0;
      }

      return ((valA ?? 0) - (valB ?? 0)) * dir;
    });
  }

  applyFilters(): void {
    this.applySorting();
  }

  clearFilters(): void {
    this.filterDateFrom = '';
    this.filterDateTo = '';
    this.filterRatingMin = 0;
    this.filterRatingMax = 10;
    this.applySorting();
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

  getRank(index: number): number {
    return (this.currentPage - 1) * this.pageSize + index + 1;
  }

  goToTag(event: Event, tagId: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.router.navigate(['/search/advanced'], { queryParams: { tagId } });
  }

  formatViews(views: number): string {
    if (!views) return '0';
    if (views >= 1_000_000) return (views / 1_000_000).toFixed(1) + 'M';
    if (views >= 1_000) return (views / 1_000).toFixed(1) + 'K';
    return views.toString();
  }
}
