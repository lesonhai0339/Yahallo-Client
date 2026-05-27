import { Component, Input, Output, EventEmitter } from '@angular/core';
import { Manga } from '../../../core/models/interfaces';

@Component({
  selector: 'app-manga-card',
  templateUrl: './manga-card.component.html',
  styleUrls: ['./manga-card.component.scss']
})
export class MangaCardComponent {
  @Input() manga!: Manga;
  @Input() showTags = false;
  @Output() clicked = new EventEmitter<Manga>();

  getRouterLink(): string[] {
    return ['/manga', this.manga.mangaId, encodeURIComponent(this.manga.mangaName)];
  }

  formatViews(views: number): string {
    if (!views) return '0';
    if (views >= 1_000_000) return (views / 1_000_000).toFixed(1) + 'M';
    if (views >= 1_000) return (views / 1_000).toFixed(1) + 'K';
    return views.toString();
  }

  getLatestChapter(): string {
    return this.manga.listChaper?.[0]?.chapterName ?? 'N/A';
  }
}
