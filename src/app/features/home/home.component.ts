import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject, forkJoin, takeUntil } from 'rxjs';
import { MangaService } from '../../core/services/manga.service';
import { MasterDataService } from '../../core/services/master-data.service';
import { MangaSumaryDto } from '../../core/models/manga.interface';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit, OnDestroy {
  latestManga: MangaSumaryDto[] = [];
  popularManga: MangaSumaryDto[] = [];
  recommendedManga: MangaSumaryDto[] = [];
  trendingManga: any[] = [];
  categories: any[] = [];
  randomCategories: any[] = [];
  isLoading = true;

  topListPeriod: 'day' | 'month' | 'year' = 'month';

  private destroy$ = new Subject<void>();

  constructor(private mangaService: MangaService, private masterData: MasterDataService) {}

  ngOnInit(): void {
    this.loadData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadData(): void {
    this.isLoading = true;
    this.masterData.categories$.pipe(takeUntil(this.destroy$)).subscribe(c => {
      this.categories = c;
      this.randomCategories = [...c].sort(() => Math.random() - 0.5).slice(0, 20);
    });

    forkJoin({
      latest: this.mangaService.getNewestManga(1, 12),
      popular: this.mangaService.getPopular(1, 6),
      recommended: this.mangaService.getNewestManga(2, 6)
    }).pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ latest, popular, recommended }) => {
          this.latestManga = latest || [];
          this.trendingManga = (latest || []).slice(0, 5).map((m: any) => ({
            mangaId: m.id, mangaName: m.name, mangaImage: m.mangaThumbnail,
            totalViews: m.totalViews, averageRating: m.averageRating
          }));
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
