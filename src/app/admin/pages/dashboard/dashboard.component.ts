import { Component, OnInit } from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import 'chart.js';
import { AdminMangaService } from '../../services/admin-manga.service';
import { AdminService } from '../../services/admin.service';
import {
  AnalyticsService, TimeRange, ChartType, DateDetail, TimeSeriesPoint
} from '../../services/analytics.service';
import { PermissionService } from '../../../core/services/permission.service';
import { Permission } from '../../../core/models/permission.model';

interface QuickLink {
  label: string;
  path: string;
  icon: string;
  color: string;
  permission?: Permission;
}

interface DetailPanel {
  visible: boolean;
  loading: boolean;
  chartKey: string;
  label: string;
  date: string;
  detail: DateDetail | null;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  loading = true;
  stats = { manga: 0, users: 0, tags: 0, chapters: 0 };
  visibleLinks: QuickLink[] = [];
  selectedRange: TimeRange = 'daily';
  ranges: TimeRange[] = ['daily', 'monthly', 'yearly'];
  chartTypes: ChartType[] = ['line', 'bar', 'area'];

  regChartType: ChartType = 'area';
  mangaChartType: ChartType = 'area';

  regData: TimeSeriesPoint[] = [];
  mangaData: TimeSeriesPoint[] = [];

  registrationChart: any = { labels: [], datasets: [] };
  newMangaChart: any = { labels: [], datasets: [] };
  regChartOptions: any = {};
  mangaChartOptions: any = {};

  detailPanel: DetailPanel = { visible: false, loading: false, chartKey: '', label: '', date: '', detail: null };

  private allQuickLinks: QuickLink[] = [
    { label: 'Thêm truyện mới', path: '/admin/manga/create', icon: 'add_circle', color: 'accent', permission: Permission.CreateManga },
    { label: 'Danh sách truyện', path: '/admin/manga', icon: 'menu_book', color: 'blue', permission: Permission.ManageManga },
    { label: 'Quản lý users', path: '/admin/users', icon: 'people', color: 'green', permission: Permission.ManageUsers },
  ];

  constructor(
    private mangaService: AdminMangaService,
    private adminService: AdminService,
    private analyticsService: AnalyticsService,
    public perm: PermissionService
  ) {}

  ngOnInit(): void {
    this.visibleLinks = this.allQuickLinks.filter(
      link => !link.permission || this.perm.hasPermission(link.permission)
    );

    forkJoin({
      manga: this.mangaService.getAll(1, 1).pipe(catchError(() => of(null))),
      users: this.adminService.getAllUsers(1, 1).pipe(catchError(() => of(null))),
      tags: this.mangaService.getAllTags().pipe(catchError(() => of(null))),
    }).subscribe(({ manga, users, tags }) => {
      this.stats.manga = this.extractTotal(manga);
      this.stats.users = this.extractTotal(users);
      const tagsArr = tags?.value ?? tags ?? [];
      this.stats.tags = Array.isArray(tagsArr) ? tagsArr.length : 0;
      this.loading = false;
    });

    this.loadCharts();
  }

  onRangeChange(range: TimeRange): void {
    this.selectedRange = range;
    this.closeDetail();
    this.loadCharts();
  }

  onChartTypeChange(chart: 'reg' | 'manga', type: ChartType): void {
    if (chart === 'reg') { this.regChartType = type; this.rebuildRegChart(); }
    else { this.mangaChartType = type; this.rebuildMangaChart(); }
  }

  onRegClick(event: any): void {
    this.handleClick('reg', event, this.regData);
  }

  onMangaClick(event: any): void {
    this.handleClick('manga', event, this.mangaData);
  }

  closeDetail(): void {
    this.detailPanel = { visible: false, loading: false, chartKey: '', label: '', date: '', detail: null };
  }

  getChartJsType(type: ChartType): 'line' | 'bar' {
    return type === 'bar' ? 'bar' : 'line';
  }

  get dashboardSubtitle(): string {
    const role = this.perm.getRoleLabel();
    return role ? `${role} — Tổng quan hệ thống` : 'Tổng quan hệ thống';
  }

  private handleClick(
    chartKey: string, event: any, data: TimeSeriesPoint[]
  ): void {
    if (!event.active?.length) return;
    const point = data[event.active[0].index];
    if (!point) return;

    this.detailPanel = { visible: true, loading: true, chartKey, label: point.label, date: point.date, detail: null };

    const obs = chartKey === 'reg'
      ? this.analyticsService.getDashboardRegistrationsDetail(point.date)
      : this.analyticsService.getDashboardNewMangaDetail(point.date);

    obs.subscribe(detail => { this.detailPanel.detail = detail; this.detailPanel.loading = false; });
  }

  private loadCharts(): void {
    this.analyticsService.getDashboardAnalytics(this.selectedRange).subscribe(data => {
      this.regData = data.registrations;
      this.mangaData = data.newManga;
      this.rebuildRegChart();
      this.rebuildMangaChart();
    });
  }

  private rebuildRegChart(): void {
    const isFill = this.regChartType === 'area';
    const isBar = this.regChartType === 'bar';
    this.registrationChart = {
      labels: this.regData.map(p => p.label),
      datasets: [{
        data: this.regData.map(p => p.value), label: 'Đăng ký mới',
        borderColor: '#3b82f6', backgroundColor: isBar ? 'rgba(59,130,246,0.6)' : 'rgba(59,130,246,0.1)',
        fill: isFill, pointBackgroundColor: '#3b82f6',
        borderRadius: isBar ? 4 : undefined, tension: isBar ? undefined : 0.35,
        borderWidth: isBar ? 1 : 2, pointRadius: isBar ? undefined : 3, pointHoverRadius: isBar ? undefined : 6,
      }]
    };
    this.regChartOptions = this.buildOptions();
  }

  private rebuildMangaChart(): void {
    const isFill = this.mangaChartType === 'area';
    const isBar = this.mangaChartType === 'bar';
    this.newMangaChart = {
      labels: this.mangaData.map(p => p.label),
      datasets: [{
        data: this.mangaData.map(p => p.value), label: 'Truyện mới',
        borderColor: '#e94560', backgroundColor: isBar ? 'rgba(233,69,96,0.6)' : 'rgba(233,69,96,0.1)',
        fill: isFill, pointBackgroundColor: '#e94560',
        borderRadius: isBar ? 4 : undefined, tension: isBar ? undefined : 0.35,
        borderWidth: isBar ? 1 : 2, pointRadius: isBar ? undefined : 3, pointHoverRadius: isBar ? undefined : 6,
      }]
    };
    this.mangaChartOptions = this.buildOptions();
  }

  private buildOptions(): any {
    return {
      responsive: true, maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(20,20,30,0.95)', borderColor: 'rgba(233,69,96,0.3)',
          borderWidth: 1, titleColor: '#fff', bodyColor: '#ccc', padding: 10, cornerRadius: 8,
          callbacks: { afterBody: () => ['', 'Click để xem chi tiết'] }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888', maxRotation: 45, font: { size: 10 } } },
        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888', font: { size: 10 } } }
      },
      elements: { line: { tension: 0.35, borderWidth: 2 }, point: { radius: 3, hoverRadius: 6 } },
    };
  }

  private extractTotal(res: any): number {
    if (!res) return 0;
    const d = res?.value ?? res;
    return d?.totalCount ?? d?.data?.totalCount ?? 0;
  }
}
