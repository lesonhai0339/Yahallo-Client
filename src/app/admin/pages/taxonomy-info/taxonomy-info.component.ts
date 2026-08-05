import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { AdminMangaService } from '../../services/admin-manga.service';
import { MangaService } from '../../../core/services/manga.service';
import { AuthorService } from '../../../core/services/author.service';
import { ArtistService } from '../../../core/services/artist.service';
import { MangaSortBy } from '../../../core/models/manga.interface';

/** Ba loại đối tượng phân loại đều dùng chung trang này. */
export type TaxonomyKind = 'tag' | 'author' | 'artist';

/**
 * Trang thông tin một thể loại / tác giả / hoạ sĩ ở khu quản trị, kèm danh sách
 * truyện liên quan. Vào từ `/admin/taxonomy` (bấm tên) hoặc từ chip thể loại ở
 * `/admin/manga` và `/admin/manga/:id/info`.
 *
 * Một component cho cả ba loại vì bố cục y hệt nhau — chỉ khác nguồn lấy thông
 * tin và tham số lọc truyện. Loại nào do `route.data.kind` quyết định, giống
 * cách `PersonDetailComponent` bên trang công khai đang làm.
 */
@Component({
  selector: 'app-taxonomy-info',
  templateUrl: './taxonomy-info.component.html',
  styleUrls: ['./taxonomy-info.component.scss'],
})
export class TaxonomyInfoComponent implements OnInit, OnDestroy {
  kind: TaxonomyKind = 'tag';
  entityId = '';
  entity: { id: string; name: string; description?: string } | null = null;
  entityLoading = true;
  notFound = false;

  mangas: any[] = [];
  mangaLoading = true;
  totalCount = 0;
  pageIndex = 0;
  /**
   * 16 = 2 hàng × 8 cột của lưới desktop. Lưới để CỐ ĐỊNH số cột (không dùng
   * auto-fill) nên con số này luôn lấp đúng 2 hàng, không còn hàng cuối lẻ loi.
   */
  pageSize = 16;

  /** 'grid' = lưới bìa; 'list' = mỗi truyện một hàng. Khớp với /admin/manga. */
  viewMode: 'grid' | 'list' = 'grid';

  /** Ô "nhảy tới trang" — giữ dạng chuỗi vì input số trả về chuỗi. */
  jumpTo = '';

  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private location: Location,
    private adminManga: AdminMangaService,
    private mangaService: MangaService,
    private authorService: AuthorService,
    private artistService: ArtistService,
  ) {}

  ngOnInit(): void {
    this.kind = (this.route.snapshot.data['kind'] as TaxonomyKind) ?? 'tag';
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(pm => {
      const id = pm.get('id') ?? '';
      if (id && id !== this.entityId) {
        this.entityId = id;
        this.pageIndex = 0;
        this.loadEntity();
        this.loadMangas();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Nhãn hiển thị theo loại — dùng cho tiêu đề và câu trạng thái rỗng. */
  get kindLabel(): string {
    return this.kind === 'author' ? 'tác giả' : this.kind === 'artist' ? 'hoạ sĩ' : 'thể loại';
  }

  get kindIcon(): string {
    return this.kind === 'author' ? 'edit_note' : this.kind === 'artist' ? 'brush' : 'label';
  }

  /**
   * Chức năng: Nạp tên + mô tả của đối tượng. Thể loại có endpoint riêng, còn
   *   tác giả / hoạ sĩ phải lọc theo id rồi lấy phần tử đầu — hai bên không có
   *   API "get by id" giống nhau.
   * Yêu cầu: `entityId` và `kind` đã có.
   * Kết quả trả về: không (gán `entity`, `entityLoading`, `notFound`).
   * Exception: không ném — lỗi hoặc rỗng thì bật `notFound`.
   */
  private loadEntity(): void {
    this.entityLoading = true;
    this.notFound = false;

    if (this.kind === 'tag') {
      this.mangaService.getTagInfo(this.entityId).pipe(takeUntil(this.destroy$)).subscribe({
        next: t => this.applyEntity(t?.id ? t : null),
        error: () => this.applyEntity(null),
      });
      return;
    }

    const svc = this.kind === 'author' ? this.authorService : this.artistService;
    svc.filter({ id: this.entityId, pageSize: 1 }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        const raw = res?.value ?? res;
        const item = (raw?.data ?? (Array.isArray(raw) ? raw : []))[0] ?? null;
        this.applyEntity(item ? {
          id: item.id,
          name: item.name,
          // Backend viết sai chính tả field này (`depscription`) — nhận cả hai.
          description: item.description ?? item.depscription,
        } : null);
      },
      error: () => this.applyEntity(null),
    });
  }

  private applyEntity(e: { id: string; name: string; description?: string } | null): void {
    this.entity = e;
    this.notFound = !e;
    this.entityLoading = false;
  }

  /**
   * Chức năng: Nạp một trang truyện liên quan qua endpoint admin (thấy được cả
   *   truyện đã ẩn, khác endpoint công khai). Tham số lọc đổi theo `kind`.
   * Yêu cầu: `entityId` đã có; `pageIndex` / `pageSize` đã đặt.
   * Kết quả trả về: không (gán `mangas`, `totalCount`, `mangaLoading`).
   * Exception: không ném — lỗi thì để danh sách rỗng.
   */
  private loadMangas(): void {
    this.mangaLoading = true;
    this.adminManga.filter({
      pageNo: this.pageIndex + 1,
      pageSize: this.pageSize,
      tagIds: this.kind === 'tag' ? [this.entityId] : null,
      authorId: this.kind === 'author' ? this.entityId : null,
      artistId: this.kind === 'artist' ? this.entityId : null,
      sortBy: MangaSortBy.LastUpdate,
      reverseSort: true,
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        const page = res?.value ?? res;
        const items = page?.data ?? page?.items ?? [];
        this.totalCount = page?.totalCount ?? items.length;
        // Payload admin dùng displayName / mangaThumbnail / totalView /
        // totalChapter — quy đổi sang tên mà template dùng chung đang đọc.
        this.mangas = items.map((m: any) => ({
          ...m,
          name: m.displayName ?? m.name,
          thumbnail: m.mangaThumbnail ?? null,
          totalViews: m.totalView ?? m.totalViews ?? 0,
          totalChapters: m.totalChapter ?? m.totalChapters ?? 0,
        }));
        this.mangaLoading = false;
      },
      error: () => { this.mangas = []; this.totalCount = 0; this.mangaLoading = false; },
    });
  }

  setViewMode(mode: 'grid' | 'list'): void {
    this.viewMode = mode;
  }

  /**
   * Chức năng: Nhảy tới trang người dùng gõ trong ô. Người dùng đếm từ 1, nội
   *   bộ đếm từ 0 nên phải trừ đi 1.
   * Yêu cầu: `jumpTo` là chuỗi số; ngoài khoảng hợp lệ thì bỏ qua.
   * Kết quả trả về: không (đổi trang rồi xoá ô nhập).
   * Exception: không ném — nhập bậy thì không làm gì.
   */
  jumpToPage(): void {
    const n = Number(this.jumpTo);
    if (!Number.isFinite(n)) return;
    const index = Math.trunc(n) - 1;
    if (index < 0 || index >= this.totalPages) return;
    this.jumpTo = '';
    this.goPage(index);
  }

  get totalPages(): number {
    return this.pageSize > 0 ? Math.ceil(this.totalCount / this.pageSize) : 1;
  }

  goPage(index: number): void {
    if (index < 0 || index >= this.totalPages || index === this.pageIndex) return;
    this.pageIndex = index;
    this.loadMangas();
  }

  /** Quay về nơi vừa tới, giữ nguyên trang / bộ lọc đang xem ở danh sách. */
  goBack(): void {
    if (typeof history !== 'undefined' && history.length > 1) this.location.back();
    else this.router.navigate(['/admin/taxonomy']);
  }

  goManga(m: any): void {
    this.router.navigate(['/admin/manga', m.id, 'info']);
  }

  /** Xem toàn bộ truyện liên quan trong danh sách chính (kèm bộ lọc tương ứng). */
  goAllManga(): void {
    const key = this.kind === 'tag' ? 'tagIds' : this.kind === 'author' ? 'authorId' : 'artistId';
    this.router.navigate(['/admin/manga'], { queryParams: { [key]: this.entityId } });
  }
}
