import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { Subject, firstValueFrom, takeUntil } from 'rxjs';
import {
  ChapterImageService, ChapterImageMeta, CreateChapterImageItem,
} from '../../services/chapter-image.service';
import { ImageUploadService } from '../../services/image-upload.service';
import { AdminMangaService } from '../../services/admin-manga.service';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';

/**
 * ⚠️ MODULE MỚI THÊM — xem `docs/ADMIN_MODULES_ADDED.md`.
 *
 * Quản lý ảnh của một chương — thay cho luồng "sửa chương" cũ (chỉ sửa được
 * title/index, không xem/sửa được ảnh).
 *
 * Luồng:
 *  1. Gọi API lấy **URL + metadata** của toàn bộ ảnh (không tải ảnh).
 *  2. Translator chọn số ảnh muốn tải (1 / 5 / tất cả / số tuỳ ý) → chỉ những
 *     ảnh đó được gán `src` nên mới thực sự tải từ S3. Cuối danh sách có nút tải
 *     thêm nếu còn ảnh.
 *  3. Mỗi ảnh: Xoá · Thay thế · Đảo vị trí · Sửa ảnh (mở panel canvas).
 *  4. Mỗi ảnh có Lưu/Huỷ riêng; dưới cùng có Lưu tất cả / Huỷ tất cả.
 */

/** Một ảnh kèm trạng thái đang chỉnh sửa ở client. */
interface ImageItem {
  meta: ChapterImageMeta;
  /** Đã cho phép tải từ S3 chưa (gán src cho <img>). */
  loaded: boolean;
  /** Ảnh mới thay thế (từ file hoặc từ editor) — chưa lưu. */
  pendingBlob: Blob | null;
  /** objectURL để preview `pendingBlob`. */
  pendingPreview: string | null;
  /** Đánh dấu xoá, chờ lưu. */
  markedDelete: boolean;
  /** Vị trí đã bị đổi so với ban đầu. */
  movedFrom: number | null;
  saving: boolean;
  /** Ảnh MỚI thêm, chưa tồn tại trên server (meta.id rỗng). */
  isNew: boolean;
  /** Trang thai upload rieng cua anh nay (de bao thanh cong/that bai + retry). */
  uploadStatus: UploadStatus;
  /** Ly do that bai, hien duoi anh. */
  uploadError: string;
  /** % upload lên S3 (chỉ có ý nghĩa khi đang lưu ảnh mới). */
  uploadPercent: number;
}

type BatchChoice = '1' | '5' | 'all' | 'custom';

/** Trang thai upload cua tung anh. */
type UploadStatus = 'idle' | 'uploading' | 'success' | 'failed';

@Component({
  selector: 'app-chapter-images',
  templateUrl: './chapter-images.component.html',
  styleUrls: ['./chapter-images.component.scss'],
})
export class ChapterImagesComponent implements OnInit, OnDestroy {
  chapterId = '';
  mangaId = '';
  chapterLabel = '';

  // ── Thông tin chương (gộp phần "sửa chương" vào đây, khỏi phải mở dialog riêng)
  chapterTitle = '';
  chapterIndex: number | null = null;
  /** Chương phụ — chương 10.5 là `chapterIndex = 10`, `chapterSubIndex = 5`. */
  chapterSubIndex = 0;
  private originalTitle = '';
  private originalIndex: number | null = null;
  private originalSubIndex = 0;
  savingInfo = false;

  isLoading = false;
  items: ImageItem[] = [];

  // ── Tải theo lô ────────────────────────────────────────────────────────────
  batch: BatchChoice = '5';
  customBatch = 10;
  /** Số ảnh đã cho phép tải (đầu danh sách). */
  loadedCount = 0;

  // ── Thông tin chương ───────────────────────────────────────────────────────

  /**
   * Chức năng: Cho biết title/index của chương đã bị sửa so với lúc mở trang,
   *   để hiện nút Lưu và tránh gọi API vô ích.
   * Yêu cầu: không.
   * Kết quả trả về: `true` nếu có thay đổi.
   * Exception: không ném.
   */
  get infoDirty(): boolean {
    return this.chapterTitle !== this.originalTitle
      || this.chapterIndex !== this.originalIndex
      || this.chapterSubIndex !== this.originalSubIndex;
  }

  /** Nhãn chương ghép index + subIndex — "10" hoặc "10.5". */
  get chapterNumberLabel(): string {
    return this.chapterSubIndex > 0 ? `${this.chapterIndex}.${this.chapterSubIndex}` : `${this.chapterIndex}`;
  }

  /**
   * Chức năng: Lưu title + index của chương (gộp chức năng "sửa chương" vào trang
   *   quản lý ảnh, không phải mở dialog riêng nữa).
   * Yêu cầu: `chapterTitle` không rỗng; `chapterIndex` là số ≥ 0.
   * Kết quả trả về: không (cập nhật `originalTitle/originalIndex` khi thành công).
   * Exception: không ném — lỗi hiện toast, giữ nguyên giá trị đang sửa.
   */
  saveChapterInfo(): void {
    const title = this.chapterTitle.trim();
    if (this.chapterIndex == null || Number.isNaN(this.chapterIndex)) {
      this.toastr.warning('Nhập số chương'); return;
    }

    this.savingInfo = true;
    this.adminManga.updateChapter({
      chapterId: this.chapterId,
      mangaId: this.mangaId,
      index: this.chapterIndex,
      subIndex: this.chapterSubIndex ?? 0,
      title,
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.savingInfo = false;
        this.originalTitle = title;
        this.originalIndex = this.chapterIndex;
        this.originalSubIndex = this.chapterSubIndex;
        this.chapterTitle = title;
        this.chapterLabel = `Chương ${this.chapterNumberLabel}`;
        this.toastr.success('Đã lưu thông tin chương');
      },
      error: () => {
        this.savingInfo = false;
        this.toastr.error('Lưu thông tin chương thất bại');
      },
    });
  }

  // ── Thêm ảnh ───────────────────────────────────────────────────────────────

  /**
   * Chức năng: Tính index cho ảnh CHÈN GIỮA hai trang. Server dùng `decimal` với
   *   2 chữ số thập phân nên chèn giữa chỉ cần lấy trung điểm, KHÔNG phải đánh số
   *   lại cả chương.
   * Yêu cầu: `prev` là index trang trước; `next` là index trang sau, hoặc null
   *   khi chèn vào cuối danh sách.
   * Kết quả trả về: index mới (làm tròn 2 chữ số), hoặc `null` nếu khe giữa 2
   *   trang đã hết chỗ ở độ chính xác 2 số.
   * Exception: không ném — trả `null` để caller báo lỗi cho người dùng.
   */
  private midIndex(prev: number, next: number | null): number | null {
    if (next == null) return Math.round((prev + 1) * 100) / 100;
    const mid = Math.round(((prev + next) / 2) * 100) / 100;
    // Hết khe: 2 chữ số thập phân không đủ để nằm giữa prev và next.
    if (mid <= prev || mid >= next) return null;
    return mid;
  }

  /**
   * Chức năng: Tạo ImageItem cho một ảnh MỚI (chưa có trên server) từ file người
   *   dùng chọn, kèm index đã tính sẵn.
   * Yêu cầu: `file` là ảnh; `index` > 0.
   * Kết quả trả về: `ImageItem` với `isNew = true`, `meta.id = ''`.
   * Exception: không ném.
   */
  private makeNewItem(file: File, index: number): ImageItem {
    return {
      meta: {
        id: '',
        index,
        url: '',
        width: undefined,
        height: undefined,
        contentType: file.type,
      },
      loaded: true,
      pendingBlob: file,
      pendingPreview: URL.createObjectURL(file),
      markedDelete: false,
      movedFrom: null,
      saving: false,
      isNew: true,
      uploadStatus: 'idle',
      uploadError: '',
      uploadPercent: 0,
    };
  }

  /**
   * Chức năng: Thêm ảnh vào CUỐI chương (chọn được nhiều file một lượt).
   * Yêu cầu: input file có ít nhất 1 ảnh.
   * Kết quả trả về: không (thêm vào `this.items`).
   * Exception: không ném — file không phải ảnh sẽ bị bỏ qua kèm toast.
   */
  onAddPick(e: Event): void {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    const images = files.filter(f => f.type.startsWith('image/'));
    if (images.length !== files.length) this.toastr.warning('Đã bỏ qua file không phải ảnh');
    if (!images.length) return;

    let last = this.items.length ? Math.max(...this.items.map(i => i.meta.index)) : 0;
    for (const f of images) {
      last = Math.round((last + 1) * 100) / 100;
      this.items.push(this.makeNewItem(f, last));
      this.loadedCount++;
    }
    this.toastr.success(`Đã thêm ${images.length} ảnh — bấm Lưu để upload`);
  }

  /**
   * Chức năng: Chèn ảnh NGAY SAU một trang đang có, dùng index thập phân
   *   (vd chèn giữa trang 3 và 4 → 3.5) nên không xáo trộn số trang còn lại.
   * Yêu cầu: `e` là input file; `afterIdx` là vị trí trong `this.items`.
   * Kết quả trả về: không (chèn vào `this.items` đúng vị trí).
   * Exception: không ném — hết khe index thì báo toast và bỏ qua.
   */
  onInsertPick(e: Event, afterIdx: number): void {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []).filter(f => f.type.startsWith('image/'));
    input.value = '';
    if (!files.length) return;

    const prev = this.items[afterIdx].meta.index;
    const next = this.items[afterIdx + 1]?.meta.index ?? null;

    const created: ImageItem[] = [];
    let cursor = prev;
    for (const f of files) {
      const idx = this.midIndex(cursor, next);
      if (idx == null) {
        this.toastr.error(
          `Hết khe giữa trang ${cursor} và ${next} (chỉ 2 chữ số thập phân) — ` +
          `hãy đánh lại số trang trước khi chèn thêm`,
        );
        break;
      }
      created.push(this.makeNewItem(f, idx));
      cursor = idx;
    }
    if (!created.length) return;

    this.items.splice(afterIdx + 1, 0, ...created);
    this.loadedCount += created.length;
    this.toastr.success(`Đã chèn ${created.length} ảnh sau trang ${prev} — bấm Lưu để upload`);
  }

  /**
   * Chức năng: Bỏ một ảnh MỚI khỏi danh sách (chưa upload nên không cần gọi API).
   * Yêu cầu: `item.isNew === true`.
   * Kết quả trả về: không.
   * Exception: không ném.
   */
  removeNewItem(item: ImageItem): void {
    if (item.pendingPreview) URL.revokeObjectURL(item.pendingPreview);
    this.items = this.items.filter(x => x !== item);
    this.loadedCount = Math.max(0, this.loadedCount - 1);
  }

  /**
   * Chức năng: Upload một ảnh MỚI bằng API THẬT `POST /chapter-image/create` —
   *   gửi metadata (1 phần tử) để lấy `uploadUrl`, rồi PUT thẳng file lên S3.
   *   Không có bước confirm: bản ghi ảnh đã được server tạo ngay ở bước đăng ký.
   *
   *   ⚠️ Endpoint này KHÔNG nhận index mong muốn — server tự đánh số (nối vào
   *   cuối chương). Vì vậy ảnh chèn giữa sẽ nhận số khác với vị trí đang thấy;
   *   hàm lấy `index` server trả về làm số THẬT và cảnh báo nếu lệch, thay vì
   *   giả vờ là đã chèn được vào giữa.
   * Yêu cầu: `item.isNew` và `item.pendingBlob` khác null.
   * Kết quả trả về: `Promise<boolean>` — true nếu thành công.
   * Exception: không ném — lỗi set `uploadStatus='failed'`, giữ blob để retry.
   */
  private async uploadNew(item: ImageItem, toast: boolean): Promise<boolean> {
    const blob = item.pendingBlob;
    if (!blob) return false;

    const contentType = blob.type || 'image/png';
    const ext = contentType === 'image/jpeg' ? 'jpg' : contentType === 'image/webp' ? 'webp' : 'png';
    const fileName = `page_${item.meta.index}.${ext}`;
    const wantedIndex = item.meta.index;

    item.saving = true;
    item.uploadStatus = 'uploading';
    item.uploadPercent = 0;
    item.uploadError = '';

    const fail = (msg: string): boolean => {
      item.saving = false;
      item.uploadStatus = 'failed';
      item.uploadPercent = 0;
      item.uploadError = msg;
      if (toast) this.toastr.error(`Trang ${wantedIndex}: ${msg}`);
      return false;
    };

    const file = new File([blob], fileName, { type: contentType });

    let created: CreateChapterImageItem;
    try {
      const list = await firstValueFrom(
        this.imageService.createChapterImages(this.chapterId, [file]),
      );
      if (!list.length || !list[0].uploadUrl) return fail('server không trả về URL upload');
      created = list[0];
    } catch {
      return fail('không đăng ký được ảnh với server');
    }

    try {
      await firstValueFrom(
        this.imageUpload.uploadToS3(created.uploadUrl, file, p => item.uploadPercent = p),
      );
    } catch {
      return fail('upload lên S3 thất bại');
    }

    // Nhận id + index THẬT từ server.
    item.meta.id = created.id;
    item.meta.index = created.index;
    item.saving = false;
    item.uploadPercent = 100;
    item.uploadStatus = 'success';

    if (toast) {
      if (created.index !== wantedIndex) {
        this.toastr.warning(
          `Ảnh đã lên nhưng server đánh là trang ${created.index} (API thêm ảnh chỉ nối vào cuối chương)`,
        );
      } else {
        this.toastr.success(`Trang ${created.index}: đã thêm ảnh`);
      }
    }
    return true;
  }

  // ── Editor sidebar ─────────────────────────────────────────────────────────
  editingIndex: number | null = null;

  /**
   * So anh upload song song toi da. Trang manhwa rat nang nen khong ban het mot
   * luot; 3 la muc can bang giua toc do va on dinh duong truyen.
   */
  private static readonly UPLOAD_CONCURRENCY = 3;

  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private imageService: ChapterImageService,
    private imageUpload: ImageUploadService,
    private adminManga: AdminMangaService,
    private dialog: MatDialog,
    private toastr: ToastrService,
  ) {}

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(pm => {
      this.chapterId = pm.get('chapterId') ?? '';
      if (this.chapterId) this.load();
    });
    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe(qp => {
      this.mangaId = qp.get('mangaId') ?? '';
      const idx = qp.get('index');
      const sub = qp.get('subIndex');
      this.chapterIndex = idx != null && idx !== '' ? Number(idx) : null;
      this.chapterSubIndex = sub != null && sub !== '' ? Number(sub) : 0;
      this.chapterLabel = idx ? `Chương ${this.chapterNumberLabel}` : '';
      this.chapterTitle = qp.get('title') ?? '';
      this.originalTitle = this.chapterTitle;
      this.originalIndex = this.chapterIndex;
      this.originalSubIndex = this.chapterSubIndex;
    });
  }

  ngOnDestroy(): void {
    this.items.forEach(i => { if (i.pendingPreview) URL.revokeObjectURL(i.pendingPreview); });
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Nạp danh sách ──────────────────────────────────────────────────────────

  load(): void {
    this.isLoading = true;
    this.imageService.getImages(this.chapterId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(metas => {
        this.items = metas.map(m => ({
          meta: m,
          loaded: false,
          pendingBlob: null,
          pendingPreview: null,
          markedDelete: false,
          movedFrom: null,
          saving: false,
          isNew: false,
          uploadStatus: 'idle',
          uploadError: '',
          uploadPercent: 0,
        }));
        this.loadedCount = 0;
        this.isLoading = false;
        // Tải sẵn lô đầu theo lựa chọn hiện tại.
        this.loadMore();
      });
  }

  /** Số ảnh mỗi lần tải theo lựa chọn. */
  private get batchSize(): number {
    if (this.batch === 'all') return this.items.length;
    if (this.batch === 'custom') return Math.max(1, Math.floor(this.customBatch) || 1);
    return Number(this.batch);
  }

  get remaining(): number { return Math.max(0, this.items.length - this.loadedCount); }
  get hasMore(): boolean { return this.remaining > 0; }

  /** Cho phép tải thêm 1 lô ảnh (mới thực sự gọi S3 qua thẻ <img>). */
  loadMore(): void {
    const next = Math.min(this.items.length, this.loadedCount + this.batchSize);
    for (let i = this.loadedCount; i < next; i++) this.items[i].loaded = true;
    this.loadedCount = next;
  }

  loadAll(): void {
    this.items.forEach(i => i.loaded = true);
    this.loadedCount = this.items.length;
  }

  /** URL để hiển thị: ưu tiên ảnh đang sửa chưa lưu. */
  srcOf(item: ImageItem): string {
    return item.pendingPreview || item.meta.url;
  }

  // ── Thao tác từng ảnh ──────────────────────────────────────────────────────

  askDelete(item: ImageItem, i: number): void {
    this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Xoá ảnh này?',
        message: `Ảnh trang ${item.meta.index} sẽ bị đánh dấu xoá. Bấm Lưu để áp dụng.`,
        confirmText: 'Đánh dấu xoá',
        icon: 'delete_outline',
      },
    }).afterClosed().subscribe(ok => {
      if (ok) { item.markedDelete = true; }
    });
  }

  undoDelete(item: ImageItem): void { item.markedDelete = false; }

  onReplacePick(e: Event, item: ImageItem): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { this.toastr.error('Chỉ nhận file ảnh'); return; }
    this.setPending(item, file);
  }

  /** Gán ảnh mới (từ file hoặc từ editor) vào trạng thái chờ lưu. */
  private setPending(item: ImageItem, blob: Blob): void {
    if (item.pendingPreview) URL.revokeObjectURL(item.pendingPreview);
    item.pendingBlob = blob;
    item.pendingPreview = URL.createObjectURL(blob);
    item.loaded = true;
  }

  moveUp(i: number): void {
    if (i === 0) return;
    this.swap(i, i - 1);
  }

  moveDown(i: number): void {
    if (i >= this.items.length - 1) return;
    this.swap(i, i + 1);
  }

  /**
   * Đảo vị trí 2 ảnh. Chỉ đổi `index` (và thứ tự trong mảng) — theo yêu cầu thì
   * "đảo signed url là đủ", nên không cần tải lại ảnh.
   */
  private swap(a: number, b: number): void {
    const A = this.items[a], B = this.items[b];
    if (A.movedFrom === null) A.movedFrom = A.meta.index;
    if (B.movedFrom === null) B.movedFrom = B.meta.index;
    const tmp = A.meta.index;
    A.meta.index = B.meta.index;
    B.meta.index = tmp;
    this.items[a] = B;
    this.items[b] = A;
    // Ảnh bị đẩy lên vùng đã tải thì cho tải luôn, tránh ô trống.
    if (a < this.loadedCount) this.items[a].loaded = true;
    if (b < this.loadedCount) this.items[b].loaded = true;
  }

  // ── Editor sidebar ─────────────────────────────────────────────────────────

  openEditor(i: number): void {
    const item = this.items[i];
    if (!item.loaded) { item.loaded = true; }
    this.editingIndex = i;
  }

  closeEditor(): void { this.editingIndex = null; }

  get editingItem(): ImageItem | null {
    return this.editingIndex === null ? null : this.items[this.editingIndex] ?? null;
  }

  /** Editor trả về ảnh đã sửa → đưa vào trạng thái chờ lưu. */
  onEdited(blob: Blob): void {
    const item = this.editingItem;
    if (!item) return;
    this.setPending(item, blob);
    this.toastr.success('Đã áp dụng vào ảnh — nhớ bấm Lưu');
    this.editingIndex = null;
  }

  // ── Trạng thái thay đổi ────────────────────────────────────────────────────

  isDirty(item: ImageItem): boolean {
    return !!item.pendingBlob || item.markedDelete || item.movedFrom !== null;
  }

  get dirtyCount(): number { return this.items.filter(i => this.isDirty(i)).length; }
  get hasAnyDirty(): boolean { return this.dirtyCount > 0; }

  /** So anh dang upload / da that bai — dung cho thanh tong ket duoi cung. */
  get uploadingCount(): number { return this.items.filter(i => i.uploadStatus === 'uploading').length; }
  get failedCount(): number { return this.items.filter(i => i.uploadStatus === 'failed').length; }
  get successCount(): number { return this.items.filter(i => i.uploadStatus === 'success').length; }
  get hasFailed(): boolean { return this.failedCount > 0; }

  // ── Lưu / huỷ ──────────────────────────────────────────────────────────────

  cancelItem(item: ImageItem): void {
    if (item.pendingPreview) URL.revokeObjectURL(item.pendingPreview);
    item.pendingBlob = null;
    item.pendingPreview = null;
    item.markedDelete = false;
    item.uploadStatus = 'idle';
    item.uploadError = '';
    item.uploadPercent = 0;
    // Vị trí đã đảo: cần nạp lại danh sách mới trả về đúng thứ tự gốc.
    if (item.movedFrom !== null) {
      item.movedFrom = null;
      this.toastr.info('Thứ tự đã đổi — tải lại danh sách để về thứ tự gốc');
    }
  }

  cancelAll(): void {
    this.items.forEach(i => {
      if (i.pendingPreview) URL.revokeObjectURL(i.pendingPreview);
      i.pendingBlob = null;
      i.pendingPreview = null;
      i.markedDelete = false;
      i.movedFrom = null;
      i.uploadStatus = 'idle';
      i.uploadError = '';
      i.uploadPercent = 0;
    });
    this.load();
    this.toastr.info('Đã huỷ toàn bộ thay đổi');
  }

  /**
   * Chức năng: Lưu thay đổi của MỘT ảnh (xoá / thay nội dung / cập nhật thứ tự).
   *   Chỉ xử lý đúng loại thay đổi ảnh đó đang có, không đụng ảnh khác.
   * Yêu cầu: `item` thuộc `this.items` và đang có thay đổi (`isDirty`).
   * Kết quả trả về: không (cập nhật `item.uploadStatus` / `this.items` tại chỗ).
   * Exception: không ném — lỗi chuyển thành `uploadStatus = 'failed'` kèm toast,
   *   và ảnh vẫn GIỮ `pendingBlob` để bấm "Thử lại".
   */
  saveItem(item: ImageItem): void {
    if (!this.isDirty(item)) { this.toastr.info('Ảnh này không có thay đổi'); return; }

    // Ảnh mới chưa lên server nên xoá là bỏ khỏi danh sách, không gọi API.
    if (item.markedDelete) {
      if (item.isNew) { this.removeNewItem(item); return; }
      this.deleteOne(item);
      return;
    }
    if (item.pendingBlob) {
      // Ảnh mới đi luồng add-image, ảnh cũ đi luồng replace-image.
      void (item.isNew ? this.uploadNew(item, true) : this.uploadOne(item, true));
      return;
    }

    // Chỉ đổi thứ tự → gửi toàn bộ order (API nhận cả danh sách).
    item.saving = true;
    this.saveOrder(() => { item.movedFrom = null; item.saving = false; });
  }

  /**
   * Chức năng: Xoá hẳn một ảnh khỏi chương (ảnh đã đánh dấu `markedDelete`).
   * Yêu cầu: `item.markedDelete === true`.
   * Kết quả trả về: không (bỏ item khỏi `this.items` nếu server xoá thật).
   * Exception: không ném — API lỗi thì `deleteImage` trả `mocked: true`, item
   *   được giữ lại để không mất dấu thay đổi.
   */
  private deleteOne(item: ImageItem): void {
    item.saving = true;
    this.imageService.deleteImage(this.chapterId, item.meta.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe(r => {
        item.saving = false;
        if (r.mocked) {
          this.toastr.warning(`Trang ${item.meta.index}: chưa có API xoá ảnh — chỉ đánh dấu ở client`);
        } else {
          this.items = this.items.filter(x => x !== item);
          this.toastr.success(`Đã xoá trang ${item.meta.index}`);
        }
      });
  }

  /**
   * Chức năng: Thay nội dung MỘT ảnh theo đúng luồng backend
   *   (**cập nhật ảnh = xoá cũ + upload mới**):
   *     1. `requestReplaceUrl()` → server XOÁ ảnh cũ, trả `{fileId, signedUrl}`
   *     2. client `PUT` bytes **trực tiếp lên S3** bằng signed URL
   *     3. `confirmBatchUploads()` khi xong, `failUploads()` khi lỗi
   *   Server chỉ chuyển bản ghi sang trạng thái `failed` (KHÔNG xoá hẳn), nên
   *   "Thử lại" chạy lại nguyên luồng với cùng `pendingBlob` là được.
   * Yêu cầu: `item.pendingBlob !== null`; `toast` = true khi muốn hiện toast cho
   *   riêng ảnh này (lưu hàng loạt truyền false để chỉ báo tổng kết một lần).
   * Kết quả trả về: `Promise<boolean>` — true nếu upload + confirm thành công.
   * Exception: không ném — mọi lỗi resolve `false`, set `uploadStatus='failed'` +
   *   `uploadError`, và GIỮ `pendingBlob` cho retry.
   */
  private async uploadOne(item: ImageItem, toast: boolean): Promise<boolean> {
    const blob = item.pendingBlob;
    if (!blob) return false;

    const contentType = blob.type || 'image/png';
    const ext = contentType === 'image/jpeg' ? 'jpg' : contentType === 'image/webp' ? 'webp' : 'png';
    const fileName = `page_${item.meta.index}.${ext}`;

    item.saving = true;
    item.uploadStatus = 'uploading';
    item.uploadPercent = 0;
    item.uploadError = '';

    const fail = (msg: string): boolean => {
      item.saving = false;
      item.uploadStatus = 'failed';
      item.uploadPercent = 0;
      item.uploadError = msg;
      if (toast) this.toastr.error(`Trang ${item.meta.index}: ${msg}`);
      return false;
    };

    let signed: { fileId: string; signedUrl: string; mocked: boolean };
    try {
      // Bước 1 — server xoá ảnh cũ và cấp signed URL.
      signed = await firstValueFrom(this.imageService.requestReplaceUrl({
        chapterId: this.chapterId,
        imageId: item.meta.id,
        fileName,
        contentType,
        fileSize: blob.size,
      }));
    } catch {
      return fail('không xin được signed URL');
    }

    // Bước 2 — PUT thẳng lên S3. uploadToS3 nhận File nên bọc Blob lại.
    const file = new File([blob], fileName, { type: contentType });
    let etag: string;
    try {
      etag = await firstValueFrom(
        this.imageUpload.uploadToS3(signed.signedUrl, file, p => item.uploadPercent = p),
      );
    } catch {
      // Báo server để bản ghi chuyển sang `failed` (không xoá) → còn retry được.
      await firstValueFrom(this.imageUpload.failUploads([signed.fileId])).catch(() => null);
      return fail('upload lên S3 thất bại');
    }

    // Bước 3 — confirm.
    try {
      await firstValueFrom(this.imageUpload.confirmBatchUploads([
        { fileId: signed.fileId, etag, status: 'uploaded' },
      ]));
    } catch {
      return fail('upload xong nhưng confirm thất bại');
    }

    // Thành công: bỏ ảnh chờ, giải phóng preview.
    if (item.pendingPreview) URL.revokeObjectURL(item.pendingPreview);
    item.pendingBlob = null;
    item.pendingPreview = null;
    item.saving = false;
    item.uploadPercent = 100;
    item.uploadStatus = 'success';
    if (toast) {
      if (signed.mocked) this.toastr.warning(`Trang ${item.meta.index}: chưa có API thay ảnh — mô phỏng thành công`);
      else this.toastr.success(`Trang ${item.meta.index}: đã thay ảnh`);
    }
    return true;
  }

  /**
   * Chức năng: Thử lại upload cho một ảnh đã thất bại, dùng lại đúng
   *   `pendingBlob` cũ nên không phải chọn/sửa ảnh lại.
   * Yêu cầu: `item.uploadStatus === 'failed'` và `pendingBlob` còn giữ.
   * Kết quả trả về: không.
   * Exception: không ném — kết quả phản ánh qua `uploadStatus`.
   */
  retryItem(item: ImageItem): void {
    if (!item.pendingBlob) { this.toastr.warning('Không còn dữ liệu ảnh để thử lại'); return; }
    void this.uploadOne(item, true);
  }

  /**
   * Chức năng: Thử lại toàn bộ ảnh đang ở trạng thái `failed`.
   * Yêu cầu: không.
   * Kết quả trả về: không.
   * Exception: không ném.
   */
  async retryAllFailed(): Promise<void> {
    const failed = this.items.filter(i => i.uploadStatus === 'failed' && i.pendingBlob);
    if (!failed.length) { this.toastr.info('Không có ảnh nào thất bại'); return; }
    const { ok, failed: still } = await this.runUploadQueue(failed);
    if (still > 0) this.toastr.error(`${ok} thành công, ${still} vẫn thất bại`);
    else { this.toastr.success(`Đã thử lại thành công ${ok} ảnh`); this.load(); }
  }

  /**
   * Chức năng: Gửi thứ tự trang mới cho server. CHỈ đổi `index`, không upload lại ảnh.
   * Yêu cầu: `after` là callback tuỳ chọn chạy sau khi API trả về.
   * Kết quả trả về: không.
   * Exception: không ném — API lỗi thì `reorderImages` trả `mocked: true`.
   */
  private saveOrder(after?: () => void): void {
    const order = this.items
      .filter(i => !i.markedDelete)
      .map((i, idx) => ({ imageId: i.meta.id, index: idx + 1 }));
    this.imageService.reorderImages(this.chapterId, order)
      .pipe(takeUntil(this.destroy$))
      .subscribe(r => {
        if (r.mocked) this.toastr.warning('Thứ tự chỉ đổi ở client — chưa có API reorder-image');
        else this.toastr.success('Đã lưu thứ tự');
        after?.();
      });
  }

  /**
   * Chức năng: Upload nhiều ảnh với **giới hạn số việc chạy song song**
   *   (`UPLOAD_CONCURRENCY`). Không bắn tất cả cùng lúc vì trang manhwa rất nặng
   *   — dễ nghẽn mạng và làm progress của từng ảnh nhảy loạn.
   * Yêu cầu: `queue` gồm các ảnh có `pendingBlob`.
   * Kết quả trả về: `Promise<{ ok, failed }>` — số ảnh thành công / thất bại.
   * Exception: không ném — từng ảnh tự xử lý lỗi trong `uploadOne`.
   */
  private async runUploadQueue(queue: ImageItem[]): Promise<{ ok: number; failed: number }> {
    let ok = 0, failed = 0;
    let cursor = 0;

    const worker = async (): Promise<void> => {
      while (cursor < queue.length) {
        const item = queue[cursor++];
        const done = item.isNew
          ? await this.uploadNew(item, false)
          : await this.uploadOne(item, false);
        if (done) ok++; else failed++;
      }
    };

    await Promise.all(
      Array.from(
        { length: Math.min(ChapterImagesComponent.UPLOAD_CONCURRENCY, queue.length) },
        () => worker(),
      ),
    );
    return { ok, failed };
  }

  /**
   * Chức năng: Lưu TẤT CẢ thay đổi — xoá ảnh đã đánh dấu, upload **chỉ những ảnh
   *   thực sự có thay đổi** (`pendingBlob`), rồi cập nhật thứ tự nếu có đảo vị trí.
   *   Kết thúc báo tổng kết thành công/thất bại; ảnh lỗi vẫn giữ dữ liệu để retry.
   * Yêu cầu: có ít nhất một thay đổi (`hasAnyDirty`).
   * Kết quả trả về: `Promise<void>`.
   * Exception: không ném.
   */
  async saveAll(): Promise<void> {
    if (!this.hasAnyDirty) { this.toastr.info('Không có thay đổi nào'); return; }

    const toDelete = this.items.filter(i => i.markedDelete);
    // CHỈ ảnh có thay đổi nội dung mới upload — ảnh không sửa bỏ qua hoàn toàn.
    const toUpload = this.items.filter(i => !i.markedDelete && i.pendingBlob);
    const orderChanged = this.items.some(i => i.movedFrom !== null);

    // 1. Xoá trước, để thứ tự tính lại ở bước 3 không còn ảnh đã bỏ.
    for (const item of toDelete) {
      item.saving = true;
      const r = await firstValueFrom(this.imageService.deleteImage(this.chapterId, item.meta.id))
        .catch(() => ({ mocked: true }));
      item.saving = false;
      if (!r.mocked) this.items = this.items.filter(x => x !== item);
    }

    // 2. Upload ảnh đã sửa — hàng đợi giới hạn song song.
    const { ok, failed } = toUpload.length
      ? await this.runUploadQueue(toUpload)
      : { ok: 0, failed: 0 };

    // 3. Thứ tự (chỉ đổi index, không re-upload).
    if (orderChanged) {
      await firstValueFrom(this.imageService.reorderImages(
        this.chapterId,
        this.items.filter(i => !i.markedDelete).map((i, idx) => ({ imageId: i.meta.id, index: idx + 1 })),
      )).catch(() => null);
      this.items.forEach(i => i.movedFrom = null);
    }

    if (failed > 0) {
      this.toastr.error(`${ok} ảnh thành công, ${failed} ảnh thất bại — dùng "Thử lại" ở ảnh lỗi`);
    } else {
      this.toastr.success(toUpload.length ? `Đã lưu ${ok} ảnh` : 'Đã lưu thay đổi');
      // Chỉ nạp lại khi mọi thứ ổn, tránh xoá mất dữ liệu cần retry.
      this.load();
    }
  }

  goBack(): void {
    if (this.mangaId) this.router.navigate(['/admin/manga', this.mangaId, 'chapters']);
    else this.router.navigate(['/admin/manga']);
  }

  trackByMeta = (_: number, item: ImageItem) => item.meta.id;
}
