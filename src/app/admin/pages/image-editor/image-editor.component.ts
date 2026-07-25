import { Component, ElementRef, HostListener, OnDestroy, ViewChild } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { ImageEditService, Rect, Rgb, Swatch } from '../../services/image-edit.service';

/**
 * ⚠️ MODULE MỚI THÊM — xem `docs/ADMIN_MODULES_ADDED.md`.
 *
 * Trình sửa ảnh nhẹ cho translator — làm các việc đơn giản ngay trong web, không
 * cần mở Photoshop:
 *  - xoá SFX (tô kín vùng bằng màu nền lân cận)
 *  - xoá & ghi đè chữ lên một vùng
 *  - đổi màu của một vùng (theo ngưỡng sai khác)
 *  - hút màu + xem bảng màu các vùng LÂN CẬN để tô cho khớp tông
 *  - cắt ảnh dài (manhua/manhwa) thành nhiều phần, xuất zip
 *
 * Toàn bộ xử lý ở CLIENT (canvas 2D), không upload gì lên server.
 */
type Tool = 'select' | 'patch' | 'text' | 'recolor' | 'pick';

@Component({
  selector: 'app-image-editor',
  templateUrl: './image-editor.component.html',
  styleUrls: ['./image-editor.component.scss'],
})
export class ImageEditorComponent implements OnDestroy {
  @ViewChild('cv') cvRef!: ElementRef<HTMLCanvasElement>;

  fileName = '';
  hasImage = false;
  /** Kích thước gốc của ảnh (canvas luôn ở kích thước này). */
  imgW = 0;
  imgH = 0;

  zoom = 1;
  tool: Tool = 'select';

  /** Vùng chọn theo toạ độ ẢNH GỐC (không phải toạ độ hiển thị). */
  sel: Rect | null = null;
  private dragStart: { x: number; y: number } | null = null;
  isDragging = false;

  // ── Màu ────────────────────────────────────────────────────────────────────
  fillColor = '#ffffff';
  /** Màu đích của công cụ đổi màu (mặc định hút từ giữa vùng chọn). */
  targetColor = '#000000';
  tolerance = 48;
  /** Bảng màu vùng lân cận — translator tham khảo để tô đúng tông. */
  palette: Swatch[] = [];

  // ── Chữ ────────────────────────────────────────────────────────────────────
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
  /** Tô nền vùng chọn trước khi viết chữ (xoá chữ gốc bên dưới). */
  clearBeforeText = true;

  // ── Cắt ảnh ────────────────────────────────────────────────────────────────
  partHeight = 1200;
  exportType = 'image/png';
  jpegQuality = 0.92;
  isExporting = false;

  // ── Undo / Redo ────────────────────────────────────────────────────────────
  private undoStack: ImageData[] = [];
  private redoStack: ImageData[] = [];
  /**
   * Ngân sách RAM cho history. Ảnh manhwa rất cao (vd 800×12000 ≈ 38MB mỗi
   * snapshot) nên giới hạn theo BYTE thay vì theo số bước, và bỏ bước cũ nhất
   * khi vượt ngưỡng.
   */
  private static readonly HISTORY_BUDGET_BYTES = 256 * 1024 * 1024;

  constructor(
    private edit: ImageEditService,
    private toastr: ToastrService,
  ) {}

  ngOnDestroy(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  private get ctx(): CanvasRenderingContext2D {
    return this.cvRef.nativeElement.getContext('2d', { willReadFrequently: true })!;
  }

  // ── Nạp ảnh ────────────────────────────────────────────────────────────────

  onPickFile(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) this.loadFile(file);
  }

  /** Dán ảnh trực tiếp từ clipboard (Ctrl+V) — nhanh hơn phải lưu file ra đĩa. */
  @HostListener('document:paste', ['$event'])
  onPaste(e: ClipboardEvent): void {
    const item = Array.from(e.clipboardData?.items ?? []).find(i => i.type.startsWith('image/'));
    const file = item?.getAsFile();
    if (file) { e.preventDefault(); this.loadFile(file); }
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    const file = Array.from(e.dataTransfer?.files ?? []).find(f => f.type.startsWith('image/'));
    if (file) this.loadFile(file);
  }

  onDragOver(e: DragEvent): void { e.preventDefault(); }

  private loadFile(file: File): void {
    if (!file.type.startsWith('image/')) { this.toastr.error('Chỉ nhận file ảnh'); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      this.fileName = file.name;
      this.imgW = img.naturalWidth;
      this.imgH = img.naturalHeight;
      this.hasImage = true;
      // Đợi Angular render <canvas> với width/height mới rồi mới vẽ.
      setTimeout(() => {
        const cv = this.cvRef.nativeElement;
        cv.width = this.imgW;
        cv.height = this.imgH;
        this.ctx.drawImage(img, 0, 0);
        this.undoStack = [];
        this.redoStack = [];
        this.sel = null;
        this.palette = [];
        this.fitZoom();
        URL.revokeObjectURL(url);
      });
    };
    img.onerror = () => { URL.revokeObjectURL(url); this.toastr.error('Không đọc được ảnh'); };
    img.src = url;
  }

  /** Zoom sao cho ảnh vừa bề ngang khung làm việc. */
  fitZoom(): void {
    const host = this.cvRef?.nativeElement?.parentElement?.parentElement;
    const avail = (host?.clientWidth ?? 900) - 24;
    this.zoom = this.imgW > avail ? +(avail / this.imgW).toFixed(3) : 1;
  }

  setZoom(z: number): void {
    this.zoom = Math.min(4, Math.max(0.05, +z.toFixed(3)));
  }

  // ── Chuột trên canvas ──────────────────────────────────────────────────────

  /**
   * Chức năng: Đổi toạ độ màn hình (chuột hoặc ngón tay) sang toạ độ ẢNH GỐC,
   *   bù `zoom` và kẹp trong biên ảnh.
   * Yêu cầu: `clientX`/`clientY` lấy từ MouseEvent hoặc Touch; canvas đã render.
   * Kết quả trả về: `{x, y}` theo pixel của ảnh gốc.
   * Exception: không ném.
   */
  private toImageCoords(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.cvRef.nativeElement.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(this.imgW, (clientX - r.left) / this.zoom)),
      y: Math.max(0, Math.min(this.imgH, (clientY - r.top) / this.zoom)),
    };
  }

  /**
   * Chức năng: Bắt đầu một thao tác trỏ — hút màu (tool `pick`) hoặc mở đầu kéo
   *   chọn vùng. Dùng chung cho chuột và cảm ứng.
   * Yêu cầu: đã có ảnh; `clientX/clientY` là toạ độ điểm bấm/chạm.
   * Kết quả trả về: không (cập nhật `sel` / `fillColor`).
   * Exception: không ném.
   */
  private beginPointer(clientX: number, clientY: number): void {
    if (!this.hasImage) return;
    const p = this.toImageCoords(clientX, clientY);

    if (this.tool === 'pick') {
      const rgb = this.edit.sampleColor(this.ctx, p.x, p.y);
      this.fillColor = this.edit.rgbToHex(rgb);
      this.textColor = this.fillColor;
      this.toastr.info(`Đã hút màu ${this.fillColor}`);
      return;
    }

    this.dragStart = p;
    this.isDragging = true;
    this.sel = { x: p.x, y: p.y, w: 0, h: 0 };
  }

  /**
   * Chức năng: Cập nhật vùng chọn khi đang kéo (chuột hoặc ngón tay).
   * Yêu cầu: đang trong trạng thái kéo (`isDragging` + `dragStart`).
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
   * Chức năng: Bắt đầu chọn vùng bằng CẢM ỨNG. Không có touch handler thì trên
   *   mobile hoàn toàn không kéo chọn được vùng (mouse event không phát sinh khi
   *   kéo, còn touchmove mặc định sẽ cuộn trang).
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
   * Chức năng: Kéo chọn vùng bằng cảm ứng; chặn hành vi cuộn trang mặc định để
   *   ngón tay kéo được khung chọn thay vì scroll.
   * Yêu cầu: đang kéo (`isDragging`).
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
  onDocMouseMove(e: MouseEvent): void {
    this.movePointer(e.clientX, e.clientY);
  }

  @HostListener('document:touchend')
  @HostListener('document:touchcancel')
  @HostListener('document:mouseup')
  onDocMouseUp(): void {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.dragStart = null;
    if (!this.sel) return;

    // Kéo quá nhỏ = click nhầm → bỏ vùng chọn.
    if (this.sel.w < 3 || this.sel.h < 3) { this.sel = null; this.palette = []; return; }

    this.sel = {
      x: Math.round(this.sel.x), y: Math.round(this.sel.y),
      w: Math.round(this.sel.w), h: Math.round(this.sel.h),
    };
    this.refreshPalette();
    // Gợi ý màu đích cho công cụ đổi màu = màu ở giữa vùng chọn.
    this.targetColor = this.edit.rgbToHex(
      this.edit.sampleColor(this.ctx, this.sel.x + this.sel.w / 2, this.sel.y + this.sel.h / 2),
    );
  }

  /** Khung vùng chọn theo toạ độ HIỂN THỊ (đã nhân zoom) — dùng cho overlay. */
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

  // ── Bảng màu lân cận ───────────────────────────────────────────────────────

  refreshPalette(): void {
    if (!this.sel) { this.palette = []; return; }
    this.palette = this.edit.neighborPalette(this.ctx, this.sel, this.imgW, this.imgH);
  }

  useSwatch(s: Swatch): void {
    this.fillColor = s.hex;
    this.toastr.info(`Dùng màu ${s.hex}`);
  }

  // ── Thao tác ───────────────────────────────────────────────────────────────

  /** Tô kín vùng chọn — xoá SFX / xoá chữ gốc. */
  applyPatch(useNeighborColor = false): void {
    if (!this.requireSelection()) return;
    this.pushHistory();
    let color = this.fillColor;
    if (useNeighborColor) {
      const rgb = this.edit.dominantNeighborColor(this.ctx, this.sel!, this.imgW, this.imgH);
      if (rgb) { color = this.edit.rgbToHex(rgb); this.fillColor = color; }
    }
    this.edit.fillRect(this.ctx, this.sel!, color);
    this.refreshPalette();
  }

  /** Đổi màu trong vùng chọn theo ngưỡng sai khác. */
  applyRecolor(): void {
    if (!this.requireSelection()) return;
    this.pushHistory();
    this.edit.recolorRegion(
      this.ctx, this.sel!,
      this.edit.hexToRgb(this.targetColor),
      this.edit.hexToRgb(this.fillColor),
      this.tolerance,
    );
    this.refreshPalette();
  }

  /** Ghi chữ vào vùng chọn (tuỳ chọn tô nền trước để xoá chữ cũ). */
  applyText(): void {
    if (!this.requireSelection()) return;
    if (!this.text.trim()) { this.toastr.warning('Nhập nội dung chữ'); return; }
    this.pushHistory();
    if (this.clearBeforeText) this.edit.fillRect(this.ctx, this.sel!, this.fillColor);
    this.edit.drawTextInRect(this.ctx, this.sel!, this.text, {
      color: this.textColor,
      fontSize: this.fontSize,
      fontFamily: this.fontFamily,
      bold: this.bold,
      italic: this.italic,
      align: this.align,
      strokeColor: this.strokeWidth > 0 ? this.strokeColor : undefined,
      strokeWidth: this.strokeWidth,
    });
  }

  private requireSelection(): boolean {
    if (!this.hasImage) { this.toastr.warning('Chưa có ảnh'); return false; }
    if (!this.sel || this.sel.w < 1 || this.sel.h < 1) {
      this.toastr.warning('Kéo chuột trên ảnh để chọn vùng trước');
      return false;
    }
    return true;
  }

  // ── Undo / Redo ────────────────────────────────────────────────────────────

  private snapshotBytes(list: ImageData[]): number {
    return list.reduce((sum, s) => sum + s.data.length, 0);
  }

  private pushHistory(): void {
    const snap = this.ctx.getImageData(0, 0, this.imgW, this.imgH);
    this.undoStack.push(snap);
    this.redoStack = [];
    // Vượt ngân sách RAM → bỏ dần bước CŨ NHẤT.
    while (this.undoStack.length > 1
        && this.snapshotBytes(this.undoStack) > ImageEditorComponent.HISTORY_BUDGET_BYTES) {
      this.undoStack.shift();
    }
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this.ctx.getImageData(0, 0, this.imgW, this.imgH));
    this.ctx.putImageData(prev, 0, 0);
    this.refreshPalette();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.ctx.getImageData(0, 0, this.imgW, this.imgH));
    this.ctx.putImageData(next, 0, 0);
    this.refreshPalette();
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent): void {
    // Bỏ qua khi đang gõ trong ô nhập, tránh cướp Ctrl+Z của textarea.
    const t = e.target as HTMLElement;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName)) return;
    if (!(e.ctrlKey || e.metaKey)) {
      if (e.key === 'Escape') this.clearSelection();
      return;
    }
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); this.redo(); }
  }

  // ── Cắt & xuất ─────────────────────────────────────────────────────────────

  /** Các dải sẽ được cắt theo `partHeight` hiện tại (để hiện preview số phần). */
  get splitPreview(): Rect[] {
    if (!this.hasImage) return [];
    return this.edit.splitRects(this.imgW, this.imgH, this.partHeight);
  }

  /** Vạch chỉ đường cắt trên ảnh (toạ độ hiển thị). */
  get splitGuides(): number[] {
    return this.splitPreview.slice(1).map(r => r.y * this.zoom);
  }

  private baseName(): string {
    return (this.fileName.replace(/\.[^.]+$/, '') || 'image');
  }

  /** Xuất ảnh nguyên tấm. */
  async exportSingle(): Promise<void> {
    if (!this.hasImage) return;
    this.isExporting = true;
    try {
      const blob = await this.edit.canvasToBlob(this.cvRef.nativeElement, this.exportType, this.jpegQuality);
      this.edit.download(blob, `${this.baseName()}_edited.${this.edit.extensionOf(this.exportType)}`);
    } catch {
      this.toastr.error('Xuất ảnh thất bại');
    } finally {
      this.isExporting = false;
    }
  }

  /** Cắt thành nhiều phần rồi tải về dưới dạng zip. */
  async exportSplitZip(): Promise<void> {
    if (!this.hasImage) return;
    const rects = this.splitPreview;
    if (rects.length < 2) { this.toastr.warning('Chiều cao mỗi phần lớn hơn ảnh — không có gì để cắt'); return; }

    this.isExporting = true;
    try {
      const ext = this.edit.extensionOf(this.exportType);
      const blobs = await this.edit.sliceToBlobs(
        this.cvRef.nativeElement, rects, this.exportType, this.jpegQuality,
      );
      const pad = String(blobs.length).length;
      const files = blobs.map((blob, i) => ({
        name: `${this.baseName()}_${String(i + 1).padStart(pad, '0')}.${ext}`,
        blob,
      }));
      const zip = await this.edit.zipBlobs(files);
      this.edit.download(zip, `${this.baseName()}_split.zip`);
      this.toastr.success(`Đã cắt thành ${files.length} phần`);
    } catch {
      this.toastr.error('Cắt ảnh thất bại');
    } finally {
      this.isExporting = false;
    }
  }

  reset(): void {
    this.hasImage = false;
    this.fileName = '';
    this.sel = null;
    this.palette = [];
    this.undoStack = [];
    this.redoStack = [];
    this.text = '';
  }
}
