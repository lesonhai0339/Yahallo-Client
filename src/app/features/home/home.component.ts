import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject, forkJoin, takeUntil } from 'rxjs';
import { MangaService } from '../../core/services/manga.service';
import { Manga } from '../../core/models/interfaces';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit, OnDestroy {
  latestManga: Manga[] = [];
  trendingManga: any[] = [];
  categories: any[] = [];
  totalPages = 1;
  currentPage = 1;
  isLoading = true;

  private destroy$ = new Subject<void>();

  constructor(private mangaService: MangaService) {}

  ngOnInit(): void {
    this.loadData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadData(): void {
    this.isLoading = true;
    forkJoin({
      latest: this.mangaService.getNewestManga(this.currentPage),
      trending: this.mangaService.getTrending(10),
      categories: this.mangaService.getCategories(),
      pageCount: this.mangaService.getPageCount()
    }).pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ latest, trending, categories, pageCount }) => {
          this.latestManga = latest || [];
          this.trendingManga = trending || [];
          this.categories = categories || [];
          this.totalPages = typeof pageCount === 'number' ? pageCount : 1;
          this.isLoading = false;
        },
        error: () => {
          this.isLoading = false;
          this.mangaService.getAll(this.currentPage).pipe(takeUntil(this.destroy$)).subscribe(m => {
            this.latestManga = m || [];
          });
        }
      });
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages || page === this.currentPage) return;
    this.currentPage = page;
    this.isLoading = true;
    this.mangaService.getAll(page).pipe(takeUntil(this.destroy$)).subscribe(m => {
      this.latestManga = m || [];
      this.isLoading = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  get paginationPages(): number[] {
    const pages: number[] = [];
    const delta = 2;
    const from = Math.max(1, this.currentPage - delta);
    const to = Math.min(this.totalPages, this.currentPage + delta);
    for (let i = from; i <= to; i++) pages.push(i);
    return pages;
  }
}
