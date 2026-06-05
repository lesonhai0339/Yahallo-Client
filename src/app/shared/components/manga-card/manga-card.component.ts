import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Manga } from '../../../core/models/interfaces';

const MOCK_TAGS = [
  { id: '1', name: 'Action' },
  { id: '2', name: 'Fantasy' },
  { id: '3', name: 'Romance' },
  { id: '4', name: 'Comedy' },
  { id: '5', name: 'Adventure' },
  { id: '6', name: 'Drama' },
  { id: '7', name: 'Sci-Fi' },
  { id: '8', name: 'Horror' },
];

@Component({
  selector: 'app-manga-card',
  templateUrl: './manga-card.component.html',
  styleUrls: ['./manga-card.component.scss']
})
export class MangaCardComponent implements OnInit {
  @Input() manga!: Manga;
  @Input() showTags = false;
  @Output() clicked = new EventEmitter<Manga>();

  sortedTags: { id: string; name: string }[] = [];

  constructor(private router: Router) {}

  // TODO: remove mock tags when API returns tags
  ngOnInit(): void {
    const tags = this.manga.tags?.length ? this.manga.tags : MOCK_TAGS;
    this.sortedTags = [...tags]
      .sort((a, b) => a.name.length - b.name.length)
      .slice(0, 6);
  }

  goToTag(event: Event, tagId: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.router.navigate(['/the-loai', tagId]);
  }

  goToChapter(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    const ch = this.manga.lastestChapter;
    if (ch) {
      this.router.navigate(['/manga', this.manga.id, ch.id, 0]);
    }
  }

  getRouterLink(): string[] {
    return ['/manga', this.manga.id, encodeURIComponent(this.manga.name)];
  }

  formatViews(views: number): string {
    if (!views) return '0';
    if (views >= 1_000_000) return (views / 1_000_000).toFixed(1) + 'M';
    if (views >= 1_000) return (views / 1_000).toFixed(1) + 'K';
    return views.toString();
  }

  getLatestChapter(): string {
    return `Chương ${this.manga.lastestChapter?.index ?? 'N/A'}`;
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
