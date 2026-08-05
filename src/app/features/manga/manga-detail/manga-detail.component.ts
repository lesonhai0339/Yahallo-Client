import { Component, OnInit, OnDestroy, Optional, Inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { MangaService } from '../../../core/services/manga.service';
import { AuthService } from '../../../core/services/auth.service';
import { UserInteractionService } from '../../../core/services/user-interaction.service';
import { SeoService } from '../../../core/services/seo.service';
import { Chapter, Manga, MangaDetailDto, MangaStatsDto, UserRating } from '../../../core/models/interfaces';
import { ChapterSortBy } from '../../../core/models/chapter.interface';
import { DownloadService } from '../../../core/services/download.service';
import { chapterName, chapterNumber } from '../../../core/utils/chapter-label';
import { ReadingProgressService } from '../../../core/services/reading-progress.service';
import { RESPONSE_CONTEXT, ResponseContext } from '../../../core/tokens/response-context';

@Component({
  selector: 'app-manga-detail',
  templateUrl: './manga-detail.component.html',
  styleUrls: ['./manga-detail.component.scss']
})
export class MangaDetailComponent implements OnInit, OnDestroy {
  manga: MangaDetailDto | null = null;
  chapters: Chapter[] = [];
  stats: MangaStatsDto = { totalViews: 0, averageRating: 0, totalFollows: 0, totalChapters: 0 };
  isLoading = true;
  isFollowing = false;
  showAllChapters = false;
  selectedRating = 0;
  hoverRating = 0;
  hasRated = false;
  notFound = false;
  existingRating!: UserRating;
  showReratePanel = false;
  synopsisExpanded = false;
  sameAuthorManga: Manga[] = [];
  sameArtistManga: Manga[] = [];
  // Download range picker (download-all)
  showDownloadPanel = false;
  readonly MAX_RANGE = 10;
  rangeStart = 1;
  rangeEnd = 1;

  /** Tên chương dựng từ index/subIndex — `title` là mô tả nên không dùng làm tên. */
  readonly chapterName = chapterName;

  /**
   * Chương đang đọc dở gần nhất của bộ này (nút "Đọc tiếp"). Null khi chưa đọc,
   * hoặc khi chương đã lưu không còn trong danh sách (bị xoá ở admin).
   * Đây là chỗ DUY NHẤT được phép "nhảy" sang chương khác dựa trên tiến trình —
   * reader thì tuyệt đối không, vào chương nào đọc chương đó.
   */
  resume: { chapter: Chapter; page: number; at: number } | null = null;

  /** Số chương của nút "Đọc tiếp" (vd "114", "10.5") — đổ vào tham số {{n}} của i18n. */
  get resumeNumber(): string {
    const c = this.resume?.chapter;
    return c ? chapterNumber(c.index, c.subIndex) : '';
  }

  get visibleChapters(): Chapter[] {
    return this.showAllChapters ? this.chapters : this.chapters.slice(0, 5);
  }

  get authorNames(): string {
    return this.manga?.authors?.map(a => a.name).join(', ') || '';
  }

  get artistNames(): string {
    return this.manga?.artists?.map(a => a.name).join(', ') || '';
  }

  /**
   * Chức năng: So sánh 2 chương theo SỐ chương (index, rồi tới subIndex) — chương
   *   10.5 xếp trên chương 10.
   * Yêu cầu: `a`, `b` là chương có `index`.
   * Kết quả trả về: > 0 nếu `a` mới hơn `b`, < 0 nếu cũ hơn, 0 nếu trùng số.
   * Exception: không ném.
   */
  private compareByNumber(a: Chapter, b: Chapter): number {
    return (a.index - b.index) || ((a.subIndex ?? 0) - (b.subIndex ?? 0));
  }

  /**
   * Chức năng: Chương MỚI NHẤT = chương có số lớn nhất.
   *   Không dùng `chapters[0]` như trước: thứ tự mảng phụ thuộc hoàn toàn vào
   *   tham số `ReverseSort` lúc gọi API, ai đổi cờ đó là 2 nút "đọc từ đầu" /
   *   "đọc mới nhất" lặng lẽ hoán đổi mà không có lỗi nào báo ra.
   * Yêu cầu: `chapters` đã nạp.
   * Kết quả trả về: chương có số lớn nhất, hoặc null khi chưa có chương nào.
   * Exception: không ném.
   */
  get latestChapter(): Chapter | null {
    if (!this.chapters.length) return null;
    return this.chapters.reduce((max, c) => this.compareByNumber(c, max) > 0 ? c : max);
  }

  /** Chương ĐẦU TIÊN = chương có số nhỏ nhất (nút "đọc từ đầu"). */
  get firstChapter(): Chapter | null {
    if (!this.chapters.length) return null;
    return this.chapters.reduce((min, c) => this.compareByNumber(c, min) < 0 ? c : min);
  }

  /**
   * Chức năng: Ngày "Cập nhật" của bộ truyện = ngày ĐĂNG gần nhất, không phải
   *   ngày của chương có số lớn nhất. Chương chèn giữa (vd 10.5) có số nhỏ nhưng
   *   mới đăng — nó vẫn phải làm bộ truyện "vừa cập nhật".
   *   Cố ý KHÁC với `latestChapter` (nút "đọc mới nhất" đi theo SỐ chương).
   * Yêu cầu: `chapters` đã nạp.
   * Kết quả trả về: chuỗi ngày ISO của chương đăng gần nhất; '' nếu chưa có chương.
   * Exception: không ném.
   */
  get latestChapterDate(): string {
    if (!this.chapters.length) return '';
    // reduce thay cho [...].sort(): không copy mảng, và getter này chạy mỗi chu
    // kỳ change detection.
    return this.chapters.reduce((newest, c) =>
      Date.parse(c.chapterDate) > Date.parse(newest.chapterDate) ? c : newest,
    ).chapterDate;
  }

  mangaId!: string;
  // Deep-link mention: khi tới từ notification, comment-section load thẳng tới
  // trang chứa comment được mention (root + child) rồi highlight.
  focusCommentId?: string;
  focusRootCommentId?: string;
  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private mangaService: MangaService,
    private authService: AuthService,
    private userInteraction: UserInteractionService,
    private toastr: ToastrService,
    private seo: SeoService,
    private download: DownloadService,
    private readingProgress: ReadingProgressService,
    @Optional() @Inject(RESPONSE_CONTEXT) private responseContext: ResponseContext | null,
  ) {}

  // ── Download ─────────────────────────────────────────────────────────────────
  get chapterIndexMin(): number {
    return this.chapters.length ? Math.min(...this.chapters.map(c => c.index)) : 0;
  }
  get chapterIndexMax(): number {
    return this.chapters.length ? Math.max(...this.chapters.map(c => c.index)) : 0;
  }
  get selectedRangeChapters(): Chapter[] {
    return this.chapters.filter(c => c.index >= this.rangeStart && c.index <= this.rangeEnd);
  }
  get rangeCount(): number { return this.selectedRangeChapters.length; }
  get rangeValid(): boolean {
    return this.rangeStart <= this.rangeEnd && this.rangeCount > 0 && this.rangeCount <= this.MAX_RANGE;
  }

  toggleDownloadPanel(): void {
    this.showDownloadPanel = !this.showDownloadPanel;
    if (this.showDownloadPanel) {
      this.rangeStart = this.chapterIndexMin;
      this.rangeEnd = Math.min(this.chapterIndexMax, this.rangeStart + this.MAX_RANGE - 1);
    }
  }

  confirmDownloadRange(): void {
    if (!this.rangeValid) {
      this.toastr.warning(`Chọn tối đa ${this.MAX_RANGE} chương`);
      return;
    }
    // title dùng để đặt tên thư mục + hash id gói offline → phải là TÊN chương
    // (dựng từ index/subIndex). Lấy `c.title` (mô tả, có thể rỗng) sẽ khiến mọi
    // chương không mô tả băm ra cùng một id.
    const refs = this.selectedRangeChapters.map(c => ({
      id: c.id, index: c.index, title: this.chapterName(c),
    }));
    this.download.downloadRange(this.manga?.name || 'manga', refs, this.manga?.mangaThumbnail, this.manga?.id);
    this.showDownloadPanel = false;
    // Tiến trình hiển thị ở download-tray (góc dưới-phải) thay cho toast.
  }

  downloadChapter(ch: Chapter, ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.download.downloadChapter(
      this.manga?.name || 'manga',
      { id: ch.id, index: ch.index, title: this.chapterName(ch) },
      this.manga?.mangaThumbnail, this.manga?.id,
    );
    // Tiến trình hiển thị ở download-tray (góc dưới-phải) thay cho toast.
  }

  ngOnInit(): void {
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe(params => {
      this.mangaId = params['id'];
      this.loadManga();
      this.loadChapters();
    });
    // Deep-link tới comment được mention (từ notification).
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(qp => {
      this.focusRootCommentId = qp['rootCommentId'] || undefined;
      this.focusCommentId = qp['commentId'] || undefined;
    });
  }

  ngOnDestroy(): void {
    this.seo.resetToDefault();
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadManga(): void {
    this.isLoading = true;
    this.mangaService.getDetailAggregated(this.mangaId).pipe(takeUntil(this.destroy$)).subscribe({
      next: m => {
        this.manga = m;
        this.manga.description = m.description;
        this.isLoading = false;
        this.seo.setMangaDetail(this.manga);
        this.loadStats();
        this.loadRelatedManga();
        this.loadInteraction();
      },
      error: (err) => {
        this.isLoading = false;

          if (err.status === 404) {
            if (this.responseContext?.status === 200) this.responseContext.status = 404;
            this.notFound = true;
            return;                 
          }

         this.mangaService.getDetail(this.mangaId).pipe(takeUntil(this.destroy$)).subscribe({
            next: m => { this.manga = m as any; this.loadStats(); },
            error: () => { this.notFound = true; },
          });
      }
    });
  }

  loadStats(): void {
    this.mangaService.getMangaStats(this.mangaId).pipe(takeUntil(this.destroy$)).subscribe(s => {
      this.stats = { ...s, totalChapters: this.chapters.length || s.totalChapters };
    });
  }

  loadChapters(): void {
    this.mangaService.getChapters(this.mangaId, ChapterSortBy.Index, true)
      .pipe(takeUntil(this.destroy$)).subscribe(c => {
        this.chapters = c || [];
        this.stats.totalChapters = this.chapters.length;
        this.refreshResume();
      });
  }

  /**
   * Chức năng: Dựng dữ liệu cho nút "Đọc tiếp" từ tiến trình đọc đã lưu.
   * Yêu cầu: gọi SAU khi `chapters` đã nạp — cần đối chiếu chương đã lưu có còn
   *   tồn tại không (chương bị xoá ở admin thì không được hiện nút dẫn tới 404).
   * Kết quả trả về: không (gán `this.resume`).
   * Exception: không ném — chưa đăng nhập/chưa đọc thì `resume = null`.
   */
  private refreshResume(): void {
    const saved = this.readingProgress.getLatestLocal(this.mangaId);
    const chapter = saved ? this.chapters.find(c => c.id === saved.chapterId) : undefined;
    this.resume = chapter && saved
      ? { chapter, page: saved.imageIndex, at: saved.updatedAt }
      : null;
  }

  toggleFollow(): void {
    const user = this.authService.currentUser;
    if (!user) { this.router.navigate(['/auth/login']); return; }
    if (this.isFollowing) {
      this.userInteraction.unfollow(user.id, this.mangaId).subscribe(() => {
        this.isFollowing = false;
        this.toastr.error('Đã hủy theo dõi');
      });
    } else {
      this.userInteraction.follow(user.id, this.mangaId).subscribe(() => {
        this.isFollowing = true;
        this.toastr.success('Đã theo dõi truyện');
      });
    }
  }

  submitRating(): void {
    const user = this.authService.currentUser;
    if (!user) { this.router.navigate(['/auth/login']); return; }
    if (this.selectedRating < 1) { this.toastr.warning('Vui lòng chọn số sao'); return; }

    if(this.existingRating != null)
    {
      this.userInteraction.reRate(this.existingRating.id, this.selectedRating).subscribe(() => {
          this.existingRating.rating = this.selectedRating;
          this.hasRated = true;
          this.showReratePanel = false;
          this.toastr.success(`Đã đánh giá ${this.selectedRating} sao`);
        });
    }
    else{
      this.userInteraction.rate(this.mangaId, user.id, this.selectedRating).subscribe((ratingId) => {
          // Lần đầu đánh giá: existingRating chưa tồn tại → khởi tạo từ id server trả về
          // (để lần sửa sau gọi đúng reRate). Trước đây gán .rating trên undefined → crash,
          // khiến layout không cập nhật.
          this.existingRating = { id: ratingId, rating: this.selectedRating };
          this.hasRated = true;
          this.showReratePanel = false;
          this.toastr.success(`Đã đánh giá ${this.selectedRating} sao`);
        });
    }
   
  }

  openRerate(): void {
    this.selectedRating = this.existingRating?.rating;
    this.showReratePanel = true;
  }

  cancelRerate(): void {
    this.showReratePanel = false;
    this.selectedRating = this.existingRating?.rating;
    this.hoverRating = 0;
  }

  /**
   * Gọi manga/interaction (gộp rating + following) rồi áp trạng thái tương tác của
   * user cho phần đánh giá & nút theo dõi. Chỉ gọi khi đã đăng nhập.
   */
  private loadInteraction(): void {
    const user = this.authService.currentUser;
    if (!user) return;
    this.userInteraction.getInteraction(this.mangaId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (it) => {
        this.isFollowing = it.following;
        if (it.rating > 0) {
          this.hasRated = true;
          this.existingRating = { id: it.ratingId ?? '', rating: it.rating };
          this.selectedRating = it.rating;
        }
      },
      error: () => {}
    });
  }

  loadRelatedManga(): void {
    if (!this.manga) return;
    const authorId = this.manga.authors?.[0]?.id;
    const artistId = this.manga.artists?.[0]?.id;

    if (authorId) {
      this.mangaService.filterPaginated({ authorId, pageSize: 6 })
        .pipe(takeUntil(this.destroy$))
        .subscribe(r => {
          this.sameAuthorManga = (r.data || []).filter(m => m.id !== this.mangaId).slice(0, 4);
        });
    }
    if (artistId) {
      this.mangaService.filterPaginated({ artistId, pageSize: 6 })
        .pipe(takeUntil(this.destroy$))
        .subscribe(r => {
          this.sameArtistManga = (r.data || []).filter(m => m.id !== this.mangaId).slice(0, 4);
        });
    }
  }

  /**
   * Chức năng: Router link tới trang đọc của một chương.
   * Yêu cầu: `chapter` thuộc bộ đang xem; `page` là số trang 0-based (mặc định 0
   *   = đọc từ đầu chương; nút "Đọc tiếp" truyền trang đã lưu).
   * Kết quả trả về: mảng segment cho `routerLink`.
   * Exception: không ném.
   */
  readChapterLink(chapter: Chapter, page: number = 0): (string | number)[] {
    return ['/manga', this.mangaId, 'chapter', chapter.id, page];
  }

toUtcIso(date: string): string {
  if (!date) return '';
  return /[Zz]|[+-]\d{2}:\d{2}$/.test(date) ? date : date + 'Z';
}


  formatNumber(n: number): string {
    if (!n) return '0';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return n.toString();
  }
}
