import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Manga } from '../../../core/models/interfaces';
import { MangaSumaryDto, TagDto } from 'src/app/core/models/manga.interface';

@Component({
  selector: 'app-manga-sumary-card',
  templateUrl: './manga-sumary-card.component.html',
  styleUrls: ['./manga-sumary-card.component.scss']
})
export class MangaSumaryCardComponent implements OnInit {
  @Input() manga!: MangaSumaryDto;
  @Input() showTags = false;
  @Output() clicked = new EventEmitter<MangaSumaryDto>();

  sortedTags: TagDto[] = [];

  constructor(private router: Router) {}

  // TODO: remove mock tags when API returns tags
  ngOnInit(): void {
    const tags = this.manga.tags;
    this.sortedTags = [...tags]
      .sort((a, b) => a.name.length - b.name.length)
      .slice(0, 6);
  }

  goToTag(event: Event, tagId: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.router.navigate(['/search/advanced'], { queryParams: { tagId } });
  }

  goToChapter(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    const chapterId = this.manga.lastChapterId;
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

  getLatestChapter(): string {
    return `Chương ${this.manga.lastChapterIndex ?? 'N/A'}`;
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
