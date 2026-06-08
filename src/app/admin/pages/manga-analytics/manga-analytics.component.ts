import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import 'chart.js';
import {
  AnalyticsService, MangaAnalytics, TimeRange, ChartType, DateDetail, TimeSeriesPoint
} from '../../services/analytics.service';
import { AdminMangaService } from '../../services/admin-manga.service';

interface DetailPanel {
  visible: boolean;
  loading: boolean;
  chartKey: string;
  label: string;
  date: string;
  detail: DateDetail | null;
}

@Component({
  selector: 'app-manga-analytics',
  templateUrl: './manga-analytics.component.html',
  styleUrls: ['./manga-analytics.component.scss']
})
export class MangaAnalyticsComponent implements OnInit {
  mangaId = '';
  mangaName = '';
  loading = true;
  selectedRange: TimeRange = 'daily';
  ranges: TimeRange[] = ['daily', 'monthly', 'yearly'];
  analytics: MangaAnalytics | null = null;

  viewsChartType: ChartType = 'area';
  commentsChartType: ChartType = 'bar';
  chartTypes: ChartType[] = ['line', 'bar', 'area'];

  viewsData: TimeSeriesPoint[] = [];
  commentsData: TimeSeriesPoint[] = [];

  viewsChart: any = { labels: [], datasets: [] };
  commentsChart: any = { labels: [], datasets: [] };

  detailPanel: DetailPanel = { visible: false, loading: false, chartKey: '', label: '', date: '', detail: null };

  viewsChartOptions: any = {};
  commentsChartOptions: any = {};

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private analyticsService: AnalyticsService,
    private mangaService: AdminMangaService
  ) {}

  ngOnInit(): void {
    this.mangaId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.mangaId) { this.router.navigate(['/admin/manga']); return; }
    this.loadMangaInfo();
    this.loadAnalytics();
  }

  onRangeChange(range: TimeRange): void {
    this.selectedRange = range;
    this.closeDetail();
    this.loadAnalytics();
  }

  onChartTypeChange(chart: 'views' | 'comments', type: ChartType): void {
    if (chart === 'views') {
      this.viewsChartType = type;
      this.rebuildViewsChart();
    } else {
      this.commentsChartType = type;
      this.rebuildCommentsChart();
    }
  }

  onViewsClick(event: any): void {
    this.handleChartClick('views', event, this.viewsData);
  }

  onCommentsClick(event: any): void {
    this.handleChartClick('comments', event, this.commentsData);
  }

  closeDetail(): void {
    this.detailPanel = { visible: false, loading: false, chartKey: '', label: '', date: '', detail: null };
  }

  goBack(): void {
    this.router.navigate(['/admin/manga']);
  }

  getChartJsType(type: ChartType): 'line' | 'bar' {
    return type === 'bar' ? 'bar' : 'line';
  }

  private handleChartClick(
    chartKey: string,
    event: any,
    dataPoints: TimeSeriesPoint[]
  ): void {
    if (!event.active?.length) return;
    const idx = event.active[0].index;
    const point = dataPoints[idx];
    if (!point) return;

    this.detailPanel = { visible: true, loading: true, chartKey, label: point.label, date: point.date, detail: null };

    const obs = chartKey === 'views'
      ? this.analyticsService.getMangaViewsDetail(this.mangaId, point.date)
      : this.analyticsService.getMangaCommentsDetail(this.mangaId, point.date);

    obs.subscribe(detail => {
      this.detailPanel.detail = detail;
      this.detailPanel.loading = false;
    });
  }

  private loadMangaInfo(): void {
    this.mangaService.getDetail(this.mangaId).subscribe({
      next: (res: any) => { this.mangaName = (res?.value ?? res)?.name ?? 'Unknown'; },
      error: () => { this.mangaName = 'Unknown'; }
    });
  }

  private loadAnalytics(): void {
    this.loading = true;
    this.analyticsService.getMangaAnalytics(this.mangaId, this.selectedRange).subscribe(data => {
      this.analytics = data;
      this.viewsData = data.viewsByTime;
      this.commentsData = data.commentsByTime;
      this.rebuildViewsChart();
      this.rebuildCommentsChart();
      this.loading = false;
    });
  }

  private rebuildViewsChart(): void {
    const isFill = this.viewsChartType === 'area';
    const isBar = this.viewsChartType === 'bar';
    this.viewsChart = {
      labels: this.viewsData.map(p => p.label),
      datasets: [{
        data: this.viewsData.map(p => p.value),
        label: 'Lượt xem',
        borderColor: '#0ea5e9',
        backgroundColor: isBar ? 'rgba(14, 165, 233, 0.6)' : 'rgba(14, 165, 233, 0.1)',
        fill: isFill,
        pointBackgroundColor: '#0ea5e9',
        borderRadius: isBar ? 4 : undefined,
        tension: isBar ? undefined : 0.35,
        borderWidth: isBar ? 1 : 2,
        pointRadius: isBar ? undefined : 3,
        pointHoverRadius: isBar ? undefined : 6,
      }]
    };
    this.viewsChartOptions = this.buildOptions();
  }

  private rebuildCommentsChart(): void {
    const isFill = this.commentsChartType === 'area';
    const isBar = this.commentsChartType === 'bar';
    this.commentsChart = {
      labels: this.commentsData.map(p => p.label),
      datasets: [{
        data: this.commentsData.map(p => p.value),
        label: 'Bình luận',
        borderColor: '#8b5cf6',
        backgroundColor: isBar ? 'rgba(139, 92, 246, 0.6)' : 'rgba(139, 92, 246, 0.1)',
        fill: isFill,
        pointBackgroundColor: '#8b5cf6',
        borderRadius: isBar ? 4 : undefined,
        tension: isBar ? undefined : 0.35,
        borderWidth: isBar ? 1 : 2,
        pointRadius: isBar ? undefined : 3,
        pointHoverRadius: isBar ? undefined : 6,
      }]
    };
    this.commentsChartOptions = this.buildOptions();
  }

  private buildOptions(): any {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(20,20,30,0.95)',
          borderColor: 'rgba(233,69,96,0.3)',
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            afterBody: () => ['', 'Click để xem chi tiết']
          }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888', font: { size: 10 } } },
        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888' } }
      },
      elements: { line: { tension: 0.35, borderWidth: 2 }, point: { radius: 3, hoverRadius: 6 } },
      onClick: () => {}
    };
  }
}
