import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { ToastrService } from 'ngx-toastr';
import { Subject, takeUntil } from 'rxjs';
import { AdminMangaService, DisplayMode } from '../../services/admin-manga.service';
import { MangaService } from '../../../core/services/manga.service';
import { PermissionService } from '../../../core/services/permission.service';
import { AdminInteractionService, AdminFollow, AdminComment } from '../../services/admin-interaction.service';

/**
 * Trang thông tin một truyện ở khu quản trị — bấm "Chi tiết" ở `/admin/manga`
 * vào đây. Cố ý KHÔNG dẫn thẳng sang form sửa: xem thông tin và sửa là hai ý
 * định khác nhau, gộp lại thì mỗi lần chỉ muốn ngó qua cũng mở form chỉnh sửa.
 *
 * Cùng khuôn với `/admin/users/:id` (user-profile): thanh quay lại + hero +
 * hàng ô thống kê + khối thông tin + hàng nút thao tác.
 */
@Component({
  selector: 'app-manga-info',
  templateUrl: './manga-info.component.html',
  styleUrls: ['./manga-info.component.scss'],
})
export class MangaInfoComponent implements OnInit, OnDestroy {
  mangaId = '';
  manga: any = null;
  loading = true;
  notFound = false;

  /**
   * Thống kê "sống" lấy từ `/manga/status` (lượt xem / theo dõi / số chương).
   * Số bình luận KHÔNG có ở endpoint đó nhưng CÓ trong payload admin
   * (`totalComment`), nên ô bình luận đọc từ `manga` chứ không từ đây.
   */
  stats: { totalViews?: number; totalFollows?: number; totalChapters?: number } | null = null;
  statsLoading = true;

  // ── Hai khối xổ xuống: người theo dõi & bình luận ──────────────────────────
  // Nạp LƯỜI: chỉ gọi API khi người dùng mở khối ra. Trang thông tin mở rất
  // thường xuyên mà hai danh sách này ít khi cần xem, nạp sẵn là phí request.
  followOpen = false;
  follows: AdminFollow[] = [];
  followLoading = false;
  followLoaded = false;
  followTotal = 0;
  followPage = 0;

  commentOpen = false;
  comments: AdminComment[] = [];
  commentLoading = false;
  commentLoaded = false;
  commentTotal = 0;
  commentPage = 0;

  readonly interactionPageSize = 10;

  /**
   * Chiều cao một dòng — PHẢI khớp `min-height` của `.ilist__row` trong SCSS.
   * Sửa bên đó thì sửa cả ở đây, không có cách nào để CSS báo ngược lại TS.
   */
  private readonly FOLLOW_ROW_H = 56;
  private readonly COMMENT_ROW_H = 68;

  /**
   * Chiều cao chừa sẵn cho danh sách, CHỐT theo trang 1. Mở khối luôn tải trang
   * 1 nên số mục của nó là mốc hợp lý nhất: đủ một trang thì chừa một trang, chỉ
   * có 3 mục thì chừa 3 dòng — không để trống hoác. Các trang sau (thường là
   * trang cuối, ít mục hơn) giữ nguyên chiều cao này nên không nhảy.
   * `0` = chưa tải lần nào, chưa chừa gì cả.
   */
  followMinHeight = 0;
  commentMinHeight = 0;

  /**
   * Bộ lọc của hai khối. `mangaId` KHÔNG nằm ở đây — nó luôn bị ghim theo truyện
   * đang mở, người dùng không được đổi. Ngày để dạng chuỗi `yyyy-MM-dd` của
   * `input[type=date]`, gửi lên nguyên vậy (backend nhận DateTimeOffset).
   */
  followFilter = { userId: '', from: '', to: '', reverseSort: true, isDeleted: false };
  commentFilter = { userId: '', chapterId: '', from: '', to: '', reverseSort: true, isDeleted: false };

  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private location: Location,
    private adminManga: AdminMangaService,
    private mangaService: MangaService,
    public perm: PermissionService,
    private interaction: AdminInteractionService,
    private toastr: ToastrService,
  ) {}

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(pm => {
      const id = pm.get('id') ?? '';
      if (id && id !== this.mangaId) {
        this.mangaId = id;
        this.load();
        this.loadStats();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Chức năng: Nạp thông tin truyện qua endpoint admin (có cả truyện đã ẩn/xoá,
   *   khác endpoint công khai).
   * Yêu cầu: `mangaId` đã có.
   * Kết quả trả về: không (gán `manga`, `loading`, `notFound`).
   * Exception: không ném — lỗi hoặc không có dữ liệu thì bật `notFound`.
   */
  private load(): void {
    this.loading = true;
    this.notFound = false;
    this.adminManga.getDetail(this.mangaId).pipe(takeUntil(this.destroy$)).subscribe({
      next: m => {
        // `getDetail()` trả DỮ LIỆU THÔ của AdminMangaDto (displayName /
        // mangaThumbnail / totalView / owner{}), khác hẳn tên field mà
        // `manga-list` chuẩn hoá sau khi map. Phải quy đổi ở đây, không thì
        // bìa, tên và toàn bộ số liệu đều rỗng.
        this.manga = m ? {
          ...m,
          name: m.displayName ?? m.name,
          thumbnail: m.mangaThumbnail ?? m.thumbnail ?? null,
          totalViews: m.totalView ?? m.totalViews ?? 0,
          totalChapters: m.totalChapter ?? m.totalChapters ?? 0,
          totalComments: m.totalComment ?? m.totalComments ?? 0,
          ownerId: m.owner?.id ?? m.ownerId ?? null,
          ownerName: m.owner?.name ?? m.ownerName ?? null,
        } : null;
        this.notFound = !m;
        this.loading = false;
      },
      error: () => {
        this.notFound = true;
        this.loading = false;
      },
    });
  }

  /**
   * Chức năng: Nạp các con số thống kê nhanh cho hàng ô ở đầu trang.
   * Yêu cầu: `mangaId` đã có.
   * Kết quả trả về: không (gán `stats`, `statsLoading`).
   * Exception: không ném — lỗi thì để `stats` null, các ô hiện `—`.
   */
  private loadStats(): void {
    this.statsLoading = true;
    this.mangaService.getMangaStats(this.mangaId).pipe(takeUntil(this.destroy$)).subscribe({
      next: s => { this.stats = s as any; this.statsLoading = false; },
      error: () => { this.stats = null; this.statsLoading = false; },
    });
  }

  /**
   * Chức năng: Quay lại nơi vừa tới, giữ nguyên trang / bộ lọc đang xem ở danh
   *   sách. Dùng `Location.back()` thay vì điều hướng cứng về `/admin/manga` vì
   *   điều hướng cứng sẽ mất hết trạng thái lọc và phân trang.
   * Yêu cầu: không.
   * Kết quả trả về: không.
   * Exception: không ném — vào thẳng bằng URL (không có lịch sử) thì về danh sách.
   */
  goBack(): void {
    if (typeof history !== 'undefined' && history.length > 1) this.location.back();
    else this.router.navigate(['/admin/manga']);
  }

  /**
   * Chức năng: Mở / đóng khối người theo dõi. Lần mở ĐẦU TIÊN mới gọi API.
   * Yêu cầu: `mangaId` đã có.
   * Kết quả trả về: không (đổi `followOpen`, có thể kích hoạt tải).
   * Exception: không ném.
   */
  toggleFollows(): void {
    this.followOpen = !this.followOpen;
    if (this.followOpen && !this.followLoaded) this.loadFollows(0);
  }

  toggleComments(): void {
    this.commentOpen = !this.commentOpen;
    if (this.commentOpen && !this.commentLoaded) this.loadComments(0);
  }

  /**
   * Chức năng: Nạp một trang người theo dõi truyện này.
   * Yêu cầu: `page` đếm từ 0.
   * Kết quả trả về: không (gán `follows`, `followTotal`, `followLoading`).
   * Exception: không ném — lỗi thì để danh sách rỗng, vẫn đánh dấu đã tải để
   *   không tự gọi lại vô hạn.
   */
  loadFollows(page: number): void {
    this.followLoading = true;
    this.followPage = page;
    this.interaction.getFollows({
      mangaId: this.mangaId,          // luôn ghim theo truyện đang mở
      userId: this.followFilter.userId,
      from: this.followFilter.from,
      to: this.followFilter.to,
      reverseSort: this.followFilter.reverseSort,
      isDeleted: this.followFilter.isDeleted,
      pageNo: page + 1,
      pageSize: this.interactionPageSize,
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: r => {
        this.follows = r.data;
        this.followTotal = r.totalCount;
        // Chỉ chốt MỘT lần, ở trang đầu tiên.
        if (!this.followLoaded) {
          this.followMinHeight = this.reserveHeight(r.data.length, this.FOLLOW_ROW_H);
        }
        this.followLoading = false;
        this.followLoaded = true;
      },
      error: () => {
        this.follows = [];
        this.followLoading = false;
        this.followLoaded = true;
      },
    });
  }

  /** Nạp một trang bình luận của truyện này. Cùng quy ước với `loadFollows`. */
  loadComments(page: number): void {
    this.commentLoading = true;
    this.commentPage = page;
    this.interaction.getComments({
      mangaId: this.mangaId,          // luôn ghim theo truyện đang mở
      userId: this.commentFilter.userId,
      chapterId: this.commentFilter.chapterId,
      from: this.commentFilter.from,
      to: this.commentFilter.to,
      reverseSort: this.commentFilter.reverseSort,
      isDeleted: this.commentFilter.isDeleted,
      pageNo: page + 1,
      pageSize: this.interactionPageSize,
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: r => {
        this.comments = r.data;
        this.commentTotal = r.totalCount;
        if (!this.commentLoaded) {
          this.commentMinHeight = this.reserveHeight(r.data.length, this.COMMENT_ROW_H);
        }
        this.commentLoading = false;
        this.commentLoaded = true;
      },
      error: () => {
        this.comments = [];
        this.commentLoading = false;
        this.commentLoaded = true;
      },
    });
  }

  /**
   * Chức năng: Chiều cao cần chừa cho `count` dòng, tính cả đường kẻ giữa các dòng.
   * Yêu cầu: `rowH` khớp `min-height` của dòng trong SCSS.
   * Kết quả trả về: số pixel; 0 khi không có mục nào (để ô "chưa có gì" tự lo).
   * Exception: không ném.
   */
  private reserveHeight(count: number, rowH: number): number {
    if (count <= 0) return 0;
    return count * rowH + (count - 1);   // +1px đường kẻ giữa mỗi cặp dòng
  }

  /** Số dòng khung xương — bằng số dòng đã chốt, chưa chốt thì một trang đầy. */
  get followSkeletonRows(): number {
    return this.followMinHeight ? Math.round(this.followMinHeight / (this.FOLLOW_ROW_H + 1)) : this.interactionPageSize;
  }

  get commentSkeletonRows(): number {
    return this.commentMinHeight ? Math.round(this.commentMinHeight / (this.COMMENT_ROW_H + 1)) : this.interactionPageSize;
  }

  /**
   * Chức năng: Áp bộ lọc — luôn quay về trang 1 vì số trang đổi theo bộ lọc,
   *   đứng ở trang 7 rồi lọc còn 2 trang thì sẽ ra danh sách rỗng.
   * Yêu cầu: không.
   * Kết quả trả về: không (tải lại từ trang đầu).
   * Exception: không ném.
   */
  // Đổi bộ lọc thì số mục có thể khác hẳn → bỏ mốc cũ để chốt lại theo trang 1 mới.
  applyFollowFilter(): void { this.followLoaded = false; this.loadFollows(0); }
  applyCommentFilter(): void { this.commentLoaded = false; this.loadComments(0); }

  resetFollowFilter(): void {
    this.followFilter = { userId: '', from: '', to: '', reverseSort: true, isDeleted: false };
    this.followLoaded = false;
    this.loadFollows(0);
  }

  resetCommentFilter(): void {
    this.commentFilter = { userId: '', chapterId: '', from: '', to: '', reverseSort: true, isDeleted: false };
    this.commentLoaded = false;
    this.loadComments(0);
  }

  get followPages(): number {
    return Math.ceil(this.followTotal / this.interactionPageSize) || 1;
  }

  get commentPages(): number {
    return Math.ceil(this.commentTotal / this.interactionPageSize) || 1;
  }

  /**
   * Chức năng: Báo cáo một bình luận.
   * Yêu cầu: `c.id` hợp lệ.
   * Kết quả trả về: không.
   * Exception: không ném.
   *
   * TODO: chưa có endpoint báo cáo bình luận ở backend (xem mục 4 của CLAUDE.md).
   * Nút để sẵn cho đúng luồng thao tác; khi có API thì thay phần thân bằng lời
   * gọi thật, không phải sửa template.
   */
  reportComment(c: AdminComment): void {
    if (!c?.id) return;
    this.toastr.info('Chức năng báo cáo bình luận chưa có API', 'Chưa khả dụng');
  }

  goUser(userId?: string | null): void {
    if (userId) this.router.navigate(['/admin/users', userId]);
  }

  /** Chữ cái đầu làm ảnh đại diện thay thế — AdminFollowDto không trả avatar. */
  initials(name?: string | null): string {
    const n = (name ?? '').trim();
    if (!n) return '?';
    return n.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  }

  goEdit(): void { this.router.navigate(['/admin/manga/edit', this.mangaId]); }
  goChapters(): void { this.router.navigate(['/admin/manga', this.mangaId, 'chapters']); }
  goAnalytics(): void { this.router.navigate(['/admin/manga', this.mangaId, 'analytics']); }
  goPublic(): void { this.router.navigate(['/manga', this.mangaId]); }

  goOwner(): void {
    if (this.manga?.ownerId) this.router.navigate(['/admin/users', this.manga.ownerId]);
  }

  /**
   * Chức năng: Mở trang thông tin thể loại — cùng kiểu với bấm vào truyện (ra
   *   `manga-info`) hay bấm vào người đăng (ra hồ sơ), chứ không phải lọc danh sách.
   * Yêu cầu: `tag.id` hợp lệ.
   * Kết quả trả về: không (điều hướng).
   * Exception: không ném — thiếu id thì bỏ qua.
   */
  goTag(tag: any): void {
    if (!tag?.id) return;
    this.router.navigate(['/admin/tags', tag.id]);
  }

  /**
   * Ẩn/hiện là `displayMode`, tách khỏi `status` (tình trạng ra chương).
   * API trả field tên `mode` và là SỐ (0 = ẩn), nên phải nhận cả hai dạng —
   * cùng cách `manga-list.isHidden()` đang làm.
   */
  isHidden(): boolean {
    const v = this.manga?.mode ?? this.manga?.displayMode;
    return v === 0 || v === '0' || String(v) === DisplayMode.Hidden;
  }

  getStatusLabel(status: any): string {
    switch (Number(status)) {
      case 1: return 'Đang ra';
      case 2: return 'Tạm dừng';
      case 3: return 'Hoàn thành';
      default: return '—';
    }
  }

  getStatusClass(status: any): string {
    switch (Number(status)) {
      case 1: return 'status-badge--ongoing';
      case 2: return 'status-badge--paused';
      case 3: return 'status-badge--done';
      default: return '';
    }
  }

  getTypeLabel(type: any): string {
    switch (Number(type)) {
      case 1: return 'Oneshot';
      case 2: return 'OVA';
      case 3: return 'Dojinshi';
      case 4: return 'Series';
      default: return '—';
    }
  }

  /**
   * Chức năng: Gộp tên tác giả / hoạ sĩ thành một chuỗi để hiển thị.
   * Yêu cầu: `list` là mảng object có `name`, hoặc null.
   * Kết quả trả về: chuỗi nối bằng dấu phẩy; rỗng nếu không có ai.
   * Exception: không ném.
   */
  names(list: any): string {
    return (list ?? []).map((x: any) => x?.name).filter(Boolean).join(', ');
  }
}
