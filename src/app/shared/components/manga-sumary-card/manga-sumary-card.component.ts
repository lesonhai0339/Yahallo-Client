import { Component, Input, Output, EventEmitter, OnInit, AfterViewInit, OnDestroy, ElementRef, ViewChild, Renderer2, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { Manga } from '../../../core/models/interfaces';
import { MangaSumaryDto, TagDto } from '../../../core/models/manga.interface';

@Component({
  selector: 'app-manga-sumary-card',
  templateUrl: './manga-sumary-card.component.html',
  styleUrls: ['./manga-sumary-card.component.scss']
})
export class MangaSumaryCardComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() manga!: MangaSumaryDto | Manga | any;
  @Input() showTags = true;
  @Output() clicked = new EventEmitter<any>();
  @ViewChild('tagsContainer') tagsContainer!: ElementRef<HTMLElement>;

  sortedTags: TagDto[] = [];
  private resizeObserver?: ResizeObserver;

  constructor(
    private router: Router,
    private renderer: Renderer2,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {}

  ngOnInit(): void {
    const tags = this.manga?.tags ?? [];
    this.sortedTags = [...tags]
      .sort((a: any, b: any) => a.name.length - b.name.length)
      .slice(0, 6);
  }

  /**
   * Chức năng: Cắt bớt chip thể loại cho vừa một hàng, và theo dõi đổi kích
   *   thước để cắt lại. Toàn bộ phải nằm sau guard: `requestAnimationFrame` và
   *   `ResizeObserver` không tồn tại trên Node, ném lỗi ở đây sẽ **ngắt luôn
   *   quá trình render danh sách** — các thẻ phía sau đứng lại ở dạng vỏ rỗng,
   *   SSR trả về HTML thiếu hầu hết truyện.
   * Yêu cầu: không.
   * Kết quả trả về: không (đăng ký `resizeObserver`).
   * Exception: không ném — ở server thoát sớm, việc cắt chip để client làm sau
   *   khi hydrate (kích thước chỉ đo được khi có layout thật).
   */
  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    requestAnimationFrame(() => this.trimTags());
    if (this.tagsContainer) {
      this.resizeObserver = new ResizeObserver(() => this.trimTags());
      this.resizeObserver.observe(this.tagsContainer.nativeElement);
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  private trimTags(): void {
    if (!this.tagsContainer) return;
    const container = this.tagsContainer.nativeElement;
    const chips = Array.from(container.children) as HTMLElement[];
    const maxWidth = container.clientWidth;

    chips.forEach(c => this.renderer.setStyle(c, 'display', 'inline-flex'));

    if (maxWidth <= 0) return;

    let usedWidth = 0;
    const gap = 4;
    for (let i = 0; i < chips.length; i++) {
      const chipWidth = chips[i].offsetWidth;
      const needed = i === 0 ? chipWidth : gap + chipWidth;
      if (usedWidth + needed > maxWidth) {
        for (let j = i; j < chips.length; j++) {
          this.renderer.setStyle(chips[j], 'display', 'none');
        }
        return;
      }
      usedWidth += needed;
    }
  }

  goToTag(event: Event, tagId: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.router.navigate(['/search/advanced'], { queryParams: { tagId } });
  }

  goToChapter(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    const chapterId = this.manga.lastChapterId ?? this.manga.lastestChapter?.id;
    if (chapterId) {
      this.router.navigate(['/manga', this.manga.id, 'chapter', chapterId, 0]);
    }
  }

  getRouterLink(): string[] {
    return ['/manga', this.manga.id];
  }

  formatViews(views: number): string {
    if (!views) return 'N/A';
    if (views >= 1_000_000) return (views / 1_000_000).toFixed(1) + 'M';
    if (views >= 1_000) return (views / 1_000).toFixed(1) + 'K';
    return views.toString();
  }

  /**
   * Chỉ số chương mới nhất, `null` khi truyện chưa có chương nào. Tách riêng để
   * template ẩn hẳn nút chương thay vì hiện "Chương N/A" — nút bấm vào không đi
   * đâu thì không nên có mặt. Trả `null` chứ không `0`: chương 0 là hợp lệ.
   */
  get latestChapterIndex(): number | null {
    return this.manga?.lastChapterIndex ?? this.manga?.lastestChapter?.index ?? null;
  }

  getLatestChapter(): string {
    return `Chương ${this.latestChapterIndex ?? 'N/A'}`;
  }

  getLastChapterUpdate(): string | null {
    return this.manga.lastChapterUpdate ?? this.manga.lastestChapter?.createDate ?? null;
  }

  getTimeAgo(date: string): string {
    const now = new Date();
    const past = new Date(date);
    const diffMs = now.getTime() - past.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    const diffMonth = Math.floor(diffDay / 30);
    const diffYear = Math.floor(diffDay / 365);

    if (diffSec < 60) return 'Vừa xong';
    if (diffMin < 60) return `${diffMin} phút trước`;
    if (diffHour < 24) return `${diffHour} giờ trước`;
    if (diffDay < 30) return `${diffDay} ngày trước`;
    if (diffMonth < 12) return `${diffMonth} tháng trước`;
    return `${diffYear} năm trước`;
  }
}
