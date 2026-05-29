import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { MangaService } from '../../../core/services/manga.service';
import { AuthService } from '../../../core/services/auth.service';
import { UserInteractionService } from '../../../core/services/user-interaction.service';
import { MangaDetail, Chapter, Manga } from '../../../core/models/interfaces';

@Component({
  selector: 'app-manga-detail',
  templateUrl: './manga-detail.component.html',
  styleUrls: ['./manga-detail.component.scss']
})
export class MangaDetailComponent implements OnInit, OnDestroy {
  manga: Manga | null = null;
  chapters: Chapter[] = [];
  isLoading = true;
  isFollowing = false;
  showAllChapters = false;
  selectedRating = 0;
  hoverRating = 0;

  get visibleChapters(): Chapter[] {
    return this.showAllChapters ? this.chapters : this.chapters.slice(0, 10);
  }

  get authorNames(): string {
    return this.manga?.authors?.map(a => a.name).join(', ') || '';
  }

  get artistNames(): string {
    return this.manga?.artists?.map(a => a.name).join(', ') || '';
  }

  mangaId!: string;
  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private mangaService: MangaService,
    private authService: AuthService,
    private userInteraction: UserInteractionService,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe(params => {
      this.mangaId = params['id'];
      this.loadManga();
      this.loadChapters();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadManga(): void {
    this.isLoading = true;
    this.mangaService.getDetailAggregated(this.mangaId).pipe(takeUntil(this.destroy$)).subscribe({
      next: m => { 
        this.manga = m; 
        this.isLoading = false; 
        this.addView(); 
      },
      error: () => {
        this.mangaService.getDetail(this.mangaId).pipe(takeUntil(this.destroy$)).subscribe(m => {
          this.manga = m as any;
          this.isLoading = false;
          this.addView();
        });
      }
    });
  }

  loadChapters(): void {
    this.mangaService.getChapters(this.mangaId).pipe(takeUntil(this.destroy$)).subscribe(c => {
      this.chapters = c || [];
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
    this.userInteraction.rate(this.mangaId, this.selectedRating).subscribe(() => {
      this.toastr.success(`Đã đánh giá ${this.selectedRating} sao`);
    });
  }

  readChapter(chapter: Chapter): string {
    return `/manga/${this.mangaId}/${this.manga?.name}/${chapter.id}/0`;
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
