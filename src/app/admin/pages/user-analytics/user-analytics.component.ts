import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ChartConfiguration } from 'chart.js';
import {
  AnalyticsService, UserAnalytics, TimeRange, ChartType, DateDetail, TimeSeriesPoint
} from '../../services/analytics.service';
import { AdminService } from '../../services/admin.service';

interface DetailPanel {
  visible: boolean;
  loading: boolean;
  chartKey: string;
  label: string;
  date: string;
  detail: DateDetail | null;
}

@Component({
  selector: 'app-user-analytics',
  templateUrl: './user-analytics.component.html',
  styleUrls: ['./user-analytics.component.scss']
})
export class UserAnalyticsComponent implements OnInit {
  userId = '';
  userName = '';
  loading = true;
  selectedRange: TimeRange = 'daily';
  ranges: TimeRange[] = ['daily', 'monthly', 'yearly'];
  analytics: UserAnalytics | null = null;
  chartTypes: ChartType[] = ['line', 'bar', 'area'];

  activityChartType: ChartType = 'area';
  commentsChartType: ChartType = 'bar';

  activityData: TimeSeriesPoint[] = [];
  commentsData: TimeSeriesPoint[] = [];

  activityChart: any = { labels: [], datasets: [] };
  commentsChart: any = { labels: [], datasets: [] };
  activeHoursChart: ChartConfiguration<'bar'>['data'] = { labels: [], datasets: [] };
  topMangaChart: ChartConfiguration<'doughnut'>['data'] = { labels: [], datasets: [] };
  topTagsChart: ChartConfiguration<'doughnut'>['data'] = { labels: [], datasets: [] };

  activityChartOptions: any = {};
  commentsChartOptions: any = {};

  detailPanel: DetailPanel = { visible: false, loading: false, chartKey: '', label: '', date: '', detail: null };

  barOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(20,20,30,0.95)', padding: 10, cornerRadius: 8 } },
    scales: {
      x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888', font: { size: 10 } } },
      y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888' } }
    }
  };

  doughnutOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true, maintainAspectRatio: false, cutout: '60%',
    plugins: {
      legend: { position: 'right', labels: { color: '#aaa', font: { size: 11 }, padding: 12, usePointStyle: true, pointStyleWidth: 8 } },
      tooltip: { backgroundColor: 'rgba(20,20,30,0.95)', padding: 10, cornerRadius: 8 }
    }
  };

  private readonly palette = ['#e94560', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private analyticsService: AnalyticsService,
    private adminService: AdminService
  ) {}

  ngOnInit(): void {
    this.userId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.userId) { this.router.navigate(['/admin/users']); return; }
    this.loadUserInfo();
    this.loadAnalytics();
  }

  onRangeChange(range: TimeRange): void {
    this.selectedRange = range;
    this.closeDetail();
    this.loadAnalytics();
  }

  onChartTypeChange(chart: 'activity' | 'comments', type: ChartType): void {
    if (chart === 'activity') { this.activityChartType = type; this.rebuildActivityChart(); }
    else { this.commentsChartType = type; this.rebuildCommentsChart(); }
  }

  onActivityClick(event: any): void {
    this.handleChartClick('activity', event, this.activityData);
  }

  onCommentsClick(event: any): void {
    this.handleChartClick('comments', event, this.commentsData);
  }

  closeDetail(): void {
    this.detailPanel = { visible: false, loading: false, chartKey: '', label: '', date: '', detail: null };
  }

  goBack(): void { this.router.navigate(['/admin/users']); }

  getChartJsType(type: ChartType): 'line' | 'bar' {
    return type === 'bar' ? 'bar' : 'line';
  }

  private handleChartClick(
    chartKey: string, event: any, dataPoints: TimeSeriesPoint[]
  ): void {
    if (!event.active?.length) return;
    const idx = event.active[0].index;
    const point = dataPoints[idx];
    if (!point) return;

    this.detailPanel = { visible: true, loading: true, chartKey, label: point.label, date: point.date, detail: null };

    const obs = chartKey === 'activity'
      ? this.analyticsService.getUserActivityDetail(this.userId, point.date)
      : this.analyticsService.getUserCommentsDetail(this.userId, point.date);

    obs.subscribe(detail => { this.detailPanel.detail = detail; this.detailPanel.loading = false; });
  }

  private loadUserInfo(): void {
    this.adminService.getUserById(this.userId).subscribe({
      next: (res: any) => { this.userName = (res?.value ?? res)?.name ?? (res?.value ?? res)?.userName ?? 'Unknown'; },
      error: () => { this.userName = 'Unknown'; }
    });
  }

  private loadAnalytics(): void {
    this.loading = true;
    this.analyticsService.getUserAnalytics(this.userId, this.selectedRange).subscribe(data => {
      this.analytics = data;
      this.activityData = data.activityByTime;
      this.commentsData = data.commentsByTime;
      this.rebuildActivityChart();
      this.rebuildCommentsChart();
      this.buildActiveHoursChart(data);
      this.buildTopMangaChart(data);
      this.buildTopTagsChart(data);
      this.loading = false;
    });
  }

  private rebuildActivityChart(): void {
    const isFill = this.activityChartType === 'area';
    const isBar = this.activityChartType === 'bar';
    this.activityChart = {
      labels: this.activityData.map(p => p.label),
      datasets: [{
        data: this.activityData.map(p => p.value), label: 'Hoạt động',
        borderColor: '#10b981', backgroundColor: isBar ? 'rgba(16,185,129,0.6)' : 'rgba(16,185,129,0.1)',
        fill: isFill, pointBackgroundColor: '#10b981',
        borderRadius: isBar ? 4 : undefined, tension: isBar ? undefined : 0.35,
        borderWidth: isBar ? 1 : 2, pointRadius: isBar ? undefined : 3, pointHoverRadius: isBar ? undefined : 6,
      }]
    };
    this.activityChartOptions = this.buildClickableOptions();
  }

  private rebuildCommentsChart(): void {
    const isFill = this.commentsChartType === 'area';
    const isBar = this.commentsChartType === 'bar';
    this.commentsChart = {
      labels: this.commentsData.map(p => p.label),
      datasets: [{
        data: this.commentsData.map(p => p.value), label: 'Bình luận',
        borderColor: '#3b82f6', backgroundColor: isBar ? 'rgba(59,130,246,0.6)' : 'rgba(59,130,246,0.1)',
        fill: isFill, pointBackgroundColor: '#3b82f6',
        borderRadius: isBar ? 4 : undefined, tension: isBar ? undefined : 0.35,
        borderWidth: isBar ? 1 : 2, pointRadius: isBar ? undefined : 3, pointHoverRadius: isBar ? undefined : 6,
      }]
    };
    this.commentsChartOptions = this.buildClickableOptions();
  }

  private buildActiveHoursChart(data: UserAnalytics): void {
    this.activeHoursChart = {
      labels: Array.from({ length: 24 }, (_, i) => `${i}h`),
      datasets: [{
        data: data.activeHours, label: 'Hoạt động',
        backgroundColor: data.activeHours.map(v => `rgba(233,69,96,${0.2 + Math.min(v / 100, 1) * 0.6})`),
        borderColor: 'transparent', borderRadius: 3,
      }]
    };
  }

  private buildTopMangaChart(data: UserAnalytics): void {
    this.topMangaChart = {
      labels: data.topManga.map(m => m.name),
      datasets: [{ data: data.topManga.map(m => m.views), backgroundColor: this.palette, borderWidth: 0 }]
    };
  }

  private buildTopTagsChart(data: UserAnalytics): void {
    this.topTagsChart = {
      labels: data.topTags.map(t => t.name),
      datasets: [{ data: data.topTags.map(t => t.count), backgroundColor: [...this.palette].reverse(), borderWidth: 0 }]
    };
  }

  private buildClickableOptions(): any {
    return {
      responsive: true, maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(20,20,30,0.95)', padding: 10, cornerRadius: 8,
          callbacks: { afterBody: () => ['', 'Click để xem chi tiết'] }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888', font: { size: 10 } } },
        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888' } }
      },
      elements: { line: { tension: 0.35, borderWidth: 2 }, point: { radius: 3, hoverRadius: 6 } },
    };
  }
}
