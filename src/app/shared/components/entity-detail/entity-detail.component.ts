import {
  Component, EventEmitter, HostBinding, Input, OnChanges, OnInit, Output, SimpleChanges,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslationService } from '../../../core/services/translation.service';
import { UserPreferencesService, ListView } from '../../../core/services/user-preferences.service';

export type EntityKind = 'tag' | 'author' | 'artist';

/**
 * Presentational "entity detail" — hai phần: (1) thông tin đối tượng
 * (tác giả / hoạ sĩ / thể loại), (2) danh sách manga phụ thuộc đối tượng đó
 * (cùng author / artist / tag). Không tự fetch — mọi dữ liệu qua @Input, phân
 * trang phát ra qua (pageChange). Dùng chung cho person-detail page và phần
 * result của trang search.
 *
 * Chế độ hiển thị lưới/danh sách là state cục bộ (chỉ đổi cách vẽ, không cần
 * gọi lại API) — khởi tạo từ `UserPreferencesService.defaultView`.
 */
@Component({
  selector: 'app-entity-detail',
  templateUrl: './entity-detail.component.html',
  styleUrls: ['./entity-detail.component.scss'],
})
export class EntityDetailComponent implements OnInit, OnChanges {
  @Input() kind: EntityKind = 'tag';
  @Input() name = '';
  @Input() description?: string | null;

  /** Person-only meta (author/artist). */
  @Input() birth?: string | null;
  @Input() lifeStatus?: number | null;

  @Input() mangas: any[] = [];
  @Input() isLoading = false;
  @Input() showTags = true;
  @Input() mockNotice = false;

  /** Tổng số manga hiển thị cạnh tiêu đề (vd số kết quả của search). Ẩn nếu null. */
  @Input() count?: number | null;

  /** Phân trang — search nhúng có; trang standalone thì không. */
  @Input() showPagination = false;
  @Input() currentPage = 1;
  @Input() totalCount = 0;
  @Input() pageSize = 12;
  @Output() pageChange = new EventEmitter<number>();

  /** Cho phép ẩn thanh chuyển lưới/danh sách ở nơi nhúng không cần. */
  @Input() showViewToggle = true;

  /**
   * Chia đôi chiều cao khung chứa: nửa trên là thông tin đối tượng, nửa dưới là
   * danh sách truyện. Dùng ở trang /author|/artist|/tag (khung phủ hết chiều cao
   * trang); phần nhúng trong search thì để false và trôi theo nội dung.
   */
  @Input() splitHeight = false;

  /**
   * Link "xem thêm" (routerLink) khi danh sách chỉ hiện một phần. Null = ẩn nút.
   */
  @Input() moreLink: any[] | null = null;

  /** Chỉ ở chế độ chia đôi thì host mới cần là flex container cao bằng khung cha. */
  @HostBinding('class.entity-detail--split')
  get splitClass(): boolean { return this.splitHeight; }

  viewMode: ListView = 'grid';

  /**
   * Mảng ô skeleton của chế độ danh sách. Là property thường (không getter) để
   * *ngFor không nhận mảng mới mỗi vòng change-detection.
   */
  skeletonItems: number[] = [];

  /**
   * Dữ liệu đã chuẩn hoá cho chế độ danh sách (tên/thẻ/ngày cập nhật). Tính sẵn
   * ở `ngOnChanges` thay vì gọi hàm trong template để *ngFor không phải dựng lại
   * mảng thẻ mỗi vòng change-detection.
   */
  rows: Array<{ manga: any; title: string; tags: any[]; updatedAt: string | null }> = [];

  constructor(
    public translation: TranslationService,
    private router: Router,
    private prefs: UserPreferencesService,
  ) {}

  ngOnInit(): void {
    // Không có nút chuyển thì phải khoá ở lưới: prefs của người dùng có thể là
    // 'list', và khi đó họ sẽ kẹt ở dạng danh sách mà không có cách đổi lại.
    this.viewMode = this.showViewToggle ? this.prefs.current.defaultView : 'grid';
    this.skeletonItems = Array(this.skeletonCount).fill(0);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['pageSize']) this.skeletonItems = Array(this.skeletonCount).fill(0);
    if (changes['mangas']) this.rows = this.buildRows();
  }

  /**
   * Chức năng: Chuẩn hoá `mangas` thành dữ liệu dòng cho chế độ danh sách — API
   *   trả `displayName`/`lastestChapter` ở endpoint này nhưng `name`/
   *   `lastChapterUpdate` ở endpoint khác, nên phải chấp nhận cả hai.
   * Yêu cầu: `mangas` (có thể rỗng/null).
   * Kết quả trả về: mảng dòng đã chuẩn hoá, tối đa 3 thẻ mỗi dòng.
   * Exception: không ném — item thiếu field thì rơi về '' / null.
   */
  private buildRows(): Array<{ manga: any; title: string; tags: any[]; updatedAt: string | null }> {
    return (this.mangas ?? []).map(m => ({
      manga: m,
      title: m?.displayName ?? m?.name ?? '',
      tags: (m?.tags ?? []).slice(0, 3),
      updatedAt: m?.lastChapterUpdate ?? m?.lastestChapter?.createDate ?? m?.updateDate ?? null,
    }));
  }

  get isPerson(): boolean { return this.kind === 'author' || this.kind === 'artist'; }
  get isDeceased(): boolean { return this.lifeStatus === 2; }
  get lifeStatusKey(): string { return this.isDeceased ? 'PERSON.DECEASED' : 'PERSON.ALIVE'; }

  get iconClass(): string {
    switch (this.kind) {
      case 'author': return 'fa-solid fa-pen-nib';
      case 'artist': return 'fa-solid fa-palette';
      default:       return 'fa-solid fa-tags';
    }
  }

  get roleKey(): string {
    switch (this.kind) {
      case 'author': return 'PERSON.AUTHOR';
      case 'artist': return 'PERSON.ARTIST';
      default:       return 'PERSON.TAG';
    }
  }

  get worksTitleKey(): string {
    return this.kind === 'tag' ? 'PERSON.MANGA_IN_TAG' : 'PERSON.WORKS_BY';
  }

  /**
   * Chức năng: Số ô skeleton khi đang tải — bám theo pageSize để khung chờ có
   *   đúng chiều cao của trang thật, tránh nhảy layout khi dữ liệu về.
   * Yêu cầu: `pageSize` (có thể là chuỗi khi hydrate từ prefs/server).
   * Kết quả trả về: số nguyên dương, mặc định 12 nếu pageSize không hợp lệ.
   * Exception: không ném — giá trị xấu rơi về 12.
   */
  get skeletonCount(): number {
    const n = Math.floor(Number(this.pageSize));
    return n > 0 ? Math.min(n, 24) : 12;
  }

  /**
   * Chức năng: Đổi chế độ hiển thị lưới/danh sách.
   * Yêu cầu: `mode` — 'grid' hoặc 'list'.
   * Kết quả trả về: không (cập nhật `viewMode` tại chỗ; không gọi lại API vì
   *   dữ liệu trang hiện tại đã có sẵn).
   * Exception: không ném.
   */
  setViewMode(mode: ListView): void {
    this.viewMode = mode;
  }

  /**
   * Chức năng: Rút gọn lượt xem cho dòng danh sách (1.2K / 3.4M).
   * Yêu cầu: `views` — số lượt xem, có thể undefined/0.
   * Kết quả trả về: chuỗi đã rút gọn, 'N/A' khi không có số liệu.
   * Exception: không ném.
   */
  formatViews(views: number): string {
    if (!views) return 'N/A';
    if (views >= 1_000_000) return (views / 1_000_000).toFixed(1) + 'M';
    if (views >= 1_000) return (views / 1_000).toFixed(1) + 'K';
    return views.toString();
  }

  /**
   * Chức năng: Mở tìm kiếm nâng cao theo thẻ khi bấm chip trong dòng danh sách.
   * Yêu cầu: `event` — click event (phải chặn để không kích hoạt link cha);
   *   `tagId` — id thẻ.
   * Kết quả trả về: không (điều hướng tới /search/advanced).
   * Exception: không ném.
   */
  goToTag(event: Event, tagId: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.router.navigate(['/search/advanced'], { queryParams: { tagId } });
  }
}
