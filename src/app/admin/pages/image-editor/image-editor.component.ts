import {
  AfterViewChecked, Component, ElementRef, HostListener, OnDestroy, OnInit,
  QueryList, ViewChild, ViewChildren,
} from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import {
  BubbleShape, BubbleStyle, EditRegion, FONT_GROUPS, ImageEditService, Rect,
  RecolorMode, RegionTextStyle, Swatch, TailDir,
} from '../../services/image-edit.service';

/**
 * ⚠️ MODULE MỚI THÊM — xem `docs/ADMIN_MODULES_ADDED.md`.
 *
 * Trình sửa ảnh nhẹ cho translator — làm các việc đơn giản ngay trong web, không
 * cần mở Photoshop:
 *  - xoá SFX (tô kín vùng bằng màu nền lân cận)
 *  - xoá một MÀU chỉ định trong vùng rồi lấp bằng pixel lân cận (inpaint)
 *  - đặt bong bóng hội thoại theo mẫu + ghi chữ lên vùng
 *  - đổi màu của một vùng (theo ngưỡng / toàn bộ / giữ độ đậm nhạt)
 *  - hút màu + xem bảng màu các vùng LÂN CẬN để tô cho khớp tông
 *  - cắt ảnh dài thành lưới theo cả chiều rộng lẫn chiều cao, xuất zip
 *
 * MÔ HÌNH VÙNG CHỌN: mỗi vùng là một CONTAINER độc lập (`EditRegion`) giữ khung,
 * kiểu bong bóng và chữ riêng. Vùng được vẽ ở lớp phủ (overlay canvas) nên còn
 * sửa/kéo/thả được; chỉ khi "nung" hoặc xuất file mới ghi thật vào ảnh.
 *
 * Toàn bộ xử lý ở CLIENT (canvas 2D), không upload gì lên server.
 */
type Tool = 'select' | 'pick';

/** Kiểu thao tác kéo đang diễn ra. Các mã 2 ký tự là góc/cạnh đang co giãn. */
type DragMode = 'new' | 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** Mẫu bong bóng dựng sẵn cho người dùng chọn nhanh. */
interface BubbleTemplate {
  key: string;
  label: string;
  bubble: BubbleStyle;
}

@Component({
  selector: 'app-image-editor',
  templateUrl: './image-editor.component.html',
  styleUrls: ['./image-editor.component.scss'],
})
export class ImageEditorComponent implements OnInit, AfterViewChecked, OnDestroy {
  @ViewChild('cv') cvRef!: ElementRef<HTMLCanvasElement>;
  /** Lớp phủ vẽ các vùng đang soạn (chưa nung vào ảnh). */
  @ViewChild('ov') ovRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('wrap') wrapRef?: ElementRef<HTMLElement>;
  @ViewChildren('tplCv') tplCanvases?: QueryList<ElementRef<HTMLCanvasElement>>;

  fileName = '';
  hasImage = false;
  /** Kích thước gốc của ảnh (canvas luôn ở kích thước này). */
  imgW = 0;
  imgH = 0;

  zoom = 1;
  tool: Tool = 'select';

  // ── Vùng chọn (container độc lập) ──────────────────────────────────────────
  regions: EditRegion[] = [];
  activeId: string | null = null;
  isDragging = false;
  private drag: {
    mode: DragMode; id: string; orig: Rect; from: { x: number; y: number };
    /** Vùng đang chọn TRƯỚC thao tác — để khôi phục khi kéo hụt (click nhầm). */
    prevId: string | null;
  } | null = null;
  private seq = 0;

  // ── Màu ────────────────────────────────────────────────────────────────────
  fillColor = '#ffffff';
  /** Màu đích của công cụ đổi/xoá màu (mặc định hút từ giữa vùng chọn). */
  targetColor = '#000000';
  tolerance = 48;
  recolorMode: RecolorMode = 'threshold';
  /** Nới biên vùng bị xoá — nuốt luôn viền răng cưa quanh nét chữ. */
  inpaintExpand = 1;
  /** Bảng màu vùng lân cận — translator tham khảo để tô đúng tông. */
  palette: Swatch[] = [];

  // ── Mẫu bong bóng ──────────────────────────────────────────────────────────
  readonly fontGroups = FONT_GROUPS;
  readonly tailDirs: { value: TailDir; label: string }[] = [
    { value: 'none', label: 'Không đuôi' },
    { value: 'sw', label: '↙ Dưới trái' },
    { value: 's', label: '↓ Dưới' },
    { value: 'se', label: '↘ Dưới phải' },
    { value: 'w', label: '← Trái' },
    { value: 'e', label: '→ Phải' },
    { value: 'nw', label: '↖ Trên trái' },
    { value: 'n', label: '↑ Trên' },
    { value: 'ne', label: '↗ Trên phải' },
  ];

  readonly templates: BubbleTemplate[] = [
    { key: 'none', label: 'Chỉ chữ', bubble: this.mkBubble('none', { tail: 'none', strokeWidth: 0 }) },
    { key: 'ellipse', label: 'Thoại tròn', bubble: this.mkBubble('ellipse', { tail: 'sw' }) },
    { key: 'round', label: 'Bo góc', bubble: this.mkBubble('round', { tail: 's' }) },
    { key: 'rect', label: 'Ô kể chuyện', bubble: this.mkBubble('rect', { tail: 'none' }) },
    { key: 'cloud', label: 'Suy nghĩ', bubble: this.mkBubble('cloud', { tail: 'sw', tailSize: 0.5 }) },
    { key: 'spike', label: 'Hô lớn', bubble: this.mkBubble('spike', { tail: 'none' }) },
    { key: 'wobble', label: 'Run rẩy', bubble: this.mkBubble('wobble', { tail: 's' }) },
  ];
  templateKey = 'ellipse';

  // ── Cắt ảnh ────────────────────────────────────────────────────────────────
  /** 0 = không cắt theo chiều rộng (giữ nguyên khổ ngang). */
  partWidth = 0;
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

  /** Chữ ký của danh sách vùng ở lần vẽ overlay gần nhất (tránh vẽ lại thừa). */
  private lastSig = '';
  private overlayDirty = false;

  constructor(
    private edit: ImageEditService,
    private toastr: ToastrService,
  ) {}

  ngOnInit(): void {
    // Font web chỉ cần cho trang này → nạp tại đây, không nhét vào index.html.
    this.edit.ensureEditorFonts();
  }

  ngAfterViewChecked(): void {
    this.renderTemplatePreviews();
    if (!this.hasImage || !this.ovRef) return;
    const sig = JSON.stringify(this.regions);
    if (sig === this.lastSig && !this.overlayDirty) return;
    this.lastSig = sig;
    this.overlayDirty = false;
    this.renderOverlay();
  }

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
        this.regions = [];
        this.activeId = null;
        this.palette = [];
        this.fitZoom();
        this.overlayDirty = true;
        URL.revokeObjectURL(url);
      });
    };
    img.onerror = () => { URL.revokeObjectURL(url); this.toastr.error('Không đọc được ảnh'); };
    img.src = url;
  }

  /** Zoom sao cho ảnh vừa bề ngang khung làm việc. */
  fitZoom(): void {
    const host = this.wrapRef?.nativeElement ?? this.cvRef?.nativeElement?.parentElement?.parentElement;
    const avail = (host?.clientWidth ?? 900) - 24;
    this.zoom = this.imgW > avail ? +(avail / this.imgW).toFixed(3) : 1;
  }

  setZoom(z: number): void {
    this.zoom = Math.min(8, Math.max(0.05, +z.toFixed(3)));
  }

  /**
   * Chức năng: Ctrl/⌘ + lăn chuột trong khung ảnh → phóng to/thu nhỏ, GIỮ NGUYÊN
   *   điểm ảnh đang nằm dưới con trỏ (nếu không, ảnh dài sẽ nhảy đi mất chỗ đang
   *   sửa mỗi lần zoom).
   * Yêu cầu: đã có ảnh; sự kiện wheel từ khung `.ie-canvas-wrap`.
   * Kết quả trả về: không (đổi `zoom` và scroll của khung).
   * Exception: không ném.
   */
  onCanvasWheel(e: WheelEvent): void {
    if (!this.hasImage || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const wrap = this.wrapRef?.nativeElement;
    const cv = this.cvRef?.nativeElement;
    if (!wrap || !cv) return;

    const before = cv.getBoundingClientRect();
    const ix = (e.clientX - before.left) / this.zoom;
    const iy = (e.clientY - before.top) / this.zoom;

    this.setZoom(this.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15));

    // Kích thước mới chỉ có sau khi Angular cập nhật style → chỉnh scroll ở tick sau.
    const clientX = e.clientX, clientY = e.clientY;
    setTimeout(() => {
      const after = cv.getBoundingClientRect();
      wrap.scrollLeft += after.left + ix * this.zoom - clientX;
      wrap.scrollTop += after.top + iy * this.zoom - clientY;
    });
  }

  // ── Vùng chọn: tạo / chọn / kéo / co giãn ──────────────────────────────────

  get active(): EditRegion | null {
    return this.regions.find(r => r.id === this.activeId) ?? null;
  }

  /** Dựng BubbleStyle mặc định cho một hình, cho phép ghi đè vài trường. */
  private mkBubble(shape: BubbleShape, over: Partial<BubbleStyle> = {}): BubbleStyle {
    return {
      shape,
      fill: '#ffffff',
      stroke: '#111111',
      strokeWidth: shape === 'none' ? 0 : 3,
      tail: 'none',
      tailSize: 0.45,
      padding: 0.02,
      ...over,
    };
  }

  /** Kiểu chữ mặc định cho vùng mới — kế thừa vùng đang chọn để đỡ chỉnh lại. */
  private mkText(): RegionTextStyle {
    const from = this.active?.text;
    return from
      ? { ...from, content: '' }
      : {
        content: '',
        color: '#111111',
        fontFamily: '"Be Vietnam Pro", sans-serif',
        fontSize: 22,
        autoFit: true,
        bold: true,
        italic: false,
        align: 'center',
        lineHeight: 1.2,
        strokeColor: '#ffffff',
        strokeWidth: 0,
        uppercase: false,
      };
  }

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
   * Chức năng: Bấm/chạm lên ẢNH — hút màu (tool `pick`) hoặc mở đầu tạo một vùng
   *   MỚI. Vùng được tạo ngay từ lúc bấm để người dùng thấy khung lớn dần theo
   *   tay kéo; nếu kéo quá nhỏ thì huỷ ở bước thả.
   * Yêu cầu: đã có ảnh; `clientX/clientY` là toạ độ điểm bấm/chạm.
   * Kết quả trả về: không.
   * Exception: không ném.
   */
  private beginPointer(clientX: number, clientY: number): void {
    if (!this.hasImage) return;
    const p = this.toImageCoords(clientX, clientY);

    if (this.tool === 'pick') {
      const rgb = this.edit.sampleColor(this.ctx, p.x, p.y);
      this.fillColor = this.edit.rgbToHex(rgb);
      this.targetColor = this.fillColor;
      this.toastr.info(`Đã hút màu ${this.fillColor}`);
      return;
    }

    const tpl = this.templates.find(t => t.key === this.templateKey) ?? this.templates[1];
    const prevId = this.activeId;
    const region: EditRegion = {
      id: `r${++this.seq}_${Date.now().toString(36)}`,
      name: `Vùng ${this.regions.length + 1}`,
      rect: { x: p.x, y: p.y, w: 0, h: 0 },
      bubble: { ...tpl.bubble },
      text: this.mkText(),
      visible: true,
    };
    this.regions.push(region);
    this.activeId = region.id;
    this.drag = { mode: 'new', id: region.id, orig: { ...region.rect }, from: p, prevId };
    this.isDragging = true;
  }

  /**
   * Chức năng: Cập nhật khung vùng đang thao tác (vẽ mới / di chuyển / co giãn).
   * Yêu cầu: đang trong một thao tác kéo (`drag` khác null).
   * Kết quả trả về: không (cập nhật `rect` của vùng tương ứng).
   * Exception: không ném.
   */
  private movePointer(clientX: number, clientY: number): void {
    if (!this.drag) return;
    const region = this.regions.find(r => r.id === this.drag!.id);
    if (!region) return;

    const p = this.toImageCoords(clientX, clientY);
    const { mode, orig, from } = this.drag;

    if (mode === 'new') {
      region.rect = {
        x: Math.min(from.x, p.x),
        y: Math.min(from.y, p.y),
        w: Math.abs(p.x - from.x),
        h: Math.abs(p.y - from.y),
      };
      return;
    }

    const dx = p.x - from.x, dy = p.y - from.y;

    if (mode === 'move') {
      region.rect = {
        ...orig,
        x: Math.max(0, Math.min(this.imgW - orig.w, orig.x + dx)),
        y: Math.max(0, Math.min(this.imgH - orig.h, orig.y + dy)),
      };
      return;
    }

    // Co giãn: dịch riêng từng cạnh có trong mã hướng rồi chuẩn hoá nếu bị lật.
    let left = orig.x, top = orig.y, right = orig.x + orig.w, bottom = orig.y + orig.h;
    if (mode.includes('w')) left = Math.max(0, Math.min(right - 4, orig.x + dx));
    if (mode.includes('e')) right = Math.min(this.imgW, Math.max(left + 4, orig.x + orig.w + dx));
    if (mode.includes('n')) top = Math.max(0, Math.min(bottom - 4, orig.y + dy));
    if (mode.includes('s')) bottom = Math.min(this.imgH, Math.max(top + 4, orig.y + orig.h + dy));
    region.rect = { x: left, y: top, w: right - left, h: bottom - top };
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
   * Chức năng: Kéo bằng cảm ứng; chặn hành vi cuộn trang mặc định để ngón tay
   *   kéo được khung chọn thay vì scroll.
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

  /**
   * Chức năng: Bắt đầu DI CHUYỂN hoặc CO GIÃN một vùng đã có. Phải chặn nổi bọt,
   *   nếu không canvas bên dưới sẽ hiểu nhầm là đang vẽ một vùng mới.
   * Yêu cầu: `mode` là 'move' hoặc mã cạnh/góc; vùng `r` đang hiển thị.
   * Kết quả trả về: không.
   * Exception: không ném.
   */
  onRegionPointerDown(e: MouseEvent | TouchEvent, r: EditRegion, mode: DragMode): void {
    e.stopPropagation();
    const t = (e as TouchEvent).touches?.[0];
    if (!t) e.preventDefault();
    const clientX = t ? t.clientX : (e as MouseEvent).clientX;
    const clientY = t ? t.clientY : (e as MouseEvent).clientY;

    // Giữ Alt: vẽ vùng MỚI đè lên vùng cũ. Không có lối thoát này thì chỗ nào đã
    // có bong bóng là không tạo thêm vùng ở đó được nữa.
    if (mode === 'move' && (e as MouseEvent).altKey) {
      this.beginPointer(clientX, clientY);
      return;
    }

    this.activeId = r.id;
    this.drag = {
      mode, id: r.id, orig: { ...r.rect },
      from: this.toImageCoords(clientX, clientY), prevId: r.id,
    };
    this.isDragging = true;
  }

  @HostListener('document:mousemove', ['$event'])
  onDocMouseMove(e: MouseEvent): void {
    if (!this.isDragging) return;
    this.movePointer(e.clientX, e.clientY);
  }

  /**
   * Chức năng: Theo dõi ngón tay khi kéo/co giãn một vùng ĐÃ CÓ. Thao tác đó bắt
   *   đầu trên khung vùng chứ không trên canvas, nên `touchmove` của canvas không
   *   nhận được — thiếu handler này thì trên mobile chỉ tạo được vùng mới, không
   *   di chuyển được vùng cũ.
   * Yêu cầu: đang kéo; cuộn trang đã bị chặn bằng `touch-action: none` ở CSS
   *   (listener trên document là passive nên không preventDefault được).
   * Kết quả trả về: không.
   * Exception: không ném.
   */
  @HostListener('document:touchmove', ['$event'])
  onDocTouchMove(e: TouchEvent): void {
    if (!this.isDragging) return;
    const t = e.touches[0];
    if (t) this.movePointer(t.clientX, t.clientY);
  }

  @HostListener('document:touchend')
  @HostListener('document:touchcancel')
  @HostListener('document:mouseup')
  onDocMouseUp(): void {
    if (!this.isDragging || !this.drag) return;
    const { mode, id, prevId } = this.drag;
    this.isDragging = false;
    this.drag = null;

    const region = this.regions.find(r => r.id === id);
    if (!region) return;

    // Kéo quá nhỏ = click nhầm → bỏ vùng vừa tạo, trả lại vùng đang chọn trước đó.
    if (mode === 'new' && (region.rect.w < 6 || region.rect.h < 6)) {
      this.regions = this.regions.filter(r => r.id !== id);
      this.activeId = this.regions.some(r => r.id === prevId) ? prevId : null;
      this.refreshPalette();
      return;
    }

    region.rect = {
      x: Math.round(region.rect.x), y: Math.round(region.rect.y),
      w: Math.round(region.rect.w), h: Math.round(region.rect.h),
    };
    this.refreshPalette();
    // Gợi ý màu đích cho công cụ đổi/xoá màu = màu ở giữa vùng chọn.
    this.targetColor = this.edit.rgbToHex(
      this.edit.sampleColor(this.ctx, region.rect.x + region.rect.w / 2, region.rect.y + region.rect.h / 2),
    );
  }

  // ── Danh sách vùng ─────────────────────────────────────────────────────────

  selectRegion(r: EditRegion): void {
    this.activeId = r.id;
    this.refreshPalette();
  }

  removeRegion(r: EditRegion, e?: Event): void {
    e?.stopPropagation();
    this.regions = this.regions.filter(x => x.id !== r.id);
    if (this.activeId === r.id) {
      this.activeId = this.regions[this.regions.length - 1]?.id ?? null;
      this.palette = [];
    }
    this.overlayDirty = true;
  }

  /** Nhân bản vùng (lệch xuống một chút để không đè lên bản gốc). */
  duplicateRegion(r: EditRegion, e?: Event): void {
    e?.stopPropagation();
    const copy: EditRegion = {
      ...r,
      id: `r${++this.seq}_${Date.now().toString(36)}`,
      name: `${r.name} (bản sao)`,
      rect: {
        ...r.rect,
        x: Math.min(this.imgW - r.rect.w, r.rect.x + 12),
        y: Math.min(this.imgH - r.rect.h, r.rect.y + 12),
      },
      bubble: { ...r.bubble },
      text: { ...r.text },
    };
    this.regions.push(copy);
    this.activeId = copy.id;
  }

  toggleRegionVisible(r: EditRegion, e?: Event): void {
    e?.stopPropagation();
    r.visible = !r.visible;
  }

  clearRegions(): void {
    this.regions = [];
    this.activeId = null;
    this.palette = [];
    this.overlayDirty = true;
  }

  /** Bỏ chọn (vùng vẫn còn) — Esc hoặc bấm nút X trên thanh trạng thái. */
  clearSelection(): void {
    this.activeId = null;
    this.palette = [];
  }

  applyTemplate(key: string): void {
    this.templateKey = key;
    const tpl = this.templates.find(t => t.key === key);
    const r = this.active;
    // Đổi mẫu khi đang chọn vùng thì áp luôn cho vùng đó, giữ nguyên đuôi đã chỉnh.
    if (tpl && r) r.bubble = { ...tpl.bubble, tail: r.bubble.tail === 'none' ? tpl.bubble.tail : r.bubble.tail };
  }

  /** Đợi font tải xong rồi vẽ lại lớp phủ — canvas không tự vẽ lại khi font về. */
  onFontChanged(): void {
    const r = this.active;
    if (!r) return;
    this.edit.waitFont(r.text.fontFamily, Math.max(24, r.text.fontSize), r.text.bold)
      .then(() => { this.overlayDirty = true; });
  }

  /** Style CSS của khung vùng theo toạ độ HIỂN THỊ (đã nhân zoom). */
  regionStyle(r: EditRegion): { [k: string]: string } {
    return {
      left: `${r.rect.x * this.zoom}px`,
      top: `${r.rect.y * this.zoom}px`,
      width: `${r.rect.w * this.zoom}px`,
      height: `${r.rect.h * this.zoom}px`,
    };
  }

  trackRegion(_: number, r: EditRegion): string { return r.id; }

  // ── Lớp phủ ────────────────────────────────────────────────────────────────

  /** Vẽ lại toàn bộ vùng lên overlay (không đụng vào ảnh gốc). */
  private renderOverlay(): void {
    const cv = this.ovRef?.nativeElement;
    if (!cv) return;
    if (cv.width !== this.imgW || cv.height !== this.imgH) {
      cv.width = this.imgW;
      cv.height = this.imgH;
    }
    const ctx = cv.getContext('2d')!;
    ctx.clearRect(0, 0, this.imgW, this.imgH);
    for (const r of this.regions) this.edit.drawRegion(ctx, r);
  }

  /** Vẽ hình minh hoạ cho từng mẫu bong bóng (dùng lại đúng code vẽ thật). */
  private renderTemplatePreviews(): void {
    this.tplCanvases?.forEach((ref, i) => {
      const cv = ref.nativeElement;
      if (cv.dataset['done'] === '1') return;
      // Trùng tỉ lệ với ô hiển thị (CSS cao 30px) để hình không bị bóp méo.
      cv.width = 128;
      cv.height = 60;
      const ctx = cv.getContext('2d')!;
      const tpl = this.templates[i];
      if (!tpl) return;
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (tpl.bubble.shape === 'none') {
        ctx.fillStyle = '#9aa0a6';
        ctx.font = 'bold 26px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Abc', 64, 30);
      } else {
        this.edit.drawBubble(ctx, { x: 10, y: 7, w: 108, h: 36 }, { ...tpl.bubble, strokeWidth: 3 });
      }
      cv.dataset['done'] = '1';
    });
  }

  // ── Bảng màu lân cận ───────────────────────────────────────────────────────

  refreshPalette(): void {
    const r = this.active;
    if (!r) { this.palette = []; return; }
    this.palette = this.edit.neighborPalette(this.ctx, r.rect, this.imgW, this.imgH);
  }

  useSwatch(s: Swatch): void {
    this.fillColor = s.hex;
    this.toastr.info(`Dùng màu ${s.hex}`);
  }

  useSwatchAsTarget(s: Swatch, e: Event): void {
    e.stopPropagation();
    this.targetColor = s.hex;
  }

  // ── Thao tác lên PIXEL của vùng đang chọn ──────────────────────────────────

  /** Tô kín vùng chọn — xoá SFX / xoá chữ gốc. */
  applyPatch(useNeighborColor = false): void {
    const r = this.requireRegion();
    if (!r) return;
    this.pushHistory();
    let color = this.fillColor;
    if (useNeighborColor) {
      const rgb = this.edit.dominantNeighborColor(this.ctx, r.rect, this.imgW, this.imgH);
      if (rgb) { color = this.edit.rgbToHex(rgb); this.fillColor = color; }
    }
    this.edit.fillRect(this.ctx, r.rect, color);
    this.refreshPalette();
  }

  /**
   * Chức năng: Chạy công cụ màu trên vùng đang chọn theo `recolorMode` — đổi
   *   theo ngưỡng / đổi toàn bộ / giữ độ đậm nhạt / xoá màu rồi lấp bằng pixel
   *   lân cận.
   * Yêu cầu: đang chọn một vùng; `targetColor` là màu cần thay hoặc cần xoá.
   * Kết quả trả về: không (ghi thẳng vào ảnh, có lưu bước hoàn tác).
   * Exception: không ném — chưa chọn vùng thì báo toast và dừng.
   */
  applyRecolor(): void {
    const r = this.requireRegion();
    if (!r) return;
    this.pushHistory();

    if (this.recolorMode === 'inpaint') {
      const hit = this.edit.removeColorInRegion(
        this.ctx, r.rect, this.edit.hexToRgb(this.targetColor), this.tolerance,
        this.imgW, this.imgH, { expand: this.inpaintExpand },
      );
      if (hit === 0) this.toastr.warning('Không tìm thấy pixel nào khớp màu cần xoá');
      else this.toastr.success(`Đã xoá & lấp ${hit.toLocaleString('vi-VN')} pixel`);
    } else {
      this.edit.recolorRegion(
        this.ctx, r.rect,
        this.edit.hexToRgb(this.targetColor),
        this.edit.hexToRgb(this.fillColor),
        this.tolerance,
        { mode: this.recolorMode },
      );
    }
    this.refreshPalette();
  }

  private requireRegion(): EditRegion | null {
    if (!this.hasImage) { this.toastr.warning('Chưa có ảnh'); return null; }
    const r = this.active;
    if (!r || r.rect.w < 1 || r.rect.h < 1) {
      this.toastr.warning('Kéo chuột trên ảnh để tạo vùng, hoặc chọn một vùng trong danh sách');
      return null;
    }
    return r;
  }

  // ── Nung vùng vào ảnh ──────────────────────────────────────────────────────

  /**
   * Chức năng: Vẽ THẬT vùng (bong bóng + chữ) vào ảnh rồi bỏ nó khỏi danh sách.
   *   Trước khi nung, vùng chỉ nằm ở lớp phủ nên còn sửa được; sau khi nung thì
   *   chỉ hoàn tác được bằng Ctrl+Z.
   * Yêu cầu: `r` đang trong danh sách; đã có ảnh.
   * Kết quả trả về: không.
   * Exception: không ném.
   */
  bakeRegion(r: EditRegion, e?: Event): void {
    e?.stopPropagation();
    if (!this.hasImage) return;
    this.pushHistory();
    this.edit.drawRegion(this.ctx, r);
    this.removeRegion(r);
    this.refreshPalette();
  }

  bakeAll(): void {
    if (!this.hasImage || this.regions.length === 0) return;
    this.pushHistory();
    for (const r of this.regions) this.edit.drawRegion(this.ctx, r);
    const n = this.regions.length;
    this.clearRegions();
    this.toastr.success(`Đã ghi ${n} vùng vào ảnh`);
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
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName) || t?.isContentEditable) return;

    if (!(e.ctrlKey || e.metaKey)) {
      if (e.key === 'Escape') this.clearSelection();
      else if ((e.key === 'Delete' || e.key === 'Backspace') && this.active) {
        e.preventDefault();
        this.removeRegion(this.active);
      } else if (this.active && e.key.startsWith('Arrow')) {
        // Nhích vùng 1px (Shift = 10px) cho lúc căn chỉnh tinh.
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const r = this.active.rect;
        if (e.key === 'ArrowLeft') r.x = Math.max(0, r.x - step);
        if (e.key === 'ArrowRight') r.x = Math.min(this.imgW - r.w, r.x + step);
        if (e.key === 'ArrowUp') r.y = Math.max(0, r.y - step);
        if (e.key === 'ArrowDown') r.y = Math.min(this.imgH - r.h, r.y + step);
      }
      return;
    }
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); this.redo(); }
  }

  // ── Cắt & xuất ─────────────────────────────────────────────────────────────

  /** Các ô sẽ được cắt theo khổ hiện tại (để hiện preview số phần). */
  get splitPreview(): Rect[] {
    if (!this.hasImage) return [];
    return this.edit.splitGrid(this.imgW, this.imgH, this.partWidth, this.partHeight);
  }

  /** Số cột của lưới cắt — dùng để đặt tên file và vẽ vạch dọc. */
  get splitCols(): number {
    return new Set(this.splitPreview.map(r => r.x)).size;
  }

  /** Vạch cắt NGANG trên ảnh (toạ độ hiển thị). */
  get splitGuidesY(): number[] {
    return Array.from(new Set(this.splitPreview.map(r => r.y)))
      .filter(y => y > 0)
      .map(y => y * this.zoom);
  }

  /** Vạch cắt DỌC trên ảnh (toạ độ hiển thị). */
  get splitGuidesX(): number[] {
    return Array.from(new Set(this.splitPreview.map(r => r.x)))
      .filter(x => x > 0)
      .map(x => x * this.zoom);
  }

  private baseName(): string {
    return (this.fileName.replace(/\.[^.]+$/, '') || 'image');
  }

  /**
   * Chức năng: Dựng canvas KẾT QUẢ = ảnh gốc + toàn bộ vùng đang soạn. Nhờ vậy
   *   xuất file luôn khớp với cái đang nhìn thấy mà không cần nung trước (vùng
   *   vẫn sửa được sau khi xuất).
   * Yêu cầu: đã có ảnh.
   * Kết quả trả về: canvas gốc nếu không có vùng nào, ngược lại là canvas tạm.
   * Exception: không ném.
   */
  private composite(): HTMLCanvasElement {
    const src = this.cvRef.nativeElement;
    const drawable = this.regions.filter(r => r.visible);
    if (drawable.length === 0) return src;
    const tmp = document.createElement('canvas');
    tmp.width = this.imgW;
    tmp.height = this.imgH;
    const tctx = tmp.getContext('2d')!;
    tctx.drawImage(src, 0, 0);
    for (const r of drawable) this.edit.drawRegion(tctx, r);
    return tmp;
  }

  /** Xuất ảnh nguyên tấm. */
  async exportSingle(): Promise<void> {
    if (!this.hasImage) return;
    this.isExporting = true;
    try {
      const blob = await this.edit.canvasToBlob(this.composite(), this.exportType, this.jpegQuality);
      this.edit.download(blob, `${this.baseName()}_edited.${this.edit.extensionOf(this.exportType)}`);
    } catch {
      this.toastr.error('Xuất ảnh thất bại');
    } finally {
      this.isExporting = false;
    }
  }

  /**
   * Chức năng: Cắt ảnh theo lưới (rộng × cao) rồi tải về một file zip. Tên file
   *   có `r{hàng}c{cột}` khi cắt nhiều cột để không lẫn thứ tự ghép lại.
   * Yêu cầu: đã có ảnh và lưới cắt phải ra ít nhất 2 phần.
   * Kết quả trả về: Promise<void> — hoàn tất khi zip đã được tải xuống.
   * Exception: không ném — lỗi hiển thị bằng toast.
   */
  async exportSplitZip(): Promise<void> {
    if (!this.hasImage) return;
    const rects = this.splitPreview;
    if (rects.length < 2) { this.toastr.warning('Khổ cắt lớn hơn ảnh — không có gì để cắt'); return; }

    this.isExporting = true;
    try {
      const ext = this.edit.extensionOf(this.exportType);
      const blobs = await this.edit.sliceToBlobs(
        this.composite(), rects, this.exportType, this.jpegQuality,
      );
      const cols = this.splitCols;
      const pad = String(blobs.length).length;
      const files = blobs.map((blob, i) => {
        const suffix = cols > 1
          ? `r${String(Math.floor(i / cols) + 1).padStart(2, '0')}c${String((i % cols) + 1).padStart(2, '0')}`
          : String(i + 1).padStart(pad, '0');
        return { name: `${this.baseName()}_${suffix}.${ext}`, blob };
      });
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
    this.regions = [];
    this.activeId = null;
    this.palette = [];
    this.undoStack = [];
    this.redoStack = [];
  }
}
