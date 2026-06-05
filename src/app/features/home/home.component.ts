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
  popularManga: Manga[] = [];
  recommendedManga: Manga[] = [];
  trendingManga: any[] = [];
  categories: any[] = [];
  isLoading = true;

  topListPeriod: 'day' | 'month' | 'year' = 'month';

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
      latest: this.mangaService.getNewestManga(1, 12),
      trending: this.mangaService.getTrending(10),
      categories: this.mangaService.getCategories(),
      popular: this.mangaService.getPopular(1, 6),
      recommended: this.mangaService.getRecommended(2, 6)
    }).pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ latest, trending, categories, popular, recommended }) => {
          this.latestManga = latest || [];
          this.trendingManga = trending || [];
          this.categories = categories || [];
          this.popularManga = popular || [];
          this.recommendedManga = recommended || [];
          this.isLoading = false;
        },
        error: () => {
          this.isLoading = false;
        }
      });
  }

  onTopListPeriodChange(period: 'day' | 'month' | 'year'): void {
    this.topListPeriod = period;
    // TODO: call period-specific API when available
    // e.g. this.mangaService.getTrending(10, period)
  }
}
