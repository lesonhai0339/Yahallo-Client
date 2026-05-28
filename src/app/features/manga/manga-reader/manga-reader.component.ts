import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { MangaService } from '../../../core/services/manga.service';
import { AuthService } from '../../../core/services/auth.service';
import { ReadingProgressService } from '../../../core/services/reading-progress.service';

@Component({
  selector: 'app-manga-reader',
  templateUrl: './manga-reader.component.html',
  styleUrls: ['./manga-reader.component.scss']
})
export class MangaReaderComponent implements OnInit, OnDestroy {
  images: any[] = [];
  chapters: any[] = [];
  mangaId!: string;
  chapterId!: string;
  currentChapterIndex = 0;
  isLoading = true;
  isMenuVisible = true;
  menuTimeout: any;

  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private mangaService: MangaService,
    private authService: AuthService,
    private readingProgress: ReadingProgressService
  ) {}

  ngOnInit(): void {
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe(p => {
      this.mangaId = p['id'];
      this.chapterId = p['chapterId'];
      this.loadImages();
      this.loadChapters();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    clearTimeout(this.menuTimeout);
  }

  loadImages(): void {
    this.isLoading = true;
    this.mangaService.getChapterImages(this.mangaId, this.chapterId).pipe(takeUntil(this.destroy$)).subscribe(imgs => {
      this.images = Array.isArray(imgs) ? imgs : (imgs as any)?.data ?? [];
      this.isLoading = false;
      this.saveProgress(0);
    });
  }

  loadChapters(): void {
    this.mangaService.getChapters(this.mangaId).pipe(takeUntil(this.destroy$)).subscribe(chapters => {
      this.chapters = chapters || [];
      this.currentChapterIndex = this.chapters.findIndex(c => c.chapterId === this.chapterId);
    });
  }

  goToChapter(chapter: any): void {
    this.router.navigate(['/manga', this.mangaId, encodeURIComponent(chapter.chapterName ?? ''), chapter.chapterId, 0]);
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

  @HostListener('mousemove')
  onMouseMove(): void {
    this.isMenuVisible = true;
    clearTimeout(this.menuTimeout);
    this.menuTimeout = setTimeout(() => { this.isMenuVisible = false; }, 3000);
  }

  get currentChapter(): any {
    return this.chapters[this.currentChapterIndex] ?? null;
  }
}
