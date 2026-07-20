import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of, forkJoin } from 'rxjs';
import { catchError, delay, map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export type TimeRange = 'daily' | 'monthly' | 'yearly';
export type ChartType = 'line' | 'bar' | 'area';

export interface TimeSeriesPoint {
  label: string;
  value: number;
  date: string;
}

/** 1 ô mini-stat trong stats-row (dùng chung cho block toàn thời gian + theo range). */
export interface StatCell {
  label: string;
  value: number;
  icon: string;
  color: string;
}

export interface MangaAnalytics {
  // Toàn thời gian (top-level từ API, không đổi theo range)
  allTimeViews: number;
  allTimeComments: number;
  allTimeFollows: number;
  allTimeChapters: number;
  // Theo range đã chọn (tổng các bucket trong cửa sổ)
  totalViews: number;
  totalComments: number;
  totalFollows: number;
  totalChapters: number;
  viewsByTime: TimeSeriesPoint[];
  commentsByTime: TimeSeriesPoint[];
}

export interface UserAnalytics {
  totalComments: number;
  totalMangaRead: number;
  activeHours: number[];
  topManga: { name: string; views: number }[];
  topTags: { name: string; count: number }[];
  recentSearches: string[];
  activityByTime: TimeSeriesPoint[];
  commentsByTime: TimeSeriesPoint[];
}

export interface DashboardAnalytics {
  registrations: TimeSeriesPoint[];
  newManga: TimeSeriesPoint[];
}

export interface DetailItem {
  id: string;
  title: string;
  subtitle: string;
  avatar?: string;
  timestamp: string;
  extra?: string;
}

export interface DateDetail {
  date: string;
  label: string;
  total: number;
  items: DetailItem[];
}

const USE_MOCK = true;

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly baseUrl = environment.apiUrl;
  private readonly mangaBase = environment.mangaApi;
  private readonly userBase = environment.userApi;

  constructor(private http: HttpClient) {}

  // ── Aggregate endpoints ─────────────────────────────────────────────────

  /**
   * Dashboard charts use the real backend count endpoints:
   *   GET {userApi}/count  → JsonResponse<PagedResult<CountUserQueryResult>>
   *   GET {mangaApi}/count → JsonResponse<PagedResult<CountNewMangaQueryResult>>
   * Each row is { period, count }. The backend only returns periods that have
   * data, so we scaffold the full label/date axis and fill missing buckets with 0.
   */
  getDashboardAnalytics(range: TimeRange): Observable<DashboardAnalytics> {
    const params = this.buildCountParams(range);
    return forkJoin({
      users: this.http.get(`${this.userBase}/count`, { params }).pipe(catchError(() => of(null))),
      manga: this.http.get(`${this.mangaBase}/count`, { params }).pipe(catchError(() => of(null))),
    }).pipe(
      map(({ users, manga }) => ({
        registrations: this.mapCountToSeries(users, range),
        newManga: this.mapCountToSeries(manga, range),
      })),
      catchError(() => of(this.mockDashboard(range)))
    );
  }

  /**
   * Real endpoint: GET {mangaApi}/analytics
   *   ?MangaId&From&To&FilterBy(Day|Month|Year)
   *   → JsonResponse<GetMangaAnalyticsResult { totalChapter, mangaAnalytics[] }>
   * Each bucket carries per-period sums (totalView/totalComment/totalFollower) tagged
   * with day/month/year. Backend only returns non-empty buckets, so we scaffold the
   * full label/date axis (same window as the charts) and zero-fill the gaps.
   */
  /**
   * Cửa sổ theo LỊCH (không phải rolling):
   *  - daily   → các ngày trong tháng hiện tại
   *  - monthly → các tháng trong năm hiện tại
   *  - yearly  → từ `startYear` (năm tạo truyện) tới năm hiện tại
   */
  getMangaAnalytics(mangaId: string, range: TimeRange, startYear?: number): Observable<MangaAnalytics> {
    const { from, to } = this.calWindow(range, startYear);
    const params = new HttpParams()
      .set('MangaId', mangaId)
      .set('From', from.toISOString())
      .set('To', to.toISOString())
      .set('FilterBy', this.filterByOf(range));
    return this.http.get(`${this.mangaBase}/analytics`, { params }).pipe(
      map(res => this.mapMangaAnalytics(res, range, startYear)),
      catchError(() => of(this.mockMangaAnalytics(range, startYear)))
    );
  }

  getUserAnalytics(userId: string, range: TimeRange, startYear?: number): Observable<UserAnalytics> {
    if (USE_MOCK) return of(this.mockUserAnalytics(range, startYear));
    return this.http.get<UserAnalytics>(
      `${this.baseUrl}/analytics/user/${userId}`, { params: { range } }
    ).pipe(catchError(() => of(this.mockUserAnalytics(range, startYear))));
  }

  // ── Detail endpoints (click on a specific date) ─────────────────────────

  getMangaViewsDetail(mangaId: string, date: string): Observable<DateDetail> {
    if (USE_MOCK) return of(this.mockMangaViewsDetail(date)).pipe(delay(400));
    return this.http.get<DateDetail>(
      `${this.baseUrl}/analytics/manga/${mangaId}/views`, { params: { date } }
    ).pipe(catchError(() => of(this.mockMangaViewsDetail(date))));
  }

  getMangaCommentsDetail(mangaId: string, date: string): Observable<DateDetail> {
    if (USE_MOCK) return of(this.mockMangaCommentsDetail(date)).pipe(delay(400));
    return this.http.get<DateDetail>(
      `${this.baseUrl}/analytics/manga/${mangaId}/comments`, { params: { date } }
    ).pipe(catchError(() => of(this.mockMangaCommentsDetail(date))));
  }

  getUserActivityDetail(userId: string, date: string): Observable<DateDetail> {
    if (USE_MOCK) return of(this.mockUserActivityDetail(date)).pipe(delay(400));
    return this.http.get<DateDetail>(
      `${this.baseUrl}/analytics/user/${userId}/activity`, { params: { date } }
    ).pipe(catchError(() => of(this.mockUserActivityDetail(date))));
  }

  getUserCommentsDetail(userId: string, date: string): Observable<DateDetail> {
    if (USE_MOCK) return of(this.mockUserCommentsDetail(date)).pipe(delay(400));
    return this.http.get<DateDetail>(
      `${this.baseUrl}/analytics/user/${userId}/comments`, { params: { date } }
    ).pipe(catchError(() => of(this.mockUserCommentsDetail(date))));
  }

  getDashboardRegistrationsDetail(date: string): Observable<DateDetail> {
    if (USE_MOCK) return of(this.mockRegistrationsDetail(date)).pipe(delay(400));
    return this.http.get<DateDetail>(
      `${this.baseUrl}/analytics/dashboard/registrations`, { params: { date } }
    ).pipe(catchError(() => of(this.mockRegistrationsDetail(date))));
  }

  getDashboardNewMangaDetail(date: string): Observable<DateDetail> {
    if (USE_MOCK) return of(this.mockNewMangaDetail(date)).pipe(delay(400));
    return this.http.get<DateDetail>(
      `${this.baseUrl}/analytics/dashboard/new-manga`, { params: { date } }
    ).pipe(catchError(() => of(this.mockNewMangaDetail(date))));
  }

  // ── Mock aggregate ──────────────────────────────────────────────────────

  private mockDashboard(range: TimeRange): DashboardAnalytics {
    const labels = this.generateLabels(range);
    const dates = this.generateDates(range);
    return {
      registrations: labels.map((l, i) => ({ label: l, value: this.rand(5, 80), date: dates[i] })),
      newManga: labels.map((l, i) => ({ label: l, value: this.rand(1, 20), date: dates[i] })),
    };
  }

  private mockMangaAnalytics(range: TimeRange, startYear?: number): MangaAnalytics {
    const labels = this.calLabels(range, startYear);
    const dates = this.calDates(range, startYear);
    return {
      allTimeViews: this.rand(50000, 500000),
      allTimeComments: this.rand(2000, 20000),
      allTimeFollows: this.rand(5000, 50000),
      allTimeChapters: this.rand(50, 500),
      totalViews: this.rand(5000, 100000),
      totalComments: this.rand(50, 2000),
      totalFollows: this.rand(100, 5000),
      totalChapters: this.rand(10, 300),
      viewsByTime: labels.map((l, i) => ({ label: l, value: this.rand(50, 3000), date: dates[i] })),
      commentsByTime: labels.map((l, i) => ({ label: l, value: this.rand(0, 50), date: dates[i] })),
    };
  }

  private mockUserAnalytics(range: TimeRange, startYear?: number): UserAnalytics {
    const labels = this.calLabels(range, startYear);
    const dates = this.calDates(range, startYear);
    return {
      totalComments: this.rand(10, 500),
      totalMangaRead: this.rand(5, 200),
      activeHours: Array.from({ length: 24 }, () => this.rand(0, 100)),
      topManga: [
        { name: 'One Piece', views: this.rand(50, 500) },
        { name: 'Naruto', views: this.rand(30, 400) },
        { name: 'Bleach', views: this.rand(20, 300) },
        { name: 'Dragon Ball', views: this.rand(15, 250) },
        { name: 'Attack on Titan', views: this.rand(10, 200) },
      ],
      topTags: [
        { name: 'Action', count: this.rand(50, 300) },
        { name: 'Adventure', count: this.rand(40, 250) },
        { name: 'Fantasy', count: this.rand(30, 200) },
        { name: 'Romance', count: this.rand(20, 150) },
        { name: 'Comedy', count: this.rand(10, 100) },
      ],
      recentSearches: ['One Piece chapter 1120', 'Isekai manga', 'Romance manhwa', 'Action shounen', 'New releases'],
      activityByTime: labels.map((l, i) => ({ label: l, value: this.rand(0, 120), date: dates[i] })),
      commentsByTime: labels.map((l, i) => ({ label: l, value: this.rand(0, 15), date: dates[i] })),
    };
  }

  // ── Mock detail ─────────────────────────────────────────────────────────

  private mockMangaViewsDetail(date: string): DateDetail {
    const count = this.rand(5, 20);
    return {
      date, label: date, total: count,
      items: Array.from({ length: count }, (_, i) => ({
        id: `v${i}`,
        title: this.pickRandom(['user_khanh', 'manga_fan_99', 'reader_2024', 'otaku_vn', 'silent_reader', 'night_owl']),
        subtitle: `Chapter ${this.rand(1, 100)}`,
        timestamp: this.randomTime(date),
      })),
    };
  }

  private mockMangaCommentsDetail(date: string): DateDetail {
    const count = this.rand(2, 12);
    const comments = [
      'Hay quá, mong chờ chapter tiếp!', 'Art đẹp lắm', 'Plot twist khá bất ngờ',
      'Nhân vật chính phát triển tốt', 'Cảm ơn đã dịch!', 'Chapter này hơi ngắn',
      'Truyện ngày càng hay', 'Ending sẽ như nào nhỉ?', 'Recommend cho mọi người',
    ];
    return {
      date, label: date, total: count,
      items: Array.from({ length: count }, (_, i) => ({
        id: `c${i}`,
        title: this.pickRandom(['user_khanh', 'manga_fan_99', 'reader_2024', 'otaku_vn']),
        subtitle: this.pickRandom(comments),
        extra: `Chapter ${this.rand(1, 100)}`,
        timestamp: this.randomTime(date),
      })),
    };
  }

  private mockUserActivityDetail(date: string): DateDetail {
    const count = this.rand(3, 15);
    const actions = [
      { title: 'Đọc One Piece', subtitle: 'Chapter 1120' },
      { title: 'Đọc Naruto', subtitle: 'Chapter 700' },
      { title: 'Bình luận Bleach', subtitle: 'Chapter 685' },
      { title: 'Theo dõi Dragon Ball', subtitle: '' },
      { title: 'Tìm kiếm "Isekai manga"', subtitle: '' },
      { title: 'Đọc Attack on Titan', subtitle: 'Chapter 139' },
      { title: 'Đánh giá My Hero Academia', subtitle: '4.5 sao' },
    ];
    return {
      date, label: date, total: count,
      items: Array.from({ length: count }, (_, i) => {
        const action = this.pickRandom(actions);
        return { id: `a${i}`, title: action.title, subtitle: action.subtitle, timestamp: this.randomTime(date) };
      }),
    };
  }

  private mockUserCommentsDetail(date: string): DateDetail {
    const count = this.rand(1, 8);
    const comments = [
      'Truyện hay lắm!', 'Cảm ơn nhóm dịch', 'Mong chapter mới sớm',
      'Art rất đẹp', 'Plot hay nhưng hơi kéo dài',
    ];
    return {
      date, label: date, total: count,
      items: Array.from({ length: count }, (_, i) => ({
        id: `uc${i}`,
        title: this.pickRandom(['One Piece', 'Naruto', 'Bleach', 'Dragon Ball']),
        subtitle: this.pickRandom(comments),
        extra: `Chapter ${this.rand(1, 200)}`,
        timestamp: this.randomTime(date),
      })),
    };
  }

  private mockRegistrationsDetail(date: string): DateDetail {
    const count = this.rand(3, 15);
    const names = ['Nguyễn Văn A', 'Trần Thị B', 'Lê Hoàng C', 'Phạm Minh D', 'Đỗ Quang E', 'Vũ Thu F'];
    return {
      date, label: date, total: count,
      items: Array.from({ length: count }, (_, i) => ({
        id: `r${i}`,
        title: this.pickRandom(names),
        subtitle: `${this.pickRandom(names).toLowerCase().replace(/\s/g, '')}@gmail.com`,
        timestamp: this.randomTime(date),
      })),
    };
  }

  private mockNewMangaDetail(date: string): DateDetail {
    const count = this.rand(1, 5);
    const manga = ['Solo Leveling SS2', 'Chainsaw Man', 'Jujutsu Kaisen', 'Spy x Family', 'Dandadan'];
    return {
      date, label: date, total: count,
      items: Array.from({ length: count }, (_, i) => ({
        id: `m${i}`,
        title: this.pickRandom(manga),
        subtitle: `Bởi ${this.pickRandom(['admin', 'translator_01', 'uploader_vn'])}`,
        extra: `${this.rand(1, 30)} chapters`,
        timestamp: this.randomTime(date),
      })),
    };
  }

  // ── Count endpoint helpers ──────────────────────────────────────────────

  /** Build From/To/CountBy/paging params matching the selected range. */
  private buildCountParams(range: TimeRange): HttpParams {
    const now = new Date();
    const from = new Date(now);
    let countBy: string;
    if (range === 'daily') {
      from.setDate(from.getDate() - 29);
      countBy = 'Day';
    } else if (range === 'monthly') {
      from.setMonth(from.getMonth() - 11);
      countBy = 'Month';
    } else {
      from.setFullYear(from.getFullYear() - 4);
      countBy = 'Year';
    }
    // Backend convention: minutes east of UTC (Vietnam UTC+7 → 420). JS
    // getTimezoneOffset() returns the opposite sign, so negate it.
    const timeZoneOffset = -now.getTimezoneOffset();

    return new HttpParams()
      .set('From', from.toISOString())
      .set('To', now.toISOString())
      .set('CountBy', countBy)
      .set('TimeZoneOffset', String(timeZoneOffset))
      .set('PageNo', '1')
      .set('PageSize', '1000');
  }

  /** TimeRange → backend MangaDailyFilterBy enum name. */
  private filterByOf(range: TimeRange): 'Day' | 'Month' | 'Year' {
    return range === 'daily' ? 'Day' : range === 'monthly' ? 'Month' : 'Year';
  }

  /**
   * [From, To] theo lịch:
   *  - daily   → đầu tháng hiện tại → nay
   *  - monthly → đầu năm hiện tại → nay
   *  - yearly  → đầu năm `startYear` (năm tạo) → nay
   */
  private calWindow(range: TimeRange, startYear?: number): { from: Date; to: Date } {
    const now = new Date();
    let from: Date;
    if (range === 'daily') from = new Date(now.getFullYear(), now.getMonth(), 1);
    else if (range === 'monthly') from = new Date(now.getFullYear(), 0, 1);
    else from = new Date(this.safeStartYear(startYear), 0, 1);
    return { from, to: now };
  }

  /** startYear hợp lệ (không vượt năm hiện tại); thiếu → mặc định 5 năm gần nhất. */
  private safeStartYear(startYear?: number): number {
    const cur = new Date().getFullYear();
    if (!startYear || startYear > cur || startYear < 1970) return cur - 4;
    return startYear;
  }

  /** Nhãn trục theo lịch — khớp key của calDates/rowKey. */
  private calLabels(range: TimeRange, startYear?: number): string[] {
    const now = new Date();
    const y = now.getFullYear();
    const labels: string[] = [];
    if (range === 'daily') {
      const m = now.getMonth() + 1;
      for (let d = 1; d <= now.getDate(); d++) labels.push(`${d}/${m}`);
    } else if (range === 'monthly') {
      const names = ['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12'];
      for (let mo = 0; mo <= now.getMonth(); mo++) labels.push(names[mo]);
    } else {
      for (let yr = this.safeStartYear(startYear); yr <= y; yr++) labels.push(`${yr}`);
    }
    return labels;
  }

  /** Key trục (khớp rowKey): `y-mm-dd` | `y-mm` | `y`. */
  private calDates(range: TimeRange, startYear?: number): string[] {
    const now = new Date();
    const y = now.getFullYear();
    const dates: string[] = [];
    if (range === 'daily') {
      const m = String(now.getMonth() + 1).padStart(2, '0');
      for (let d = 1; d <= now.getDate(); d++) dates.push(`${y}-${m}-${String(d).padStart(2, '0')}`);
    } else if (range === 'monthly') {
      for (let mo = 1; mo <= now.getMonth() + 1; mo++) dates.push(`${y}-${String(mo).padStart(2, '0')}`);
    } else {
      for (let yr = this.safeStartYear(startYear); yr <= y; yr++) dates.push(`${yr}`);
    }
    return dates;
  }

  /**
   * Map GetMangaAnalyticsResult → MangaAnalytics view model. Buckets are keyed onto
   * the scaffolded axis by day/month/year; summary stats are the range totals (sum of
   * the per-period buckets), totalChapters comes straight from the backend.
   */
  private mapMangaAnalytics(res: any, range: TimeRange, startYear?: number): MangaAnalytics {
    const labels = this.calLabels(range, startYear);
    const dates = this.calDates(range, startYear);
    const body = res?.value ?? res;
    const rows: any[] = body?.mangaAnalytics ?? body?.MangaAnalytics ?? [];

    const views = new Map<string, number>();
    const comments = new Map<string, number>();
    let totalViews = 0, totalComments = 0, totalFollows = 0;

    for (const row of rows) {
      const key = this.rowKey(row, range);
      if (!key) continue;
      const v = row?.totalView ?? row?.TotalView ?? 0;
      const c = row?.totalComment ?? row?.TotalComment ?? 0;
      const f = row?.totalFollower ?? row?.TotalFollower ?? 0;
      views.set(key, (views.get(key) ?? 0) + v);
      comments.set(key, (comments.get(key) ?? 0) + c);
      totalViews += v; totalComments += c; totalFollows += f;
    }

    const allTimeChapters = body?.totalChapter ?? body?.TotalChapter ?? 0;
    return {
      // Toàn thời gian: lấy thẳng total top-level của API (14/27/2/5 trong ví dụ).
      allTimeViews: body?.totalView ?? body?.TotalView ?? 0,
      allTimeComments: body?.totalComment ?? body?.TotalComment ?? 0,
      allTimeFollows: body?.totalFollowing ?? body?.TotalFollowing ?? 0,
      allTimeChapters,
      // Theo range: tổng các bucket trong cửa sổ đã chọn.
      totalViews,
      totalComments,
      totalFollows,
      totalChapters: allTimeChapters,
      viewsByTime: labels.map((label, i) => ({ label, date: dates[i], value: views.get(dates[i]) ?? 0 })),
      commentsByTime: labels.map((label, i) => ({ label, date: dates[i], value: comments.get(dates[i]) ?? 0 })),
    };
  }

  /**
   * Merge a JsonResponse<PagedResult<{ day, month, yearh, count }>> into the full
   * axis so the chart shows a continuous series with zero-filled gaps.
   */
  private mapCountToSeries(res: any, range: TimeRange): TimeSeriesPoint[] {
    const labels = this.generateLabels(range);
    const dates = this.generateDates(range);
    const paged = res?.value ?? res;
    const rows: any[] = paged?.data ?? paged?.items ?? [];

    const counts = new Map<string, number>();
    for (const row of rows) {
      const key = this.rowKey(row, range);
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + (row?.count ?? row?.Count ?? 0));
    }

    return labels.map((label, i) => ({
      label,
      date: dates[i],
      value: counts.get(dates[i]) ?? 0,
    }));
  }

  /**
   * Build a bucket key from the backend's split Day/Month/Yearh fields, matching
   * the key format produced by generateDates for the given range.
   * (`Yearh` is the backend's spelling; `Year` accepted as a fallback.)
   */
  private rowKey(row: any, range: TimeRange): string {
    const year = row?.yearh ?? row?.Yearh ?? row?.year ?? row?.Year;
    if (year == null) return '';
    const y = String(year);
    if (range === 'yearly') return y;

    const month = row?.month ?? row?.Month;
    if (month == null) return '';
    const m = String(month).padStart(2, '0');
    if (range === 'monthly') return `${y}-${m}`;

    const day = row?.day ?? row?.Day;
    if (day == null) return '';
    return `${y}-${m}-${String(day).padStart(2, '0')}`;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private generateLabels(range: TimeRange): string[] {
    const now = new Date();
    const labels: string[] = [];
    if (range === 'daily') {
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now); d.setDate(d.getDate() - i);
        labels.push(`${d.getDate()}/${d.getMonth() + 1}`);
      }
    } else if (range === 'monthly') {
      const m = ['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12'];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now); d.setMonth(d.getMonth() - i);
        labels.push(`${m[d.getMonth()]}/${d.getFullYear()}`);
      }
    } else {
      for (let i = 4; i >= 0; i--) labels.push(`${now.getFullYear() - i}`);
    }
    return labels;
  }

  private generateDates(range: TimeRange): string[] {
    const now = new Date();
    const dates: string[] = [];
    if (range === 'daily') {
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now); d.setDate(d.getDate() - i);
        dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
      }
    } else if (range === 'monthly') {
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now); d.setMonth(d.getMonth() - i);
        dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      }
    } else {
      for (let i = 4; i >= 0; i--) dates.push(`${now.getFullYear() - i}`);
    }
    return dates;
  }

  private randomTime(date: string): string {
    const h = String(this.rand(0, 23)).padStart(2, '0');
    const m = String(this.rand(0, 59)).padStart(2, '0');
    return `${date}T${h}:${m}:00`;
  }

  private pickRandom<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  private rand(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}
