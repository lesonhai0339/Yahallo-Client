import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { MangaService } from '../../../core/services/manga.service';
import { AuthService } from '../../../core/services/auth.service';
import { ReadingProgressService } from '../../../core/services/reading-progress.service';
import { ChapterImage } from 'src/app/core/models/chapter.interface';

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
  initialPage = 0;
  currentChapterIndex = 0;
  isLoading = true;
  isMenuVisible = true;
  menuTimeout: any;

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
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe(p => {
      this.mangaId = p['id'];
      this.chapterId = p['chapterId'];
      this.initialPage = parseInt(p['chapterIndex'] || '0', 10);
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
    this.location.replaceState(`/manga/${this.mangaId}/${this.chapterId}/${page}`);
    this.saveProgress(page);
  }

  goToChapter(chapter: any): void {
    this.router.navigate(['/manga', this.mangaId, chapter.id, 0]);
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
