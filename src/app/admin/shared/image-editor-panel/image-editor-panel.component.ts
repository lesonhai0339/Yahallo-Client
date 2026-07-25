import {
  Component, ElementRef, EventEmitter, HostListener, Input, OnChanges,
  Output, SimpleChanges, ViewChild,
} from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { ImageEditService, Rect, Swatch } from '../../services/image-edit.service';

/**
 * ⚠️ MODULE MỚI THÊM — xem `docs/ADMIN_MODULES_ADDED.md`.
 *
 * Editor ảnh dạng SIDEBAR để nhúng vào trang quản lý ảnh chương. Cùng bộ công cụ
 * với trang `/admin/image-editor` (xoá SFX, ghi chữ, đổi màu, bảng màu lân cận,
 * hút màu) nhưng bỏ phần cắt/xuất file — ở đây kết quả được EMIT ra ngoài qua
 * `(applied)` để trang cha lưu vào ảnh của chương.
 *
 * Toàn bộ tính toán pixel nằm trong ImageEditService (dùng chung, không lặp lại).
 */
@Component({
  selector: 'app-image-editor-panel',
  templateUrl: './image-editor-panel.component.html',
  styleUrls: ['./image-editor-panel.component.scss'],
})
export class ImageEditorPanelComponent implements OnChanges {
  /** URL ảnh cần sửa. Ảnh cross-origin phải có CORS, nếu không canvas bị tainted. */
  @Input() src: string | null = null;
  @Input() label = '';

  /** Người dùng bấm "Áp dụng" → trả blob PNG đã sửa. */
  @Output() applied = new EventEmitter<Blob>();
  @Output() closed = new EventEmitter<void>();

  @ViewChild('cv') cvRef?: ElementRef<HTMLCanvasElement>;

  loading = false;
  loadError = '';
  /** Canvas bị tainted (ảnh cross-origin không có CORS) → tắt công cụ màu. */
  tainted = false;

  imgW = 0;
  imgH = 0;
  zoom = 1;
  dirty = false;

  tool: 'select' | 'pick' = 'select';
  sel: Rect | null = null;
  private dragStart: { x: number; y: number } | null = null;
  isDragging = false;

  fillColor = '#ffffff';
  targetColor = '#000000';
  tolerance = 48;
  palette: Swatch[] = [];

  text = '';
  fontSize = 22;
  fontFamily = 'Arial';
  readonly fontOptions = ['Arial', 'Tahoma', 'Verdana', 'Georgia', 'Comic Sans MS', 'Times New Roman'];
  textColor = '#000000';
  bold = true;
  italic = false;
  align: CanvasTextAlign = 'center';
  strokeColor = '#ffffff';
  strokeWidth = 0;
  clearBeforeText = true;

  private undoStack: ImageData[] = [];
  private redoStack: ImageData[] = [];
  private static readonly HISTORY_BUDGET_BYTES = 192 * 1024 * 1024;

  constructor(private edit: ImageEditService, private toastr: ToastrService) {}

  ngOnChanges(ch: SimpleChanges): void {
    if (ch['src'] && this.src) this.load(this.src);
  }

  private get ctx(): CanvasRenderingContext2D {
    return this.cvRef!.nativeElement.getContext('2d', { willReadFrequently: true })!;
  }

  // ── Nạp ảnh ────────────────────────────────────────────────────────────────

  /**
   * Nạp ảnh vào canvas theo đường `fetch → Blob → objectURL`, KHÔNG dùng
   * `img.crossOrigin` trực tiếp. Lý do:
   *
   *  1. **Tránh cache "bẩn"**: nếu ảnh đã được trang đọc truyện tải trước đó bằng
   *     request KHÔNG CORS, browser cache lại response thiếu header CORS. Lần sau
   *     `img.crossOrigin='anonymous'` có thể ăn đúng cache đó → canvas vẫn bị
   *     tainted dù S3 đã cấu hình CORS đúng.
   *  2. **Không phá signature**: không thể chèn query cache-buster vào presigned
   *     URL (SigV4 ký cả query string → thêm param là hỏng chữ ký).
   *  3. `blob:` URL là same-origin nên vẽ lên canvas **không bao giờ taint**.
   *
   * Nếu `fetch` thất bại (CORS/mạng) thì fallback về cách nạp trực tiếp.
   */
  private load(url: string): void {
    this.loading = true;
    this.loadError = '';
    this.tainted = false;
    this.dirty = false;
    this.sel = null;
    this.palette = [];
    this.undoStack = [];
    this.redoStack = [];

    fetch(url, { mode: 'cors', credentials: 'omit', cache: 'reload' })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then(blob => this.drawFromBlobUrl(URL.createObjectURL(blob), true))
      .catch(() => this.drawFromBlobUrl(url, false));
  }

  /**
   * Vẽ ảnh từ một URL đã sẵn sàng. `isObjectUrl` = true khi là `blob:` (cần
   * revoke sau khi vẽ, và chắc chắn không taint).
   */
  private drawFromBlobUrl(url: string, isObjectUrl: boolean): void {
    const img = new Image();
    // Chỉ cần crossOrigin ở nhánh fallback (khi fetch fail) — blob: không cần.
    if (!isObjectUrl) img.crossOrigin = 'anonymous';

    img.onload = () => {
      this.imgW = img.naturalWidth;
      this.imgH = img.naturalHeight;
      this.loading = false;
      setTimeout(() => {
        const cv = this.cvRef?.nativeElement;
        if (!cv) { if (isObjectUrl) URL.revokeObjectURL(url); return; }
        cv.width = this.imgW;
        cv.height = this.imgH;
        this.ctx.drawImage(img, 0, 0);
        this.probeTaint();
        this.fitZoom();
        if (isObjectUrl) URL.revokeObjectURL(url);
      });
    };
    img.onerror = () => {
      this.loading = false;
      if (isObjectUrl) URL.revokeObjectURL(url);
      this.loadError = 'Không tải được ảnh. Kiểm tra CORS của bucket S3 và origin đang chạy.';
    };
    img.src = url;
  }

  /** Thử đọc 1 pixel để biết canvas có bị tainted không. */
  private probeTaint(): void {
    try {
      this.ctx.getImageData(0, 0, 1, 1);
      this.tainted = false;
    } catch {
      this.tainted = true;
      this.loadError = 'Ảnh không cho phép đọc pixel (thiếu CORS) — chỉ xem, không sửa được.';
    }
  }

  fitZoom(): void {
    const host = this.cvRef?.nativeElement?.parentElement?.parentElement;
    const avail = (host?.clientWidth ?? 520) - 20;
    this.zoom = this.imgW > avail ? +(avail / this.imgW).toFixed(3) : 1;
  }

  setZoom(z: number): void { this.zoom = Math.min(4, Math.max(0.05, +z.toFixed(3))); }

  // ── Vùng chọn ──────────────────────────────────────────────────────────────

  /**
   * Chức năng: Đổi toạ độ màn hình (chuột/ngón tay) sang toạ độ ảnh gốc, bù zoom.
   * Yêu cầu: canvas đã render; `clientX/clientY` từ MouseEvent hoặc Touch.
   * Kết quả trả về: `{x, y}` theo pixel ảnh gốc.
   * Exception: không ném.
   */
  private toImageCoords(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.cvRef!.nativeElement.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(this.imgW, (clientX - r.left) / this.zoom)),
      y: Math.max(0, Math.min(this.imgH, (clientY - r.top) / this.zoom)),
    };
  }

  /**
   * Chức năng: Bắt đầu hút màu hoặc kéo chọn vùng. Dùng chung chuột + cảm ứng.
   * Yêu cầu: ảnh đã nạp và không bị tainted.
   * Kết quả trả về: không.
   * Exception: không ném.
   */
  private beginPointer(clientX: number, clientY: number): void {
    if (this.tainted || !this.imgW) return;
    const p = this.toImageCoords(clientX, clientY);
    if (this.tool === 'pick') {
      this.fillColor = this.edit.rgbToHex(this.edit.sampleColor(this.ctx, p.x, p.y));
      this.textColor = this.fillColor;
      return;
    }
    this.dragStart = p;
    this.isDragging = true;
    this.sel = { x: p.x, y: p.y, w: 0, h: 0 };
  }

  /**
   * Chức năng: Cập nhật khung chọn khi đang kéo.
   * Yêu cầu: đang kéo (`isDragging` + `dragStart`).
   * Kết quả trả về: không (cập nhật `this.sel`).
   * Exception: không ném.
   */
  private movePointer(clientX: number, clientY: number): void {
    if (!this.isDragging || !this.dragStart) return;
    const p = this.toImageCoords(clientX, clientY);
    this.sel = {
      x: Math.min(this.dragStart.x, p.x),
      y: Math.min(this.dragStart.y, p.y),
      w: Math.abs(p.x - this.dragStart.x),
      h: Math.abs(p.y - this.dragStart.y),
    };
  }

  onCanvasMouseDown(e: MouseEvent): void {
    this.beginPointer(e.clientX, e.clientY);
  }

  /**
   * Chức năng: Bắt đầu chọn vùng bằng CẢM ỨNG — bắt buộc phải có, vì trên mobile
   *   mouse event không phát sinh khi kéo ngón tay.
   * Yêu cầu: `e.touches` có ít nhất 1 điểm.
   * Kết quả trả về: không.
   * Exception: không ném.
   */
  onCanvasTouchStart(e: TouchEvent): void {
    const t = e.touches[0];
    if (!t) return;
    this.beginPointer(t.clientX, t.clientY);
  }

  /**
   * Chức năng: Kéo chọn vùng bằng cảm ứng; chặn cuộn trang mặc định để ngón tay
   *   kéo được khung chọn.
   * Yêu cầu: đang kéo.
   * Kết quả trả về: không.
   * Exception: không ném.
   */
  onCanvasTouchMove(e: TouchEvent): void {
    if (!this.isDragging) return;
    const t = e.touches[0];
    if (!t) return;
    e.preventDefault();
    this.movePointer(t.clientX, t.clientY);
  }

  @HostListener('document:mousemove', ['$event'])
  onMove(e: MouseEvent): void {
    this.movePointer(e.clientX, e.clientY);
  }

  @HostListener('document:touchend')
  @HostListener('document:touchcancel')
  @HostListener('document:mouseup')
  onUp(): void {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.dragStart = null;
    if (!this.sel) return;
    if (this.sel.w < 3 || this.sel.h < 3) { this.sel = null; this.palette = []; return; }
    this.sel = {
      x: Math.round(this.sel.x), y: Math.round(this.sel.y),
      w: Math.round(this.sel.w), h: Math.round(this.sel.h),
    };
    this.refreshPalette();
    this.targetColor = this.edit.rgbToHex(
      this.edit.sampleColor(this.ctx, this.sel.x + this.sel.w / 2, this.sel.y + this.sel.h / 2),
    );
  }

  get selStyle(): { [k: string]: string } {
    if (!this.sel) return { display: 'none' };
    return {
      left: `${this.sel.x * this.zoom}px`,
      top: `${this.sel.y * this.zoom}px`,
      width: `${this.sel.w * this.zoom}px`,
      height: `${this.sel.h * this.zoom}px`,
    };
  }

  clearSelection(): void { this.sel = null; this.palette = []; }

  refreshPalette(): void {
    if (!this.sel || this.tainted) { this.palette = []; return; }
    this.palette = this.edit.neighborPalette(this.ctx, this.sel, this.imgW, this.imgH);
  }

  useSwatch(s: Swatch): void { this.fillColor = s.hex; }

  // ── Thao tác ───────────────────────────────────────────────────────────────

  private require(): boolean {
    if (this.tainted) { this.toastr.error('Ảnh này không đọc được pixel (CORS)'); return false; }
    if (!this.sel || this.sel.w < 1) { this.toastr.warning('Kéo chuột để chọn vùng trước'); return false; }
    return true;
  }

  applyPatch(useNeighbor: boolean): void {
    if (!this.require()) return;
    this.push();
    let color = this.fillColor;
    if (useNeighbor) {
      const rgb = this.edit.dominantNeighborColor(this.ctx, this.sel!, this.imgW, this.imgH);
      if (rgb) { color = this.edit.rgbToHex(rgb); this.fillColor = color; }
    }
    this.edit.fillRect(this.ctx, this.sel!, color);
    this.refreshPalette();
  }

  applyRecolor(): void {
    if (!this.require()) return;
    this.push();
    this.edit.recolorRegion(
      this.ctx, this.sel!,
      this.edit.hexToRgb(this.targetColor), this.edit.hexToRgb(this.fillColor), this.tolerance,
    );
    this.refreshPalette();
  }

  applyText(): void {
    if (!this.require()) return;
    if (!this.text.trim()) { this.toastr.warning('Nhập nội dung chữ'); return; }
    this.push();
    if (this.clearBeforeText) this.edit.fillRect(this.ctx, this.sel!, this.fillColor);
    this.edit.drawTextInRect(this.ctx, this.sel!, this.text, {
      color: this.textColor, fontSize: this.fontSize, fontFamily: this.fontFamily,
      bold: this.bold, italic: this.italic, align: this.align,
      strokeColor: this.strokeWidth > 0 ? this.strokeColor : undefined,
      strokeWidth: this.strokeWidth,
    });
  }

  // ── Undo / Redo ────────────────────────────────────────────────────────────

  private push(): void {
    this.undoStack.push(this.ctx.getImageData(0, 0, this.imgW, this.imgH));
    this.redoStack = [];
    this.dirty = true;
    let bytes = this.undoStack.reduce((s, x) => s + x.data.length, 0);
    while (this.undoStack.length > 1 && bytes > ImageEditorPanelComponent.HISTORY_BUDGET_BYTES) {
      const dropped = this.undoStack.shift();
      bytes -= dropped?.data.length ?? 0;
    }
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this.ctx.getImageData(0, 0, this.imgW, this.imgH));
    this.ctx.putImageData(prev, 0, 0);
    this.dirty = this.undoStack.length > 0;
    this.refreshPalette();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.ctx.getImageData(0, 0, this.imgW, this.imgH));
    this.ctx.putImageData(next, 0, 0);
    this.dirty = true;
    this.refreshPalette();
  }

  // ── Kết quả ────────────────────────────────────────────────────────────────

  async apply(): Promise<void> {
    if (!this.cvRef) return;
    if (!this.dirty) { this.toastr.info('Chưa có thay đổi nào'); return; }
    try {
      const blob = await this.edit.canvasToBlob(this.cvRef.nativeElement, 'image/png');
      this.applied.emit(blob);
    } catch {
      this.toastr.error('Không tạo được ảnh đã sửa');
    }
  }

  close(): void { this.closed.emit(); }
}
