import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AuthorService } from '../../../core/services/author.service';
import { ArtistService } from '../../../core/services/artist.service';
import { MangaService } from '../../../core/services/manga.service';
import { TranslationService } from '../../../core/services/translation.service';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';

type PersonKind = 'author' | 'artist' | 'tag';

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

  /** Tổng số truyện của đối tượng (hiện cạnh tiêu đề, kể cả phần chưa show). */
  totalCount = 0;

  /**
   * Trang này chỉ là "xem nhanh": đúng một hàng 6 truyện mới nhất, còn lại xem ở
   * trang danh sách đầy đủ (`moreLink`) — nên không có phân trang ở đây.
   */
  readonly previewSize = 6;

  /**
   * Link tới trang danh sách đầy đủ của đối tượng (nút "xem thêm"). Property
   * thường, gán lại khi đổi đối tượng — getter sẽ trả mảng mới mỗi vòng
   * change-detection và làm `ngOnChanges` của entity-detail chạy vô ích.
   */
  moreLink: any[] = [];

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
  get isTag(): boolean { return this.kind === 'tag'; }


  private load(): void {
    this.isLoading = true;
    this.notFound = false;
    this.person = null;
    this.moreLink = ['/' + this.kind, this.personId, 'manga'];

    if (this.isTag) {
      // Thể loại: chỉ có Name/Description (không ngày sinh / tình trạng).
      this.mangaService.getTagInfo(this.personId).pipe(takeUntil(this.destroy$)).subscribe({
        next: info => {
          if (!info?.id) { this.notFound = true; this.isLoading = false; return; }
          this.person = { id: info.id, name: info.name, depscription: info.description ?? '' };
          this.isLoading = false;
        },
        error: () => { this.notFound = true; this.isLoading = false; },
      });
      this.loadMangas();
      return;
    }

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

  /**
   * Chức năng: Nạp hàng truyện xem nhanh của đối tượng (6 truyện mới nhất).
   * Yêu cầu: `personId` + `kind` đã xác định.
   * Kết quả trả về: không (cập nhật `mangas`, `totalCount`, `isMangaLoading`).
   * Exception: không ném — lỗi API thì hiển thị dữ liệu mock và bật `isMangaMock`.
   */
  private loadMangas(): void {
    this.isMangaLoading = true;
    this.isMangaMock = false;
    const paging = { pageNo: 1, pageSize: this.previewSize };
    const params = this.isAuthor
      ? { ...paging, authorId: this.personId }
      : this.isTag
        ? { ...paging, tagIds: [this.personId] }
        : { ...paging, artistId: this.personId };

    this.mangaService.filterPaginated(params).pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        if (res.data.length > 0) {
          this.mangas = res.data;
          this.totalCount = res.totalCount;
        } else {
          this.mangas = this.mockMangas();
          this.totalCount = this.mangas.length;
          this.isMangaMock = true;
        }
        this.isMangaLoading = false;
      },
      error: () => {
        this.mangas = this.mockMangas();
        this.totalCount = this.mangas.length;
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
    return Array.from({ length: this.previewSize }, (_, i) => ({
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

  t(key: string): string {
    return this.translation.get(key);
  }
}
