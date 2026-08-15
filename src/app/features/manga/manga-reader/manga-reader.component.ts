import { Component, OnInit, OnDestroy, HostListener, ViewChild, Inject, Optional, PLATFORM_ID } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Location, isPlatformBrowser } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { MangaService } from '../../../core/services/manga.service';
import { AuthService } from '../../../core/services/auth.service';
import { ReadingProgressService, LocalProgress } from '../../../core/services/reading-progress.service';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';
import { SeoService } from '../../../core/services/seo.service';
import { ChapterImage } from '../../../core/models/chapter.interface';
import { ReaderViewerComponent, ReaderFitMode } from '../../../shared/components/reader-viewer/reader-viewer.component';
import { chapterFullName, chapterName } from '../../../core/utils/chapter-label';
import { dropLegacyKey, scopedKey } from '../../../core/utils/user-storage';
import { RESPONSE_CONTEXT, ResponseContext } from '../../../core/tokens/response-context';

/** Tiền tố key cài đặt đọc — key thật kèm user-id. */
const READER_SETTINGS_PREFIX = 'reader-settings';

export interface ReaderSettings {
  direction: 'vertical' | 'horizontal';
  horizontalDir: 'rtl' | 'ltr';
  mode: 'normal' | 'focus';
  imageSize: number;
  preloadCount: number;
  /** Cách ảnh lấp khung: vừa rộng / vừa cao / vừa cả hai / cỡ gốc. */
  fitMode: ReaderFitMode;
  /** Hiện 2 trang cạnh nhau — chỉ có tác dụng ở chế độ đọc ngang. */
  doublePage: boolean;
  /** Tốc độ tự cuộn (px mỗi giây) ở chế độ dọc. Không bật/tắt bằng field này. */
  autoScrollSpeed: number;
}

@Component({
  selector: 'app-manga-reader',
  templateUrl: './manga-reader.component.html',
  styleUrls: ['./manga-reader.component.scss']
})
export class MangaReaderComponent implements OnInit, OnDestroy {
  /** Nhãn chương dựng từ index/subIndex — `title` chỉ là mô tả, có thể rỗng. */
  readonly chapterName = chapterName;
  readonly chapterFullName = chapterFullName;

  images: ChapterImage[] = [];
  chapters: any[] = [];
  mangaId!: string;
  chapterId!: string;
  mangaName = '';
  initialPage = 0;
  currentChapterIndex = 0;
  isLoading = true;
  /** Chương không tồn tại / không có ảnh — hiện trang lỗi thay vì treo loading. */
  notFound = false;
  isMenuVisible = true;
  isSidebarOpen = false;
  isChapterListOpen = false;
  /** Danh sách chọn trang, bung từ ô "trang / tổng" ở bottombar. */
  isPageListOpen = false;
  isBottombarVisible = true;
  isFocusScrollDown = false;
  menuTimeout: any;
  private lastScrollY = 0;

  // View tracking: tính 1 view sau 5s từ khi load HOẶC sau khi xem qua 5 ảnh (bên nào tới trước).
  private readonly VIEW_DELAY_MS = 5000;
  private readonly VIEW_IMAGE_THRESHOLD = 5;
  private viewCounted = false;
  private viewTimer: any = null;

  // Reading-progress: lưu localStorage mỗi trang, đẩy lên server theo chu kỳ
  // (sau khi ngừng lật trang) + khi rời reader — KHÔNG gọi API mỗi ảnh.
  private readonly PROGRESS_FLUSH_MS = 8000;
  /**
   * Khoảng cách tối thiểu giữa hai lần gọi `/reading-progress/save`.
   * Cần vì `PROGRESS_FLUSH_MS` là debounce — nó chỉ gộp các lần lật trang CÁCH
   * NHAU DƯỚI 8s. Tự cuộn ở tốc độ thấp (60px/s, trang cao ~1400px) đổi trang
   * mỗi ~23 giây, tức lần nào cũng vượt debounce và đẻ ra một request riêng.
   */
  private readonly MIN_SAVE_INTERVAL_MS = 30000;
  private progressFlushTimer: any = null;
  /** Trang đã đẩy lên server gần nhất — trùng thì bỏ qua, khỏi gọi lại. */
  private lastSavedPage: number | null = null;
  private lastSaveAt = 0;
  /** Ảnh đang xem, 0-based. Public vì bottombar hiển thị "trang / tổng". */
  currentPage = 0;

  settings: ReaderSettings = {
    direction: 'vertical',
    horizontalDir: 'rtl',
    mode: 'normal',
    imageSize: 100,
    preloadCount: 3,
    fitMode: 'width',
    doublePage: false,
    autoScrollSpeed: 60
  };
  pendingSettings!: ReaderSettings;

  /** Tự cuộn: trạng thái phiên đọc, KHÔNG lưu vào localStorage (bật lại mỗi lần). */
  isAutoScrolling = false;
  isFullscreen = false;
  /** Bảng phím tắt bật bằng phím `?`. */
  isShortcutHelpOpen = false;

  private autoScrollRaf: number | null = null;
  private autoScrollLastTs = 0;
  /** Phần px lẻ chưa đủ 1 đơn vị để cuộn, cộng dồn qua các frame. */
  private autoScrollRemainder = 0;

  // Resume-reading prompt (mode = 'ask')
  showResumePrompt = false;
  resumeTarget: LocalProgress | null = null;
  /** True only for the first reader entry (open from detail OR page reload). */
  private isReaderEntry = true;

  @ViewChild(ReaderViewerComponent) readerViewer?: ReaderViewerComponent;

  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private location: Location,
    private mangaService: MangaService,
    private authService: AuthService,
    private readingProgress: ReadingProgressService,
    private prefs: UserPreferencesService,
    private seo: SeoService,
    @Inject(PLATFORM_ID) private platformId: Object,
    // Chỉ được cung cấp khi render ở server (`server.ts`) → phía trình duyệt là null.
    @Optional() @Inject(RESPONSE_CONTEXT) private responseContext: ResponseContext | null,
  ) {}

  /**
   * Chức năng: Đánh dấu chương không tồn tại và báo 404 cho tầng Express khi
   *   đang render ở server. Không báo thì URL chương sai vẫn trả 200 — Google
   *   coi là trang hợp lệ (soft 404), mà reader là loại URL nhiều nhất site.
   * Yêu cầu: không.
   * Kết quả trả về: không (đặt `notFound`, tắt `isLoading`).
   * Exception: không ném — phía client `responseContext` là null nên bỏ qua.
   */
  private markNotFound(): void {
    this.notFound = true;
    this.isLoading = false;
    // Chỉ ghi khi chưa ai ghi, tránh component sau đè mã của component trước.
    if (this.responseContext && this.responseContext.status === 200) {
      this.responseContext.status = 404;
    }
  }

  ngOnInit(): void {
    this.loadSettings();
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe(p => {
      this.mangaId = p['id'];
      this.chapterId = p['chapterId'];
      this.mangaName = p['name'] || '';
      // Chặn ngay giá trị âm / không phải số. Cận TRÊN chưa chặn được ở đây vì
      // chưa biết chương có bao nhiêu ảnh — việc đó do `clampInitialPage()` làm
      // sau khi ảnh về.
      const rawPage = parseInt(p['chapterIndex'] ?? '0', 10);
      this.initialPage = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 0;
      this.currentPage = this.initialPage;   // tránh flush nhầm page cũ dưới chapter mới
      this.resolveResume();   // may adjust chapter/page ('always') or show prompt ('ask')
      this.loadImages();
      this.loadChapters();
    });

    // Push any local progress changes for logged-in users (process 2, mocked).
    const uid = this.authService.currentUser?.id;
    if (uid) this.readingProgress.sync(uid).subscribe();
  }

  /**
   * Chức năng: Quyết định có khôi phục vị trí đã đọc hay không, theo tuỳ chọn của
   *   người dùng. Tiến trình lưu THEO TỪNG CHƯƠNG, nên chỉ tra vị trí của đúng
   *   chương đang mở — không bao giờ nhảy sang chương khác.
   * Yêu cầu: `mangaId`/`chapterId` đã lấy từ route; chỉ chạy ở lần vào đầu tiên.
   * Kết quả trả về: không (đặt `initialPage` hoặc bật hộp hỏi).
   * Exception: không ném.
   */
  private resolveResume(): void {
    this.showResumePrompt = false;
    this.resumeTarget = null;

    // Only on a FRESH entry (open from manga-detail OR a page reload), never on
    // internal chapter/page navigation within the reader.
    const firstEntry = this.isReaderEntry;
    this.isReaderEntry = false;
    if (!firstEntry) return;

    const mode = this.prefs.current.readProgressMode;
    if (mode === 'off') return;

    const saved = this.readingProgress.getLocal(this.mangaId, this.chapterId);
    if (!saved || saved.imageIndex <= 0) return;
    // Vào đúng trang đã lưu rồi (vd F5 tại chỗ) → không cần hỏi lại.
    if (saved.imageIndex === this.initialPage) return;

    if (mode === 'always') {
      this.applyResume(saved, false);
    } else {
      // 'ask' — prompt regardless of how the user arrived (including reload at
      // a deep-linked page). Reader still loads at the URL page underneath.
      this.resumeTarget = saved;
      this.showResumePrompt = true;
    }
  }

  /**
   * Chức năng: Nhảy tới TRANG đã lưu, trong CHÍNH chương đang mở.
   *   Bản cũ còn đổi luôn `chapterId` sang chương đã lưu — nghĩa là bấm chương
   *   nào cũng bị kéo về chương đọc dở, từ trang chi tiết không tài nào mở được
   *   chương khác. Cú click của người dùng là ý định rõ ràng nhất, nó phải thắng.
   * Yêu cầu: `saved` là tiến trình của đúng chương này.
   * Kết quả trả về: không (đặt `initialPage`, cuộn tới trang nếu ảnh đã tải).
   * Exception: không ném.
   */
  private applyResume(saved: LocalProgress, reload: boolean): void {
    this.showResumePrompt = false;
    this.initialPage = saved.imageIndex;
    this.location.replaceState(`/manga/${this.mangaId}/chapter/${this.chapterId}/${this.initialPage}`);
    if (reload) this.readerViewer?.scrollToPage(this.initialPage);
  }

  resumeReading(): void {
    if (this.resumeTarget) this.applyResume(this.resumeTarget, true);
    this.resumeTarget = null;
  }

  /** "Read from the beginning" — jump to page 0 even if reloaded mid-chapter. */
  startFromBeginning(): void {
    this.showResumePrompt = false;
    this.resumeTarget = null;
    this.initialPage = 0;
    this.readerViewer?.scrollToPage(0);
  }

  dismissResume(): void {
    this.showResumePrompt = false;
    this.resumeTarget = null;
  }

  ngOnDestroy(): void {
    // Đẩy nốt vị trí đọc cuối cùng trước khi rời reader — `force` để bỏ qua giới
    // hạn tần suất, nếu không thì lần đọc ngắn hơn 30s sẽ mất tiến trình.
    this.flushProgress(true);
    this.seo.resetToDefault();
    // Angular huỷ app sau khi render xong ở server, nên hook này CÓ chạy trên
    // Node — nơi không có `document.body` để mà dọn.
    if (isPlatformBrowser(this.platformId)) {
      document.body.classList.remove('header-hidden');
    }
    this.destroy$.next();
    this.destroy$.complete();
    clearTimeout(this.menuTimeout);
    this.cancelViewTracking();
    this.stopAutoScroll();
  }

  loadImages(): void {
    this.isLoading = true;
    this.notFound = false;
    // Chương mới thì "trang đã lưu" của chương cũ không còn ý nghĩa — không xoá
    // thì mở chương khác rồi dừng ở cùng số trang sẽ bị coi là trùng và bỏ lưu.
    this.lastSavedPage = null;
    this.mangaService.getChapterImages(this.mangaId,this.chapterId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: imgs => {
          // Chương rỗng cũng coi là không tìm thấy: không có ảnh thì trang đọc
          // chẳng có gì để hiện, trả 200 kèm màn trắng là tệ hơn trả 404.
          if (!imgs?.length) { this.markNotFound(); return; }

          this.images = imgs.sort((a, b) => a.index - b.index);
          this.clampInitialPage();
          this.isLoading = false;
          this.saveProgress(this.initialPage);
          this.startViewTracking();
        },
        // API trả 404 khi chapterId không tồn tại. Trước đây không có nhánh này
        // nên `isLoading` kẹt `true` và reader treo ở vòng xoay mãi mãi.
        error: err => {
          if (err?.status === 404) { this.markNotFound(); return; }
          this.isLoading = false;
        },
      });
  }

  /**
   * Chức năng: Kẹp `initialPage` vào khoảng ảnh thật của chương và sửa lại URL
   *   nếu lệch. Vào thẳng `.../chapter/<id>/999` khi chương chỉ có 20 ảnh thì
   *   reader hiển thị đúng ảnh cuối, nhưng URL vẫn đứng ở 999 cho tới khi người
   *   dùng cuộn — lúc đó `onPageChange` mới ghi lại. URL sai như vậy chia sẻ đi
   *   là hỏng, và F5 lại rơi vào đúng trạng thái cũ.
   * Yêu cầu: gọi SAU khi `images` đã có dữ liệu.
   * Kết quả trả về: không (sửa `initialPage`, `currentPage`, thay URL tại chỗ).
   * Exception: không ném — chương rỗng thì kẹp về 0.
   */
  private clampInitialPage(): void {
    const maxIndex = Math.max(this.images.length - 1, 0);
    const safe = Math.min(this.initialPage, maxIndex);
    if (safe === this.initialPage) return;

    this.initialPage = safe;
    this.currentPage = safe;
    // `replaceState` chứ không `navigate`: chỉ sửa URL cho khớp thực tế, không
    // thêm một mục vào lịch sử (bấm Back phải về trang trước, không quay lại 999).
    this.location.replaceState(`/manga/${this.mangaId}/chapter/${this.chapterId}/${safe}`);
  }

  loadChapters(): void {
    this.mangaService.getChapters(this.mangaId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        // `filter-chapter` KHÔNG trả 404 khi mangaId sai — nó trả 200 kèm mảng
        // rỗng. Nên phải kiểm tra ở nhánh next, không phải nhánh error.
        next: chapters => {
        this.chapters = chapters.sort((a, b) => a.index - b.index) || [];
        this.currentChapterIndex = this.chapters.findIndex(c => c.id === this.chapterId);
        const ch = this.currentChapter;
        // Route đọc truyện KHÔNG có param `:name`, nên `this.mangaName` gần như
        // luôn rỗng và title từng rơi về chuỗi 'Manga' cho mọi chương. Lấy tên
        // từ chính response chapter — nó có sẵn `mangaName`, không tốn thêm request.
        this.mangaName = this.mangaName || ch?.mangaName || this.chapters[0]?.mangaName || '';
        this.seo.setChapterReader({
          mangaName: this.mangaName || 'Manga',
          mangaId: this.mangaId,
          chapterId: this.chapterId,
          chapterIndex: ch?.index,
          chapterTitle: ch?.title,
        });
        },
        error: () => { this.chapters = []; },
      });
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.location.replaceState(`/manga/${this.mangaId}/chapter/${this.chapterId}/${page}`);
    // Xem qua >= 5 ảnh (page 0-based: tới ảnh thứ 5) -> tính view.
    if (page + 1 >= this.VIEW_IMAGE_THRESHOLD) this.markViewed();
    // Process 1: local progress, updated on every new image. Reaching the last
    // image counts as finished — drop the saved position instead.
    if (this.images.length > 0 && page >= this.images.length - 1) {
      this.readingProgress.removeLocal(this.mangaId, this.chapterId);
    } else {
      this.readingProgress.saveLocal(this.mangaId, this.chapterId, page);
    }
    // Process 2: chỉ hẹn giờ đẩy lên server, không gọi API ngay mỗi trang.
    this.scheduleProgressFlush();
  }

  /** Hẹn đẩy tiến trình lên server sau khi người dùng ngừng lật trang. */
  private scheduleProgressFlush(): void {
    if (this.progressFlushTimer) clearTimeout(this.progressFlushTimer);
    this.progressFlushTimer = setTimeout(() => this.flushProgress(), this.PROGRESS_FLUSH_MS);
  }

  /**
   * Chức năng: đẩy vị trí đọc hiện tại lên server, có chặn gọi thừa.
   * Yêu cầu: `force` — `true` khi rời reader, bỏ qua giới hạn tần suất để vị trí
   *   cuối cùng chắc chắn được lưu (vẫn bỏ qua nếu trùng trang đã lưu).
   * Kết quả trả về: không (gọi API, hoặc hẹn lại lượt sau nếu còn quá sớm).
   * Exception: không ném.
   */
  private flushProgress(force = false): void {
    if (this.progressFlushTimer) { clearTimeout(this.progressFlushTimer); this.progressFlushTimer = null; }

    // Vẫn đứng ở trang đã lưu thì không có gì mới để gửi. Chặn được cả trường hợp
    // mở chương xong ngồi yên: `loadImages()` đã lưu `initialPage` ngay lúc đó.
    if (this.currentPage === this.lastSavedPage) return;

    if (!force) {
      const since = Date.now() - this.lastSaveAt;
      if (since < this.MIN_SAVE_INTERVAL_MS) {
        // Chưa tới lượt — hẹn lại đúng lúc đủ hạn, KHÔNG bỏ luôn, nếu không thì
        // vị trí đọc mới nhất có thể không bao giờ được đẩy lên.
        this.progressFlushTimer = setTimeout(
          () => this.flushProgress(), this.MIN_SAVE_INTERVAL_MS - since,
        );
        return;
      }
    }
    this.saveProgress(this.currentPage);
  }

  goToChapter(chapter: any): void {
    this.router.navigate(['/manga', this.mangaId, 'chapter', chapter.id, 0]);
  }

  goToChapterById(id: string): void {
    const ch = this.chapters.find(c => c.id === id);
    if (ch) this.goToChapter(ch);
  }

  prevChapter(): void {
    if (this.currentChapterIndex > 0) {
      this.goToChapter(this.chapters[this.currentChapterIndex - 1]);
    }
  }

  nextChapter(): void {
    if (this.currentChapterIndex < this.chapters.length - 1) {
      this.goToChapter(this.chapters[this.currentChapterIndex + 1]);
    }
  }

  saveProgress(lastPage: number): void {
    // Luôn lưu tiến trình đọc bất kể readProgressMode; mode chỉ chi phối việc
    // resume/jump về vị trí cũ (xem resolveResume). Server chỉ lưu khi đã đăng nhập.
    const user = this.authService.currentUser;
    if (!user) return;
    this.lastSavedPage = lastPage;
    this.lastSaveAt = Date.now();
    this.readingProgress.save({
      userId: user.id,
      mangaId: this.mangaId,
      chapterId: this.chapterId,
      lastPage
    }).subscribe();
  }

  // ── View tracking ────────────────────────────────────────────────────────
  /** Bắt đầu đếm cho chapter hiện tại: 5s HOẶC scroll qua 5 ảnh -> tính 1 view. */
  private startViewTracking(): void {
    this.cancelViewTracking();
    this.viewCounted = false;
    this.viewTimer = setTimeout(() => this.markViewed(), this.VIEW_DELAY_MS);
  }

  private cancelViewTracking(): void {
    if (this.viewTimer) { clearTimeout(this.viewTimer); this.viewTimer = null; }
  }

  /** Gọi API ghi view đúng 1 lần. Backend tự dedup 1 view/ngày/manga. */
  private markViewed(): void {
    if (this.viewCounted || !this.mangaId) return;
    this.viewCounted = true;
    this.cancelViewTracking();
    this.mangaService.recordView(this.mangaId, this.chapterId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({ error: () => {} });   // lỗi đếm view không ảnh hưởng trải nghiệm đọc
    // Đẩy luôn vị trí đọc lên server cùng lúc ghi view — đảm bảo có ít nhất 1 lần
    // lưu tiến trình mỗi lần đọc chapter, không phụ thuộc vào debounce 8s/rời reader
    // (vốn không chạy khi chuyển chapter bằng nút trong cùng component).
    this.flushProgress();
  }

  @HostListener('window:scroll')
  onScroll(): void {
    const currentY = window.scrollY;
    const scrollingDown = currentY > this.lastScrollY && currentY > 100;
    this.isBottombarVisible = !scrollingDown;
    if (this.settings.mode === 'focus') {
      this.isFocusScrollDown = scrollingDown;
    } else {
      this.isFocusScrollDown = false;
    }
    if (scrollingDown) {
      document.body.classList.add('header-hidden');
    } else {
      document.body.classList.remove('header-hidden');
    }
    this.lastScrollY = currentY;
  }

  get currentChapter(): any {
    return this.chapters[this.currentChapterIndex] ?? null;
  }

  // ── Phím tắt ─────────────────────────────────────────────────────────────
  /**
   * Chức năng: phím tắt toàn trang cho reader. Mũi tên trái/phải do
   * `ReaderViewerComponent` tự bắt (nó biết rtl/ltr), ở đây chỉ lo chuyển
   * chương, fullscreen, tự cuộn và bảng trợ giúp.
   * Yêu cầu: `event` — sự kiện keydown của window. Bỏ qua khi con trỏ đang ở
   * ô nhập liệu (bình luận dưới trang) hoặc khi có phím bổ trợ.
   * Kết quả trả về: không (đổi state / điều hướng).
   * Exception: không ném.
   */
  @HostListener('window:keydown', ['$event'])
  onReaderKeydown(event: KeyboardEvent): void {
    if (event.ctrlKey || event.altKey || event.metaKey) return;

    const el = event.target as HTMLElement | null;
    const tag = el?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return;

    switch (event.key) {
      case 'n': case 'N':
        event.preventDefault(); this.nextChapter(); break;
      case 'p': case 'P':
        event.preventDefault(); this.prevChapter(); break;
      case 'f': case 'F':
        event.preventDefault(); this.toggleFullscreen(); break;
      case ' ':
        // Space chỉ có nghĩa ở chế độ dọc — bật/tắt tự cuộn thay vì nhảy trang.
        if (this.settings.direction === 'vertical') {
          event.preventDefault(); this.toggleAutoScroll();
        }
        break;
      case '?':
        event.preventDefault(); this.isShortcutHelpOpen = !this.isShortcutHelpOpen; break;
      case 'Escape':
        if (this.isShortcutHelpOpen) { this.isShortcutHelpOpen = false; }
        else if (this.isSidebarOpen) { this.closeSidebar(); }
        else if (this.isChapterListOpen) { this.closeChapterList(); }
        else if (this.isPageListOpen) { this.closeImageList(); }
        else if (this.isAutoScrolling) { this.stopAutoScroll(); }
        break;
    }
  }

  // ── Fullscreen ───────────────────────────────────────────────────────────
  /**
   * Chức năng: bật/tắt toàn màn hình bằng Fullscreen API.
   * Yêu cầu: chỉ chạy phía trình duyệt — trên Node không có `document`.
   * Kết quả trả về: không (cờ `isFullscreen` do `fullscreenchange` cập nhật,
   * không gán tay, vì người dùng có thể thoát bằng Esc của trình duyệt).
   * Exception: không ném — trình duyệt từ chối thì nuốt lỗi, giữ nguyên trạng thái.
   */
  toggleFullscreen(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  @HostListener('document:fullscreenchange')
  onFullscreenChange(): void {
    this.isFullscreen = isPlatformBrowser(this.platformId) && !!document.fullscreenElement;
  }

  // ── Tự cuộn (webtoon) ────────────────────────────────────────────────────
  toggleAutoScroll(): void {
    if (this.isAutoScrolling) this.stopAutoScroll();
    else this.startAutoScroll();
  }

  /**
   * Chức năng: bắt đầu tự cuộn trang theo `settings.autoScrollSpeed` (px/giây).
   * Dùng `requestAnimationFrame` + delta thời gian thật, không phải `setInterval`,
   * để tốc độ không đổi theo tần số quét màn hình.
   * Yêu cầu: chỉ có nghĩa ở chế độ đọc dọc và phía trình duyệt.
   * Kết quả trả về: không (bật `isAutoScrolling`, giữ handle ở `autoScrollRaf`).
   * Exception: không ném — cuộn tới đáy trang thì tự dừng.
   */
  startAutoScroll(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.settings.direction !== 'vertical' || this.isAutoScrolling) return;

    this.isAutoScrolling = true;
    this.autoScrollLastTs = 0;
    this.autoScrollRemainder = 0;

    const tick = (ts: number) => {
      if (!this.isAutoScrolling) return;

      if (this.autoScrollLastTs === 0) this.autoScrollLastTs = ts;
      const dt = (ts - this.autoScrollLastTs) / 1000;
      this.autoScrollLastTs = ts;

      // Cộng dồn phần lẻ: ở tốc độ thấp mỗi frame chưa đủ 1px, làm tròn xuống
      // từng frame sẽ ra 0 và trang đứng im.
      this.autoScrollRemainder += this.settings.autoScrollSpeed * dt;
      const px = Math.floor(this.autoScrollRemainder);
      if (px > 0) {
        this.autoScrollRemainder -= px;
        window.scrollBy(0, px);
      }

      const atBottom =
        window.innerHeight + window.scrollY >= document.body.scrollHeight - 2;
      if (atBottom) { this.stopAutoScroll(); return; }

      this.autoScrollRaf = requestAnimationFrame(tick);
    };

    this.autoScrollRaf = requestAnimationFrame(tick);
  }

  stopAutoScroll(): void {
    this.isAutoScrolling = false;
    if (this.autoScrollRaf !== null) {
      cancelAnimationFrame(this.autoScrollRaf);
      this.autoScrollRaf = null;
    }
  }

  toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
    if (this.isSidebarOpen) {
      this.pendingSettings = { ...this.settings };
    }
    this.isChapterListOpen = false;
  }

  closeSidebar(): void {
    this.isSidebarOpen = false;
  }

  applySettings(): void {
    this.settings = { ...this.pendingSettings };
    // Đổi sang đọc ngang thì tự cuộn hết ý nghĩa — dừng, không để chạy ngầm.
    if (this.settings.direction !== 'vertical') this.stopAutoScroll();
    this.saveSettings();
    this.closeSidebar();
  }

  toggleChapterList(): void {
    this.isChapterListOpen = !this.isChapterListOpen;
    // Hai dropdown mọc từ cùng một chỗ, mở chồng lên nhau là che nhau.
    if (this.isChapterListOpen) this.isPageListOpen = false;
  }

  closeChapterList(): void {
    this.isChapterListOpen = false;
  }

  selectChapter(chapter: any): void {
    this.isChapterListOpen = false;
    this.goToChapter(chapter);
  }

  // ── Danh sách chọn trang ────────────────────────────────────────────────────
  toggleImageList(): void {
    this.isPageListOpen = !this.isPageListOpen;
    if (this.isPageListOpen) this.isChapterListOpen = false;
  }

  closeImageList(): void {
    this.isPageListOpen = false;
  }

  /**
   * Chức năng: nhảy thẳng tới một ảnh theo số trang người dùng bấm trong danh sách.
   * Yêu cầu: `index` — vị trí ảnh 0-based (danh sách hiển thị `index + 1`).
   *   Cần `readerViewer` đã dựng xong; chưa có thì bỏ qua chứ không lỗi.
   * Kết quả trả về: không (đóng danh sách; viewer tự đổi `currentPage`, phát
   *   `pageChange` để `onPageChange()` cập nhật URL và tiến trình đọc).
   * Exception: không ném — index ngoài khoảng đã được viewer kẹp lại.
   */
  selectImage(index: number): void {
    this.isPageListOpen = false;
    this.readerViewer?.scrollToPage(index);
  }

  onSettingChange(): void {
  }

  /** Key cài đặt đọc — theo tài khoản, không dùng chung cả máy. */
  private settingsKey(): string {
    return scopedKey(READER_SETTINGS_PREFIX, this.authService.currentUser?.id);
  }

  private loadSettings(): void {
    try {
      dropLegacyKey(READER_SETTINGS_PREFIX);   // key global của bản cũ
      const saved = localStorage.getItem(this.settingsKey());
      if (saved) {
        this.settings = { ...this.settings, ...JSON.parse(saved) };
      }
      this.pendingSettings = { ...this.settings };
    } catch {}
  }

  private saveSettings(): void {
    localStorage.setItem(this.settingsKey(), JSON.stringify(this.settings));
  }
}
