import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { MangaService } from '../../../core/services/manga.service';
import { AuthService } from '../../../core/services/auth.service';
import { UserInteractionService } from '../../../core/services/user-interaction.service';
import { SeoService } from '../../../core/services/seo.service';
import { Chapter, Manga, MangaDetailDto, MangaStatsDto } from '../../../core/models/interfaces';
import { ChapterSortBy } from '../../../core/models/chapter.interface';

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
  existingRating = 0;
  showReratePanel = false;
  synopsisExpanded = false;
  sameAuthorManga: Manga[] = [];
  sameArtistManga: Manga[] = [];

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
    private seo: SeoService
  ) {}

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
        this.addView();
        this.loadStats();
        this.loadRelatedManga();
        this.loadUserRating();
      },
      error: () => {
        this.mangaService.getDetail(this.mangaId).pipe(takeUntil(this.destroy$)).subscribe(m => {
          this.manga = m as any;
          this.isLoading = false;
          this.addView();
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

  addView(): void {
    if (this.mangaId) {
      this.userInteraction.addView(this.mangaId).subscribe();
    }
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
    this.userInteraction.rate(this.mangaId, user.id, this.selectedRating).subscribe(() => {
      this.existingRating = this.selectedRating;
      this.hasRated = true;
      this.showReratePanel = false;
      this.toastr.success(`Đã đánh giá ${this.selectedRating} sao`);
    });
  }

  openRerate(): void {
    this.selectedRating = this.existingRating;
    this.showReratePanel = true;
  }

  cancelRerate(): void {
    this.showReratePanel = false;
    this.selectedRating = this.existingRating;
    this.hoverRating = 0;
  }

  private loadUserRating(): void {
    const user = this.authService.currentUser;
    if (!user) return;
    this.userInteraction.getUserRating(this.mangaId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (rating) => {
        if (rating.rating > 0) {
          this.hasRated = true;
          this.existingRating = rating.rating;
          this.selectedRating = rating.rating;
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

  formatDate(date: string): string {
    if (!date) return '';
    try { return new Date(date).toLocaleDateString('vi-VN'); } catch { return date; }
  }

  formatNumber(n: number): string {
    if (!n) return '0';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return n.toString();
  }
}
