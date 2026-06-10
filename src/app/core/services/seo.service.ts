import { Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

const SITE_NAME = 'Yahallo';
const SITE_URL = 'https://www.yahallo.online';
const DEFAULT_TITLE = 'Yahallo - Đọc Truyện Tranh Online';
const DEFAULT_DESC = 'Đọc truyện tranh online miễn phí, cập nhật nhanh nhất';
const DEFAULT_IMAGE = `${SITE_URL}/assets/og-default.png`;

@Injectable({ providedIn: 'root' })
export class SeoService {
  constructor(private title: Title, private meta: Meta) {}

  setMangaDetail(manga: {
    name: string;
    description?: string;
    mangaThumbnail?: string;
    authors?: { name: string }[];
    averageRating?: number;
    totalViews?: number;
    id: string;
  }): void {
    const title = `${manga.name} - Đọc tại ${SITE_NAME}`;
    const desc = this.truncate(manga.description || `Đọc ${manga.name} online miễn phí tại ${SITE_NAME}`, 160);
    const image = manga.mangaThumbnail || DEFAULT_IMAGE;
    const url = `${SITE_URL}/manga/${manga.id}`;

    this.title.setTitle(title);
    this.updateTags({
      description: desc,
      'og:title': title,
      'og:description': desc,
      'og:image': image,
      'og:url': url,
      'og:type': 'article',
      'og:site_name': SITE_NAME,
      'twitter:card': 'summary_large_image',
      'twitter:title': title,
      'twitter:description': desc,
      'twitter:image': image,
    });

    if (manga.authors?.length) {
      this.meta.updateTag({ name: 'author', content: manga.authors.map(a => a.name).join(', ') });
    }
  }

  setChapterReader(params: {
    mangaName: string;
    mangaId: string;
    chapterId: string;
    chapterIndex?: number;
    chapterTitle?: string;
    mangaThumbnail?: string;
  }): void {
    const chapterLabel = params.chapterTitle || `Chapter ${(params.chapterIndex ?? 0) + 1}`;
    const title = `${params.mangaName} - ${chapterLabel} - ${SITE_NAME}`;
    const desc = `Đọc ${params.mangaName} ${chapterLabel} online miễn phí tại ${SITE_NAME}`;
    const image = params.mangaThumbnail || DEFAULT_IMAGE;
    const url = `${SITE_URL}/manga/${params.mangaId}/chapter/${params.chapterId}/0`;

    this.title.setTitle(title);
    this.updateTags({
      description: desc,
      'og:title': title,
      'og:description': desc,
      'og:image': image,
      'og:url': url,
      'og:type': 'article',
      'og:site_name': SITE_NAME,
      'twitter:card': 'summary_large_image',
      'twitter:title': title,
      'twitter:description': desc,
      'twitter:image': image,
    });
  }

  setSearchPage(query?: string): void {
    const title = query
      ? `Tìm kiếm "${query}" - ${SITE_NAME}`
      : `Tìm kiếm truyện - ${SITE_NAME}`;
    this.title.setTitle(title);
    this.updateTags({
      description: `Tìm kiếm truyện tranh tại ${SITE_NAME}`,
      'og:title': title,
      'og:type': 'website',
      'og:site_name': SITE_NAME,
    });
  }

  resetToDefault(): void {
    this.title.setTitle(DEFAULT_TITLE);
    this.updateTags({
      description: DEFAULT_DESC,
      'og:title': DEFAULT_TITLE,
      'og:description': DEFAULT_DESC,
      'og:image': DEFAULT_IMAGE,
      'og:url': SITE_URL,
      'og:type': 'website',
      'og:site_name': SITE_NAME,
    });
  }

  private updateTags(tags: Record<string, string>): void {
    for (const [key, value] of Object.entries(tags)) {
      if (key.startsWith('og:') || key.startsWith('twitter:')) {
        this.meta.updateTag({ property: key, content: value });
      } else {
        this.meta.updateTag({ name: key, content: value });
      }
    }
  }

  private truncate(text: string, max: number): string {
    const clean = text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (clean.length <= max) return clean;
    return clean.substring(0, max - 3) + '...';
  }
}
