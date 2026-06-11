import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { MasterDataService } from '../../core/services/master-data.service';
import { MangaSumaryDto, TopMangaDto } from '../../core/models/manga.interface';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit, OnDestroy {
  latestManga: MangaSumaryDto[] = [];
  popularManga: MangaSumaryDto[] = [];
  categories: any[] = [];
  randomCategories: any[] = [];
  isLoading = true;

  topByDay: TopMangaDto[] = [];
  topByMonth: TopMangaDto[] = [];
  topByYear: TopMangaDto[] = [];
  topListPeriod: 'day' | 'month' | 'year' = 'month';

  isMobile = false;
  isCategoriesCollapsed = false;
  isTopListCollapsed = false;

  private destroy$ = new Subject<void>();

  constructor(private masterData: MasterDataService) {}

  ngOnInit(): void {
    this.isMobile = window.innerWidth <= 992;
    if (this.isMobile) {
      this.isCategoriesCollapsed = true;
      this.isTopListCollapsed = true;
    }
    this.loadData();
  }

  @HostListener('window:resize')
  onResize(): void {
    this.isMobile = window.innerWidth <= 992;
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

    this.masterData.homepage$.pipe(takeUntil(this.destroy$)).subscribe({
      next: (homepage) => {
        this.latestManga = homepage.lastUpdate || [];
        this.popularManga = homepage.popular || [];
        this.topByDay = homepage.topMangaByDate || [];
        this.topByMonth = homepage.topMangaByMonth || [];
        this.topByYear = homepage.topMangaByYear || [];
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
      }
    });
  }

  get currentTopList(): TopMangaDto[] {
    switch (this.topListPeriod) {
      case 'day': return this.topByDay;
      case 'month': return this.topByMonth;
      case 'year': return this.topByYear;
    }
  }

  onTopListPeriodChange(period: 'day' | 'month' | 'year'): void {
    this.topListPeriod = period;
  }
}
