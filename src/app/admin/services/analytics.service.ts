import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, delay } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export type TimeRange = 'daily' | 'monthly' | 'yearly';
export type ChartType = 'line' | 'bar' | 'area';

export interface TimeSeriesPoint {
  label: string;
  value: number;
  date: string;
}

export interface MangaAnalytics {
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

  constructor(private http: HttpClient) {}

  // ── Aggregate endpoints ─────────────────────────────────────────────────

  getDashboardAnalytics(range: TimeRange): Observable<DashboardAnalytics> {
    if (USE_MOCK) return of(this.mockDashboard(range));
    return this.http.get<DashboardAnalytics>(
      `${this.baseUrl}/analytics/dashboard`, { params: { range } }
    ).pipe(catchError(() => of(this.mockDashboard(range))));
  }

  getMangaAnalytics(mangaId: string, range: TimeRange): Observable<MangaAnalytics> {
    if (USE_MOCK) return of(this.mockMangaAnalytics(range));
    return this.http.get<MangaAnalytics>(
      `${this.baseUrl}/analytics/manga/${mangaId}`, { params: { range } }
    ).pipe(catchError(() => of(this.mockMangaAnalytics(range))));
  }

  getUserAnalytics(userId: string, range: TimeRange): Observable<UserAnalytics> {
    if (USE_MOCK) return of(this.mockUserAnalytics(range));
    return this.http.get<UserAnalytics>(
      `${this.baseUrl}/analytics/user/${userId}`, { params: { range } }
    ).pipe(catchError(() => of(this.mockUserAnalytics(range))));
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

  private mockMangaAnalytics(range: TimeRange): MangaAnalytics {
    const labels = this.generateLabels(range);
    const dates = this.generateDates(range);
    return {
      totalViews: this.rand(5000, 100000),
      totalComments: this.rand(50, 2000),
      totalFollows: this.rand(100, 5000),
      totalChapters: this.rand(10, 300),
      viewsByTime: labels.map((l, i) => ({ label: l, value: this.rand(50, 3000), date: dates[i] })),
      commentsByTime: labels.map((l, i) => ({ label: l, value: this.rand(0, 50), date: dates[i] })),
    };
  }

  private mockUserAnalytics(range: TimeRange): UserAnalytics {
    const labels = this.generateLabels(range);
    const dates = this.generateDates(range);
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
        dates.push(d.toISOString().split('T')[0]);
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
