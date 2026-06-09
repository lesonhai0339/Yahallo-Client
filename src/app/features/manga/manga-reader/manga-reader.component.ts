import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { MangaService } from '../../../core/services/manga.service';
import { AuthService } from '../../../core/services/auth.service';
import { ReadingProgressService } from '../../../core/services/reading-progress.service';
import { ChapterImage } from '../../../core/models/chapter.interface';

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

  settings: ReaderSettings = {
    direction: 'vertical',
    horizontalDir: 'rtl',
    mode: 'normal',
    imageSize: 100,
    preloadCount: 3
  };
  pendingSettings!: ReaderSettings;

  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private location: Location,
    private mangaService: MangaService,
    private authService: AuthService,
    private readingProgress: ReadingProgressService
  ) {}

  ngOnInit(): void {
    this.loadSettings();
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe(p => {
      this.mangaId = p['id'];
      this.chapterId = p['chapterId'];
      this.mangaName = p['name'] || '';
      this.initialPage = parseInt(p['chapterIndex'] || '0', 10);
      this.loadImages();
      this.loadChapters();
    });
  }

  ngOnDestroy(): void {
    document.body.classList.remove('header-hidden');
    this.destroy$.next();
    this.destroy$.complete();
    clearTimeout(this.menuTimeout);
  }

  loadImages(): void {
    this.isLoading = true;
    this.mangaService.getChapterImages(this.chapterId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(imgs => {
        this.images = imgs.sort((a, b) => a.index - b.index);
        this.isLoading = false;
        this.saveProgress(this.initialPage);
      });
  }

  loadChapters(): void {
    this.mangaService.getChapters(this.mangaId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(chapters => {
        this.chapters = chapters.sort((a, b) => a.index - b.index) || [];
        this.currentChapterIndex = this.chapters.findIndex(c => c.id === this.chapterId);
      });
  }

  onPageChange(page: number): void {
    this.location.replaceState(`/manga/${this.mangaId}/chapter/${this.chapterId}/${page}`);
    this.saveProgress(page);
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
    const user = this.authService.currentUser;
    if (!user) return;
    this.readingProgress.save({
      userId: user.id,
      mangaId: this.mangaId,
      chapterId: this.chapterId,
      lastPage
    }).subscribe();
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
