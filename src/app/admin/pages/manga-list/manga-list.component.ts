import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { Subject, debounceTime, takeUntil } from 'rxjs';
import { AdminMangaService, AdminMangaFilter, DisplayMode } from '../../services/admin-manga.service';
import { MangaSortBy } from '../../../core/models/manga.interface';
import { MANGA_LEVEL_OPTIONS } from '../../../core/models/manga-enums';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';
import { PermissionService } from '../../../core/services/permission.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-manga-list',
  templateUrl: './manga-list.component.html',
  styleUrls: ['./manga-list.component.scss']
})
export class MangaListComponent implements OnInit, OnDestroy {
  /** Một trang truyện đang hiển thị. Mảng thường — không còn MatTableDataSource. */
  items: any[] = [];
  totalCount = 0;
  pageSize = 20;
  pageIndex = 0;
  filterValue = '';
  loading = false;

  // ── Bộ lọc (mirror AdminFilterMangaQuery) ──────────────────────────────────
  showFilters = false;
  /** Nội dung ô tìm kiếm — bind hai chiều để nút "Xoá tất cả" xoá được nó. */
  searchTerm = '';
  /** Tiêu chí đang áp dụng. `''` = không lọc theo tiêu chí đó. */
  criteria = this.emptyCriteria();
  /** Bản nháp trong panel — chỉ đổ sang `criteria` khi bấm "Áp dụng". */
  draft = this.emptyCriteria();

  readonly sortOptions = [
    { value: MangaSortBy.LastUpdate,   label: 'Cập nhật' },
    { value: MangaSortBy.CreateDate,   label: 'Ngày tạo' },
    { value: MangaSortBy.DeleteDate,   label: 'Ngày xoá' },
    { value: MangaSortBy.ViewCount,    label: 'Lượt xem' },
    { value: MangaSortBy.ChapterCount, label: 'Số chương' },
    { value: MangaSortBy.Rating,       label: 'Đánh giá' },
    { value: MangaSortBy.CommentCount, label: 'Bình luận' },
  ];
  /**
   * Không lọc gì thì danh sách vẫn phải sắp theo lần cập nhật gần nhất, nên đây
   * là mốc mặc định chứ không phải "không sắp xếp".
   */
  readonly defaultSort: string = MangaSortBy.LastUpdate;
  sortBy: string = MangaSortBy.LastUpdate;
  /** true = giảm dần (mới nhất / nhiều nhất trước). */
  reverseSort = true;

  // Giá trị enum lấy theo cách bảng này vẫn đang hiển thị dữ liệu thật
  // (getStatusLabel / getTypeLabel). Nếu backend đổi thứ tự enum thì sửa ở đây.
  readonly statusOptions = [
    { value: '1', label: 'Đang ra' },
    { value: '2', label: 'Tạm dừng' },
    { value: '3', label: 'Hoàn thành' },
  ];
  readonly typeOptions = [
    { value: '1', label: 'Oneshot' },
    { value: '2', label: 'OVA' },
    { value: '3', label: 'Dojinshi' },
    { value: '4', label: 'Series' },
  ];
  // `MangaLevel` là BẬC TRUY CẬP (Normal..Master), không phải phân loại độ tuổi
  // — nhãn "13+/16+/18+" trước đây là sai, và giá trị '0' không có trong enum.
  // Giữ kiểu chuỗi vì bộ lọc này gửi thẳng lên query param.
  readonly levelOptions = MANGA_LEVEL_OPTIONS.map(
    o => ({ value: String(o.value), label: o.label })
  );
  readonly displayModeOptions = [
    { value: DisplayMode.Visible,  label: 'Đang hiện' },
    { value: DisplayMode.Hidden,   label: 'Đã ẩn' },
    { value: DisplayMode.Disabled, label: 'Đã khoá' },
  ];

  private search$ = new Subject<string>();
  private destroy$ = new Subject<void>();
  /** 'grid' = nhiều cột; 'list' = mỗi truyện một hàng đầy chiều ngang. */
  viewMode: 'grid' | 'list' = 'grid';

  /** Desktop: manga whose detail card is shown in the right aside. */
  selectedManga: any = null;
  /** Full detail (authors/artists/description) of the selected manga. */
  detail: any = null;
  detailLoading = false;

  constructor(
    private mangaService: AdminMangaService,
    private dialog: MatDialog,
    private router: Router,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    public perm: PermissionService,
    private auth: AuthService
  ) {}

  ngOnInit(): void {
    // Tìm theo tên chạy trên SERVER (tham số Name) chứ không lọc tại chỗ như
    // trước — bảng chỉ giữ một trang, lọc tại chỗ sẽ bỏ sót các trang còn lại.
    this.search$.pipe(debounceTime(350), takeUntil(this.destroy$)).subscribe(v => {
      this.criteria.name = v;
      this.pageIndex = 0;
      this.loadData();
    });
    // Theo dõi query param thay vì đọc snapshot một lần: bấm thể loại NGAY TRÊN
    // trang này cũng điều hướng (đổi URL) chứ không lọc ngầm, mà cùng route thì
    // `ngOnInit` không chạy lại — chỉ luồng này bắt được.
    //
    // `firstEmit` là bắt buộc: lần phát đầu tiên KHÔNG có query param nào thì
    // giá trị đọc ra ('') trùng đúng giá trị mặc định trong `criteria`, guard
    // bên dưới sẽ thoát sớm và trang không gọi API lần nào cả.
    let firstEmit = true;
    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe(qp => {
      const tagIds = qp.get('tagIds') ?? '';
      const ownerId = qp.get('ownerId') ?? '';
      const authorId = qp.get('authorId') ?? '';
      const artistId = qp.get('artistId') ?? '';
      const changed = tagIds !== this.criteria.tagIds
        || ownerId !== this.criteria.ownerId
        || authorId !== this.criteria.authorId
        || artistId !== this.criteria.artistId;
      if (!firstEmit && !changed) return;
      firstEmit = false;

      this.criteria.tagIds = tagIds;
      this.criteria.ownerId = ownerId;
      this.criteria.authorId = authorId;
      this.criteria.artistId = artistId;
      this.draft.tagIds = tagIds;
      this.draft.ownerId = ownerId;
      this.draft.authorId = authorId;
      this.draft.artistId = artistId;
      this.pageIndex = 0;
      this.loadData();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private emptyCriteria() {
    return {
      name: '', authorId: '', artistId: '', tagIds: '',
      level: '', status: '', displayMode: '', type: '', countries: '',
      ownerId: '', isDeleted: false,
    };
  }

  /** Số tiêu chí trong panel đang bật — hiện trên nút "Lọc". Không tính sắp xếp. */
  get activeFilterCount(): number {
    const c = this.criteria;
    const values = [c.authorId, c.artistId, c.tagIds, c.level, c.status,
      c.displayMode, c.type, c.countries, c.ownerId];
    return values.filter(v => !!v).length + (c.isDeleted ? 1 : 0);
  }

  private buildFilter(): AdminMangaFilter {
    const c = this.criteria;
    return {
      pageNo: this.pageIndex + 1,
      pageSize: this.pageSize,
      name: c.name || null,
      authorId: c.authorId || null,
      artistId: c.artistId || null,
      tagIds: c.tagIds ? c.tagIds.split(',').map(s => s.trim()).filter(Boolean) : null,
      level: c.level || null,
      status: c.status || null,
      displayMode: c.displayMode || null,
      type: c.type || null,
      countries: c.countries || null,
      ownerId: c.ownerId || null,
      sortBy: this.sortBy || this.defaultSort,
      reverseSort: this.reverseSort,
      isDeleted: c.isDeleted,
    };
  }

  /**
   * Chức năng: Tải một trang danh sách. Luôn đi qua `admin/filter` — kể cả khi
   *   không lọc gì — vì chỉ endpoint đó nhận `SortBy`, mà danh sách mặc định
   *   phải sắp theo lần cập nhật gần nhất. `admin/get-all-pagination` không có
   *   tham số sắp xếp nên thứ tự phụ thuộc backend, không kiểm soát được.
   * Yêu cầu: `pageIndex` / `pageSize` / `criteria` / `sortBy` đã đặt.
   * Kết quả trả về: không (cập nhật `items`, `totalCount`, `loading`).
   * Exception: không ném — lỗi API thì chỉ tắt `loading`.
   */
  loadData(): void {
    this.loading = true;
    this.mangaService.filter(this.buildFilter()).subscribe({
      next: (res: any) => {
        const page = res?.value ?? res;
        let items = page?.data ?? page?.items ?? [];

        // Chủ sở hữu nằm ở `owner.id` — backend đã bỏ hẳn `userId` ở cấp gốc.
        if (this.perm.isOwnMangaOnly()) {
          const uid = this.auth.currentUser?.id;
          items = items.filter((m: any) => m.owner?.id === uid);
        }

        this.totalCount = this.perm.isOwnMangaOnly() ? items.length : (page?.totalCount ?? 0);
        // AdminMangaDto dùng displayName / totalView / totalChapter / totalComment /
        // owner, còn bảng + card đọc name / totalViews / totalChapters / thumbnail.
        // Chuẩn hoá ở đây; vẫn giữ fallback tên cũ để không vỡ nếu API đổi lại.
        this.items = items.map((m: any) => ({
          ...m,
          name: m.displayName ?? m.name,
          thumbnail: m.mangaThumbnail ?? null,
          totalViews: m.totalView ?? m.viewCount ?? m.totalViews ?? 0,
          totalChapters: m.totalChapter ?? m.lastestChapter?.index ?? m.totalChapters ?? 0,
          totalComments: m.totalComment ?? m.commentCount ?? 0,
          updateDate: m.updateDate ?? m.lastestChapter?.createDate ?? null,
          ownerId: m.owner?.id ?? null,
          ownerName: m.owner?.name ?? null,
        }));
        this.loading = false;
        // Mặc định chọn phần tử đầu để hiển thị card chi tiết bên phải.
        const first = this.items[0];
        if (first) {
          this.selectManga(first, false);
        } else {
          this.selectedManga = null;
          this.detail = null;
        }
      },
      error: () => { this.loading = false; }
    });
  }

  /** Chọn manga để hiện card chi tiết. toggle=true: click lại thì bỏ chọn. */
  selectManga(manga: any, toggle = true): void {
    if (toggle && this.selectedManga?.id === manga.id) {
      this.selectedManga = null;
      this.detail = null;
      return;
    }
    this.selectedManga = manga;
    this.loadDetail(manga.id);
  }

  private loadDetail(id: string): void {
    this.detail = null;
    this.detailLoading = true;
    // getDetail() đã bóc sẵn item đầu của `admin/filter`, không còn lớp `value`.
    this.mangaService.getDetail(id).subscribe({
      next: (d: any) => {
        this.detail = d;
        // Gộp dữ liệu chi tiết (displayName, tags, description, authors, artists...)
        // vào selectedManga để card hiển thị đầy đủ; giữ id đúng của dòng đang chọn.
        if (d && this.selectedManga?.id === d.id) {
          this.selectedManga = {
            ...this.selectedManga,
            ...d,
            name: d.displayName ?? this.selectedManga.name,
            thumbnail: d.mangaThumbnail ?? this.selectedManga.thumbnail,
          };
        }
        this.detailLoading = false;
      },
      error: () => { this.detailLoading = false; }
    });
  }

  authorNames(d: any): string {
    return (d?.authors ?? []).map((a: any) => a.name).join(', ');
  }

  artistNames(d: any): string {
    return (d?.artists ?? []).map((a: any) => a.name).join(', ');
  }

  /** Tổng số trang — dùng cho thanh phân trang tự viết (đã bỏ mat-paginator). */
  get totalPages(): number {
    return this.pageSize > 0 ? Math.ceil(this.totalCount / this.pageSize) : 1;
  }

  goPage(index: number): void {
    if (index < 0 || index >= this.totalPages || index === this.pageIndex) return;
    this.pageIndex = index;
    this.loadData();
  }

  setPageSize(size: number): void {
    if (size === this.pageSize) return;
    this.pageSize = size;
    this.pageIndex = 0;
    this.loadData();
  }

  /**
   * Chức năng: Mở trang thông tin truyện. Cố ý KHÔNG dẫn sang form sửa — xem và
   *   sửa là hai ý định khác nhau.
   * Yêu cầu: `manga.id` hợp lệ.
   * Kết quả trả về: không (điều hướng).
   * Exception: không ném.
   */
  goInfo(manga: any): void {
    this.router.navigate(['/admin/manga', manga.id, 'info']);
  }

  setViewMode(mode: 'grid' | 'list'): void {
    this.viewMode = mode;
  }

  /**
   * Chức năng: Mở trang thông tin thể loại — giống bấm vào truyện thì ra
   *   `manga-info`, bấm vào người đăng thì ra hồ sơ.
   * Yêu cầu: `tag.id` hợp lệ.
   * Kết quả trả về: không (điều hướng).
   * Exception: không ném — thiếu id thì bỏ qua.
   */
  goTag(event: Event, tag: any): void {
    event.stopPropagation();
    if (!tag?.id) return;
    this.router.navigate(['/admin/tags', tag.id]);
  }

  /** Ô tìm kiếm: đẩy vào subject có debounce, gọi API với tham số `Name`. */
  onSearchChange(value: string): void {
    this.search$.next((value ?? '').trim());
  }

  /** Còn bất kỳ thứ gì lệch khỏi mặc định không — để hiện nút xoá nhanh. */
  get hasAnyActive(): boolean {
    return this.activeFilterCount > 0
      || !!this.searchTerm
      || this.sortBy !== this.defaultSort
      || !this.reverseSort;
  }

  /** Mở/đóng panel lọc; mở thì nạp lại bản nháp từ tiêu chí đang áp dụng. */
  toggleFilters(): void {
    this.showFilters = !this.showFilters;
    if (this.showFilters) this.draft = { ...this.criteria };
  }

  /**
   * Chức năng: Chốt bản nháp thành tiêu chí đang áp dụng rồi tải lại từ trang 1.
   * Yêu cầu: không (đọc `draft`).
   * Kết quả trả về: không.
   * Exception: không ném.
   */
  applyFilters(): void {
    // Giữ nguyên `name` của ô tìm kiếm — panel lọc không quản lý field đó.
    this.criteria = { ...this.draft, name: this.criteria.name };
    this.pageIndex = 0;
    this.showFilters = false;
    this.loadData();
  }

  /**
   * Chức năng: Xoá TẤT CẢ — mọi tiêu chí lọc, từ khoá tìm kiếm và sắp xếp — đưa
   *   bảng về đúng trạng thái ban đầu (quay lại endpoint liệt kê thuần).
   * Yêu cầu: không.
   * Kết quả trả về: không (tải lại từ trang 1).
   * Exception: không ném.
   */
  clearAll(): void {
    this.criteria = this.emptyCriteria();
    this.draft = this.emptyCriteria();
    this.searchTerm = '';
    this.sortBy = this.defaultSort;
    this.reverseSort = true;
    this.pageIndex = 0;
    this.showFilters = false;
    this.loadData();
  }

  /** Chỉ xoá các tiêu chí trong panel, giữ từ khoá đang tìm và sắp xếp. */
  resetFilters(): void {
    const name = this.criteria.name;
    this.criteria = { ...this.emptyCriteria(), name };
    this.draft = { ...this.criteria };
    this.pageIndex = 0;
    this.loadData();
  }

  /**
   * Chức năng: Đổi tiêu chí sắp xếp. Bấm lại đúng tiêu chí đang chọn thì đảo
   *   chiều tăng/giảm. Không có trạng thái "tắt sắp xếp": danh sách luôn phải có
   *   một thứ tự xác định, bỏ hết thì quay về `defaultSort`.
   * Yêu cầu: `value` — một giá trị của `MangaSortBy`.
   * Kết quả trả về: không (tải lại từ trang 1).
   * Exception: không ném.
   */
  setSort(value: string): void {
    if (this.sortBy === value) {
      this.reverseSort = !this.reverseSort;
    } else {
      this.sortBy = value;
      this.reverseSort = true;
    }
    this.pageIndex = 0;
    this.loadData();
  }

  goCreate(): void {
    this.router.navigate(['/admin/manga/create']);
  }

  goEdit(manga: any): void {
    if (!this.perm.canEditManga(manga)) {
      this.toastr.warning('Bạn không có quyền chỉnh sửa truyện này');
      return;
    }
    this.router.navigate(['/admin/manga/edit', manga.id]);
  }

  goChapters(manga: any): void {
    if (!this.perm.canEditManga(manga)) {
      this.toastr.warning('Bạn không có quyền quản lý chương này');
      return;
    }
    this.router.navigate(['/admin/manga', manga.id, 'chapters']);
  }

  goAnalytics(manga: any): void {
    this.router.navigate(['/admin/manga', manga.id, 'analytics']);
  }

  /**
   * Chức năng: Mở trang thông tin người đăng truyện.
   * Yêu cầu: `event` — click event, phải chặn để không kích hoạt chọn dòng;
   *   `manga` — dòng đang bấm, cần `ownerId`.
   * Kết quả trả về: không (điều hướng); không làm gì nếu truyện chưa có chủ.
   * Exception: không ném.
   */
  goOwner(event: Event, manga: any): void {
    event.preventDefault();
    event.stopPropagation();
    if (!manga?.ownerId) return;
    this.router.navigate(['/admin/users', manga.ownerId]);
  }

  /**
   * Chức năng: Nhận diện truyện đang bị ẩn.
   * Yêu cầu: `manga` — một dòng trong bảng. `AdminMangaDto` đặt tên field là
   *   `mode`, còn `UpdateMangaCommand` nhận `DisplayMode` — chấp nhận cả hai, và
   *   cả dạng số (enum index) lẫn dạng tên.
   * Kết quả trả về: true nếu đang ẩn (Hidden = 0).
   * Exception: không ném.
   */
  isHidden(manga: any): boolean {
    const v = manga?.mode ?? manga?.displayMode;
    return v === 0 || v === '0' || String(v) === DisplayMode.Hidden;
  }

  /**
   * Chức năng: Ẩn / hiện truyện — gọi `manga/update` với đúng field `DisplayMode`.
   *   Trước đây dùng `manga/update-status` và nhét 'Hidden' vào `status`, tức là
   *   trộn hai khái niệm khác nhau: `status` là tình trạng ra chương (đang ra /
   *   hoàn thành), còn ẩn/hiện giờ là `displayMode` riêng.
   * Yêu cầu: `manga` — dòng đang thao tác.
   * Kết quả trả về: không (cập nhật `displayMode` tại chỗ khi API trả về OK).
   * Exception: không ném — lỗi thì hiện toast, dữ liệu trên bảng giữ nguyên.
   */
  toggleVisibility(manga: any): void {
    const next = this.isHidden(manga) ? DisplayMode.Visible : DisplayMode.Hidden;
    this.mangaService.updateDisplayMode(manga, next).subscribe({
      next: () => {
        manga.mode = next;
        manga.displayMode = next;
        this.toastr.success(`Đã ${next === DisplayMode.Hidden ? 'ẩn' : 'hiện'} truyện`);
      },
      error: () => this.toastr.error('Không thể cập nhật hiển thị')
    });
  }

  /** Nhãn chế độ hiển thị cho cột trạng thái. */
  getDisplayModeLabel(manga: any): string {
    const v = String(manga?.mode ?? manga?.displayMode ?? '');
    if (v === '2' || v === DisplayMode.Disabled) return 'Đã khoá';
    return this.isHidden(manga) ? 'Đã ẩn' : 'Đang hiện';
  }

  deleteManga(manga: any): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '360px',
      data: {
        title: 'Xóa truyện',
        message: `Bạn có chắc muốn xóa "${manga.name}"? Hành động này không thể hoàn tác.`,
        confirmText: 'Xóa',
        danger: true
      }
    });

    ref.afterClosed().subscribe(confirmed => {
      if (!confirmed) return;
      this.mangaService.delete(manga.id).subscribe({
        next: () => {
          this.toastr.success('Đã xóa truyện');
          this.loadData();
        },
        error: () => this.toastr.error('Không thể xóa truyện')
      });
    });
  }

  /**
   * Chức năng: Class màu cho badge trạng thái.
   * Yêu cầu: `status` — enum số backend hoặc nhãn chuỗi cũ.
   * Kết quả trả về: tên class BEM `status-badge--*`; '' nếu không nhận ra.
   * Exception: không ném.
   */
  getStatusClass(status: any): string {
    const map: Record<string, string> = {
      // Enum số backend: Active=1, Paused=2, Finished=3
      '1': 'status-badge--ongoing', '2': 'status-badge--hiatus', '3': 'status-badge--completed',
      // Nhãn chuỗi cũ (tương thích)
      'Ongoing': 'status-badge--ongoing', 'Completed': 'status-badge--completed',
      'Hiatus': 'status-badge--hiatus',
    };
    return map[String(status)] ?? '';
  }

  getStatusLabel(status: any): string {
    const map: Record<string, string> = {
      '1': 'Đang ra', '2': 'Tạm dừng', '3': 'Hoàn thành',
      'Ongoing': 'Đang ra', 'Completed': 'Hoàn thành', 'Hiatus': 'Tạm dừng',
    };
    return map[String(status)] ?? String(status ?? '—');
  }

  /** MangaType backend: Oneshot=1, Ova=2, Dojinshi=3, Series=4. */
  getTypeLabel(type: any): string {
    const map: Record<string, string> = {
      '1': 'Oneshot', '2': 'OVA', '3': 'Dojinshi', '4': 'Series',
    };
    return map[String(type)] ?? String(type ?? '—');
  }

  get pageTitle(): string {
    if (this.perm.isOwnMangaOnly()) return 'Truyện của tôi';
    return 'Quản lý Truyện';
  }
}
