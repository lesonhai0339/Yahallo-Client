import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import 'chart.js';
import {
  AnalyticsService, MangaAnalytics, TimeRange, ChartType, DateDetail, TimeSeriesPoint, StatCell
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
  // selectedRange giờ là cách NHÓM dữ liệu (GroupBy: Day/Month/Year), không còn
  // quyết định khoảng thời gian — khoảng đó do From/To người dùng chọn.
  selectedRange: TimeRange = 'daily';
  ranges: TimeRange[] = ['daily', 'monthly', 'yearly'];
  fromDate = '';   // yyyy-MM-dd (input type=date)
  toDate = '';     // yyyy-MM-dd
  analytics: MangaAnalytics | null = null;

  viewsChartType: ChartType = 'area';
  commentsChartType: ChartType = 'bar';
  chartTypes: ChartType[] = ['line', 'bar', 'area'];

  viewsData: TimeSeriesPoint[] = [];
  commentsData: TimeSeriesPoint[] = [];

  // 2 block mini-stat: toàn thời gian + theo range đang chọn
  allTimeStats: StatCell[] = [];
  rangeStats: StatCell[] = [];

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
    this.initDefaultDates();
    this.loadMangaInfo();
    this.loadAnalytics();
  }

  /** Mặc định: từ đầu tháng hiện tại → hôm nay. */
  private initDefaultDates(): void {
    const now = new Date();
    this.fromDate = this.toInputDate(new Date(now.getFullYear(), now.getMonth(), 1));
    this.toDate = this.toInputDate(now);
  }

  /** Chọn option GroupBy (Ngày/Tháng/Năm) — chỉ đổi lựa chọn, áp khi bấm "Đi". */
  onRangeChange(range: TimeRange): void {
    this.selectedRange = range;
  }

  /** Khoảng From/To hợp lệ để bấm "Đi". */
  get canApply(): boolean {
    return !!this.fromDate && !!this.toDate && this.fromDate <= this.toDate;
  }

  /** Bấm "Đi" → áp khoảng From/To đang chọn và nạp lại. */
  applyFilter(): void {
    if (!this.canApply) return;
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

  /** Nhãn block theo range = khoảng From/To đang chọn. */
  get rangeLabel(): string {
    if (!this.fromDate || !this.toDate) return '';
    return `${this.toDisplayDate(this.fromDate)} → ${this.toDisplayDate(this.toDate)}`;
  }

  private toInputDate(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  private toDisplayDate(s: string): string {
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  }

  /** yyyy-MM-dd → Date. `endOfDay` để To bao trọn cả ngày (23:59:59). */
  private parseInputDate(s: string, endOfDay: boolean): Date {
    const [y, m, d] = s.split('-').map(Number);
    return endOfDay ? new Date(y, m - 1, d, 23, 59, 59) : new Date(y, m - 1, d, 0, 0, 0);
  }

  /** Dựng 2 block mini-stat: toàn thời gian (top-level API) + theo range (tổng bucket). */
  private buildStats(data: MangaAnalytics): void {
    this.allTimeStats = [
      { label: 'Lượt xem', value: data.allTimeViews, icon: 'visibility', color: '#0ea5e9' },
      { label: 'Bình luận', value: data.allTimeComments, icon: 'chat_bubble', color: '#8b5cf6' },
      { label: 'Theo dõi', value: data.allTimeFollows, icon: 'favorite', color: '#e94560' },
      { label: 'Chương', value: data.allTimeChapters, icon: 'library_books', color: '#10b981' },
    ];
    this.rangeStats = [
      { label: 'Lượt xem', value: data.totalViews, icon: 'visibility', color: '#0ea5e9' },
      { label: 'Bình luận', value: data.totalComments, icon: 'chat_bubble', color: '#8b5cf6' },
      { label: 'Theo dõi', value: data.totalFollows, icon: 'favorite', color: '#e94560' },
    ];
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
      next: (res: any) => {
        const body = res?.value ?? res;
        this.mangaName = body?.name ?? 'Unknown';
      },
      error: () => { this.mangaName = 'Unknown'; }
    });
  }

  private loadAnalytics(): void {
    if (!this.fromDate || !this.toDate) return;
    this.loading = true;
    const from = this.parseInputDate(this.fromDate, false);
    const to = this.parseInputDate(this.toDate, true);
    this.analyticsService.getMangaAnalytics(this.mangaId, from, to, this.selectedRange).subscribe(data => {
      this.analytics = data;
      this.viewsData = data.viewsByTime;
      this.commentsData = data.commentsByTime;
      this.buildStats(data);
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
