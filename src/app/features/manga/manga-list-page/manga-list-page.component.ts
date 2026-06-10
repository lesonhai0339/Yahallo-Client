import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { MangaService } from '../../../core/services/manga.service';
import { MangaSumaryDto } from '../../../core/models/manga.interface';

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

  titleKey = '';
  icon = '';
  mode: 'latest' | 'popular' = 'latest';

  private destroy$ = new Subject<void>();

  constructor(
    private mangaService: MangaService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.mode = this.route.snapshot.data['mode'] ?? 'latest';
    this.titleKey = this.route.snapshot.data['titleKey'] ?? 'HOME.LATEST_UPDATE';
    this.icon = this.route.snapshot.data['icon'] ?? 'fa-solid fa-clock-rotate-left';
    this.loadPage();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadPage(): void {
    this.isLoading = true;
    const api$ = this.mode === 'popular'
      ? this.mangaService.getPopularPaginated(this.currentPage, this.pageSize)
      : this.mangaService.getNewestMangaPaginated(this.currentPage, this.pageSize);
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
