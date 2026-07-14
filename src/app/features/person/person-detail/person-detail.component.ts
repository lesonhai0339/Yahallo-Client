import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AuthorService } from '../../../core/services/author.service';
import { ArtistService } from '../../../core/services/artist.service';
import { MangaService } from '../../../core/services/manga.service';
import { TranslationService } from '../../../core/services/translation.service';

type PersonKind = 'author' | 'artist';

interface PersonInfo {
  id: string;
  name: string;
  depscription?: string;
  birth?: string;
  countries?: number;
  lifeStatus?: number;
}

/**
 * Trang thông tin tác giả / hoạ sĩ + các truyện đã sáng tác.
 * Dùng chung cho cả author (`/author/:id`) và artist (`/artist/:id`) — phân biệt
 * qua route `data.kind`.
 */
@Component({
  selector: 'app-person-detail',
  templateUrl: './person-detail.component.html',
  styleUrls: ['./person-detail.component.scss'],
})
export class PersonDetailComponent implements OnInit, OnDestroy {
  kind: PersonKind = 'author';
  personId = '';
  person: PersonInfo | null = null;
  mangas: any[] = [];
  isLoading = true;
  isMangaLoading = true;
  isMangaMock = false;
  notFound = false;

  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private authorService: AuthorService,
    private artistService: ArtistService,
    private mangaService: MangaService,
    public translation: TranslationService,
  ) {}

  ngOnInit(): void {
    this.route.data.pipe(takeUntil(this.destroy$)).subscribe(d => {
      this.kind = (d['kind'] as PersonKind) ?? 'author';
    });
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(pm => {
      const id = pm.get('id') ?? '';
      if (id && id !== this.personId) {
        this.personId = id;
        this.load();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get isAuthor(): boolean { return this.kind === 'author'; }

  private load(): void {
    this.isLoading = true;
    this.notFound = false;
    this.person = null;

    const svc = this.isAuthor ? this.authorService : this.artistService;
    // filter-author / filter-artist trả về phân trang → lấy phần tử đầu theo id.
    svc.filter({ id: this.personId, pageSize: 1 }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        const raw = res?.value ?? res;
        const item = (raw?.data ?? (Array.isArray(raw) ? raw : []))[0] ?? null;
        if (!item) { this.notFound = true; this.isLoading = false; return; }
        this.person = {
          id: item.id,
          name: item.name,
          depscription: item.depscription ?? item.description ?? '',
          birth: item.birth,
          countries: item.countries ?? item.countryCode,
          lifeStatus: item.lifeStatus,
        };
        this.isLoading = false;
      },
      error: () => { this.notFound = true; this.isLoading = false; },
    });

    this.loadMangas();
  }

  private loadMangas(): void {
    this.isMangaLoading = true;
    this.isMangaMock = false;
    const params = this.isAuthor
      ? { pageNo: 1, pageSize: 12, authorId: this.personId }
      : { pageNo: 1, pageSize: 12, artistId: this.personId };

    this.mangaService.filterPaginated(params).pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        if (res.data.length > 0) {
          this.mangas = res.data;
        } else {
          this.mangas = this.mockMangas();
          this.isMangaMock = true;
        }
        this.isMangaLoading = false;
      },
      error: () => {
        this.mangas = this.mockMangas();
        this.isMangaMock = true;
        this.isMangaLoading = false;
      },
    });
  }

  /**
   * MOCK: backend `filter-manga` theo authorId/artistId có thể chưa sẵn sàng
   * (xem CLAUDE.md — filter-manga cần thêm authorName/artistName). Khi API thật
   * trả về truyện, mock này tự động bị thay thế.
   */
  private mockMangas(): any[] {
    const base = this.person?.name ?? 'Manga';
    return Array.from({ length: 4 }, (_, i) => ({
      id: `mock-${this.personId}-${i}`,
      name: `${base} — ${this.t('PERSON.WORKS')} ${i + 1}`,
      displayName: `${base} — ${this.t('PERSON.WORKS')} ${i + 1}`,
      mangaThumbnail: '/assets/noresult.png',
      mangaBackground: '',
      totalViews: Math.floor(Math.random() * 90000),
      averageRating: +(3 + Math.random() * 2).toFixed(1),
      tags: [],
      lastChapterId: '',
      lastChapterIndex: `${Math.floor(Math.random() * 100)}`,
      lastChapterUpdate: new Date().toISOString(),
    }));
  }

  get lifeStatusKey(): string {
    return this.person?.lifeStatus === 2 ? 'PERSON.DECEASED' : 'PERSON.ALIVE';
  }

  get isDeceased(): boolean {
    return this.person?.lifeStatus === 2;
  }

  t(key: string): string {
    return this.translation.get(key);
  }
}
