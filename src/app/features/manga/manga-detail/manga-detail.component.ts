import { Component, OnInit, OnDestroy } from '@angular/core';
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

  get visibleChapters(): Chapter[] {
    return this.showAllChapters ? this.chapters : this.chapters.slice(0, 5);
  }

  get authorNames(): string {
    return this.manga?.authors?.map(a => a.name).join(', ') || '';
  }

  get artistNames(): string {
    return this.manga?.artists?.map(a => a.name).join(', ') || '';
  }

  get latestChapterDate(): string {
    if (!this.chapters.length) return '';
    return [...this.chapters].sort((a, b) =>
      new Date(b.chapterDate).getTime() - new Date(a.chapterDate).getTime()
    )[0].chapterDate;
  }

  mangaId!: string;
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
    const refs = this.selectedRangeChapters.map(c => ({ id: c.id, index: c.index, title: c.title }));
    this.download.downloadRange(this.manga?.name || 'manga', refs, this.manga?.mangaThumbnail);
    this.showDownloadPanel = false;
    // Tiến trình hiển thị ở download-tray (góc dưới-phải) thay cho toast.
  }

  downloadChapter(ch: Chapter, ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.download.downloadChapter(this.manga?.name || 'manga', { id: ch.id, index: ch.index, title: ch.title }, this.manga?.mangaThumbnail);
    // Tiến trình hiển thị ở download-tray (góc dưới-phải) thay cho toast.
  }

  ngOnInit(): void {
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe(params => {
      this.mangaId = params['id'];
      this.loadManga();
      this.loadChapters();
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
      error: () => {
        this.mangaService.getDetail(this.mangaId).pipe(takeUntil(this.destroy$)).subscribe(m => {
          this.manga = m as any;
          this.isLoading = false;
          this.loadStats();
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
      });
  }

  toggleFollow(): void {
    const user = this.authService.currentUser;
    if (!user) { this.router.navigate(['/auth/login']); return; }
    if (this.isFollowing) {
      this.userInteraction.unfollow(user.id, this.mangaId).subscribe(() => {
        this.isFollowing = false;
        this.toastr.info('Đã hủy theo dõi');
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
      this.userInteraction.rate(this.mangaId, user.id, this.selectedRating).subscribe(() => {
          this.existingRating.rating = this.selectedRating;
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

  readChapterLink(chapter: Chapter): string[] {
    return ['/manga', this.mangaId, 'chapter', chapter.id, '0'];
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
