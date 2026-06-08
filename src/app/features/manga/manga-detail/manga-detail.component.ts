import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { MangaService } from '../../../core/services/manga.service';
import { AuthService } from '../../../core/services/auth.service';
import { UserInteractionService } from '../../../core/services/user-interaction.service';
import { MangaDetail, Chapter, Manga } from '../../../core/models/interfaces';
import { MangaSumaryDto } from '../../../core/models/manga.interface';

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
  hasRated = false;
  existingRating = 0;
  showReratePanel = false;
  synopsisExpanded = false;
  sameAuthorManga: MangaSumaryDto[] = [];
  sameArtistManga: MangaSumaryDto[] = [];

  get visibleChapters(): Chapter[] {
    return this.showAllChapters ? this.chapters : this.chapters.slice(0, 10);
  }

  get authorNames(): string {
    return this.manga?.authors?.map(a => a.name).join(', ') || '';
  }

  get artistNames(): string {
    return this.manga?.artists?.map(a => a.name).join(', ') || '';
  }

  get latestChapterDate(): string {
    if (!this.chapters.length) return this.manga?.updateDate || '';
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
        this.manga.description = 'Trong một thế giới nơi con người sống chung với yêu quái và ma thuật, chàng trai trẻ Takeshi vô tình phát hiện mình sở hữu sức mạnh cổ đại bị phong ấn hàng ngàn năm. Khi các thế lực bóng tối bắt đầu trỗi dậy và đe dọa hủy diệt cả thế giới, Takeshi buộc phải rời bỏ cuộc sống bình yên tại ngôi làng nhỏ để bắt đầu hành trình tìm kiếm sự thật về nguồn gốc sức mạnh của mình. Trên đường đi, anh gặp gỡ những người đồng hành đáng tin cậy — một nữ kiếm sĩ lạnh lùng với quá khứ bí ẩn, một pháp sư trẻ tuổi nhưng tài năng xuất chúng, và một tên trộm ranh mãnh nhưng tốt bụng. Cùng nhau, họ đối mặt với vô số thử thách, từ những trận chiến khốc liệt với quân đoàn bóng tối cho đến những âm mưu chính trị phức tạp trong triều đình. Liệu Takeshi có thể kiểm soát được sức mạnh đang ngày càng bùng phát trong mình, hay nó sẽ nuốt chửng anh trước khi anh kịp cứu thế giới?';
        this.isLoading = false;
        this.addView();
        this.loadRelatedManga();
        this.loadUserRating();
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
      this.chapters = (c || []).sort((a, b) => a.index - b.index);
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
      next: (star) => {
        if (star > 0) {
          this.hasRated = true;
          this.existingRating = star;
          this.selectedRating = star;
        }
      },
      error: () => {}
    });
  }

  // TODO: replace with dedicated API when available
  loadRelatedManga(): void {
    if (!this.manga) return;
    this.mangaService.getNewestManga(1, 6).pipe(takeUntil(this.destroy$)).subscribe(list => {
      const filtered = (list || []).filter(m => m.id !== this.mangaId);
      this.sameAuthorManga = filtered.slice(0, 4);
      this.sameArtistManga = filtered.slice(2, 6);
    });
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
