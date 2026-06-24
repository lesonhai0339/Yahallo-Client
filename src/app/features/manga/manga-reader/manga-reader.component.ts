import { Component, OnInit, OnDestroy, HostListener, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { MangaService } from '../../../core/services/manga.service';
import { AuthService } from '../../../core/services/auth.service';
import { ReadingProgressService, LocalProgress } from '../../../core/services/reading-progress.service';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';
import { SeoService } from '../../../core/services/seo.service';
import { ChapterImage } from '../../../core/models/chapter.interface';
import { ReaderViewerComponent } from '../../../shared/components/reader-viewer/reader-viewer.component';

export interface ReaderSettings {
  direction: 'vertical' | 'horizontal';
  horizontalDir: 'rtl' | 'ltr';
  mode: 'normal' | 'focus';
  imageSize: number;
  preloadCount: number;
}

@Component({
  selector: 'app-manga-reader',
  templateUrl: './manga-reader.component.html',
  styleUrls: ['./manga-reader.component.scss']
})
export class MangaReaderComponent implements OnInit, OnDestroy {
  images: ChapterImage[] = [];
  chapters: any[] = [];
  mangaId!: string;
  chapterId!: string;
  mangaName = '';
  initialPage = 0;
  currentChapterIndex = 0;
  isLoading = true;
  isMenuVisible = true;
  isSidebarOpen = false;
  isChapterListOpen = false;
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
  private progressFlushTimer: any = null;
  private currentPage = 0;

  settings: ReaderSettings = {
    direction: 'vertical',
    horizontalDir: 'rtl',
    mode: 'normal',
    imageSize: 100,
    preloadCount: 3
  };
  pendingSettings!: ReaderSettings;

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
    private seo: SeoService
  ) {}

  ngOnInit(): void {
    this.loadSettings();
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe(p => {
      this.mangaId = p['id'];
      this.chapterId = p['chapterId'];
      this.mangaName = p['name'] || '';
      this.initialPage = parseInt(p['chapterIndex'] || '0', 10);
      this.resolveResume();   // may adjust chapter/page ('always') or show prompt ('ask')
      this.loadImages();
      this.loadChapters();
    });

    // Push any local progress changes for logged-in users (process 2, mocked).
    const uid = this.authService.currentUser?.id;
    if (uid) this.readingProgress.sync(uid).subscribe();
  }

  /** Decide whether to resume to a saved position based on the user's setting. */
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

    const saved = this.readingProgress.getLocal(this.mangaId);
    if (!saved || saved.imageIndex <= 0) return;

    if (mode === 'always') {
      this.applyResume(saved, false);
    } else {
      // 'ask' — prompt regardless of how the user arrived (including reload at
      // a deep-linked page). Reader still loads at the URL page underneath.
      this.resumeTarget = saved;
      this.showResumePrompt = true;
    }
  }

  /** Jump to a saved position. `reload` = the chapter images are already loaded. */
  private applyResume(saved: LocalProgress, reload: boolean): void {
    this.showResumePrompt = false;
    if (saved.chapterId && saved.chapterId !== this.chapterId) {
      this.chapterId = saved.chapterId;
      this.initialPage = saved.imageIndex;
      this.location.replaceState(`/manga/${this.mangaId}/chapter/${this.chapterId}/${this.initialPage}`);
      if (reload) { this.loadImages(); this.loadChapters(); }
    } else {
      this.initialPage = saved.imageIndex;
      if (reload) this.readerViewer?.scrollToPage(this.initialPage);
    }
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
    // Đẩy nốt vị trí đọc cuối cùng trước khi rời reader.
    this.flushProgress();
    this.seo.resetToDefault();
    document.body.classList.remove('header-hidden');
    this.destroy$.next();
    this.destroy$.complete();
    clearTimeout(this.menuTimeout);
    this.cancelViewTracking();
  }

  loadImages(): void {
    this.isLoading = true;
    this.mangaService.getChapterImages(this.chapterId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(imgs => {
        this.images = imgs.sort((a, b) => a.index - b.index);
        this.isLoading = false;
        this.saveProgress(this.initialPage);
        this.startViewTracking();
      });
  }

  loadChapters(): void {
    this.mangaService.getChapters(this.mangaId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(chapters => {
        this.chapters = chapters.sort((a, b) => a.index - b.index) || [];
        this.currentChapterIndex = this.chapters.findIndex(c => c.id === this.chapterId);
        const ch = this.currentChapter;
        this.seo.setChapterReader({
          mangaName: this.mangaName || 'Manga',
          mangaId: this.mangaId,
          chapterId: this.chapterId,
          chapterIndex: ch?.index,
          chapterTitle: ch?.title,
        });
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
      this.readingProgress.removeLocal(this.mangaId);
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

  /** Đẩy vị trí đọc hiện tại lên server (1 lần). Gọi định kỳ và khi rời reader. */
  private flushProgress(): void {
    if (this.progressFlushTimer) { clearTimeout(this.progressFlushTimer); this.progressFlushTimer = null; }
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
    if (this.prefs.current.readProgressMode === 'off') return;
    const user = this.authService.currentUser;
    if (!user) return;
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
    this.saveSettings();
    this.closeSidebar();
  }

  toggleChapterList(): void {
    this.isChapterListOpen = !this.isChapterListOpen;
  }

  closeChapterList(): void {
    this.isChapterListOpen = false;
  }

  selectChapter(chapter: any): void {
    this.isChapterListOpen = false;
    this.goToChapter(chapter);
  }

  onSettingChange(): void {
  }

  private loadSettings(): void {
    try {
      const saved = localStorage.getItem('reader-settings');
      if (saved) {
        this.settings = { ...this.settings, ...JSON.parse(saved) };
      }
      this.pendingSettings = { ...this.settings };
    } catch {}
  }

  private saveSettings(): void {
    localStorage.setItem('reader-settings', JSON.stringify(this.settings));
  }
}
