import { Injectable } from '@angular/core';
import JSZip from 'jszip';

/**
 * ⚠️ MODULE MỚI THÊM — xem `docs/ADMIN_MODULES_ADDED.md`.
 *
 * Logic xử lý ảnh cho trang `/admin/image-editor` (canvas 2D thuần, KHÔNG dùng
 * lib ngoài). Tách khỏi component để phần tính toán pixel không lẫn với UI.
 */

export interface Rect { x: number; y: number; w: number; h: number; }
export interface Rgb { r: number; g: number; b: number; }
export interface Swatch { hex: string; rgb: Rgb; count: number; }

// ── Bong bóng hội thoại ──────────────────────────────────────────────────────

/** Kiểu khung bong bóng. `none` = chỉ có chữ, không vẽ nền. */
export type BubbleShape = 'none' | 'rect' | 'round' | 'ellipse' | 'wobble' | 'cloud' | 'spike';

/** Hướng đuôi bong bóng (theo la bàn). `none` = không có đuôi. */
export type TailDir = 'none' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

export interface BubbleStyle {
  shape: BubbleShape;
  fill: string;
  stroke: string;
  strokeWidth: number;
  tail: TailDir;
  /** Chiều dài đuôi, tỉ lệ so với bán kính bong bóng theo hướng đó (0.1–1.2). */
  tailSize: number;
  /** Lề trong thêm cho chữ, tỉ lệ so với cạnh rect (0–0.4). */
  padding: number;
}

export interface RegionTextStyle {
  content: string;
  color: string;
  /** Chuỗi font-family hợp lệ cho CSS/canvas, vd `"Be Vietnam Pro", sans-serif`. */
  fontFamily: string;
  fontSize: number;
  /** Tự co cỡ chữ cho vừa khung (bỏ qua `fontSize`). */
  autoFit: boolean;
  bold: boolean;
  italic: boolean;
  align: CanvasTextAlign;
  lineHeight: number;
  strokeColor: string;
  strokeWidth: number;
  /** Viết hoa toàn bộ — kiểu chữ thoại truyện tranh. */
  uppercase: boolean;
}

/**
 * Một VÙNG CHỌN độc lập trên ảnh (container). Mỗi vùng tự giữ khung, kiểu bong
 * bóng và chữ riêng → sửa vùng này không ảnh hưởng vùng khác. Các vùng chỉ được
 * "nung" (vẽ thật) vào ảnh khi người dùng bấm áp dụng hoặc khi xuất file.
 */
export interface EditRegion {
  id: string;
  name: string;
  rect: Rect;
  bubble: BubbleStyle;
  text: RegionTextStyle;
  visible: boolean;
}

/** Chế độ đổi màu trong vùng. */
export type RecolorMode =
  /** Chỉ pixel gần `target` trong ngưỡng → đổi sang màu mới. */
  | 'threshold'
  /** Tô đè TOÀN BỘ vùng bằng màu mới (đổi màu chắc chắn 100%). */
  | 'all'
  /** Đổi sang màu mới nhưng giữ độ đậm nhạt gốc (phù hợp vùng có bóng đổ). */
  | 'keepShade'
  /** Xoá màu chỉ định rồi lấp bằng PIXEL LÂN CẬN (inpaint). */
  | 'inpaint';

/**
 * Danh sách font cho phần ghi chữ. Chỉ chọn các font **có bộ chữ tiếng Việt**
 * (hoặc font hệ thống) để chữ dịch không bị vỡ dấu — đây là công cụ cho
 * translator Việt nên đó là ràng buộc bắt buộc, không phải tuỳ thích.
 */
export const FONT_GROUPS: { label: string; fonts: { label: string; css: string }[] }[] = [
  {
    label: 'Thoại (dễ đọc)',
    fonts: [
      { label: 'Be Vietnam Pro', css: '"Be Vietnam Pro", sans-serif' },
      { label: 'Nunito', css: '"Nunito", sans-serif' },
      { label: 'Quicksand', css: '"Quicksand", sans-serif' },
      { label: 'Baloo 2 (bo tròn)', css: '"Baloo 2", cursive' },
    ],
  },
  {
    label: 'SFX / hô lớn',
    fonts: [
      { label: 'Anton (đậm, dẹt)', css: '"Anton", sans-serif' },
      { label: 'Bebas Neue (cao, hẹp)', css: '"Bebas Neue", sans-serif' },
      { label: 'Oswald (hẹp)', css: '"Oswald", sans-serif' },
      { label: 'Coiny (mập, vui)', css: '"Coiny", cursive' },
    ],
  },
  {
    label: 'Viết tay / nội tâm',
    fonts: [
      { label: 'Patrick Hand', css: '"Patrick Hand", cursive' },
      { label: 'Mali', css: '"Mali", cursive' },
      { label: 'Itim', css: '"Itim", cursive' },
      { label: 'Sriracha', css: '"Sriracha", cursive' },
      { label: 'Charmonman (thư pháp)', css: '"Charmonman", cursive' },
    ],
  },
  {
    label: 'Trang trí / tiêu đề',
    fonts: [
      { label: 'Lobster', css: '"Lobster", cursive' },
      { label: 'Pacifico', css: '"Pacifico", cursive' },
      { label: 'Dancing Script', css: '"Dancing Script", cursive' },
    ],
  },
  {
    label: 'Hệ thống (không cần tải)',
    fonts: [
      { label: 'Arial', css: 'Arial, sans-serif' },
      { label: 'Tahoma', css: 'Tahoma, sans-serif' },
      { label: 'Verdana', css: 'Verdana, sans-serif' },
      { label: 'Georgia', css: 'Georgia, serif' },
      { label: 'Times New Roman', css: '"Times New Roman", serif' },
      { label: 'Comic Sans MS', css: '"Comic Sans MS", cursive' },
      { label: 'Impact', css: 'Impact, sans-serif' },
      { label: 'Courier New', css: '"Courier New", monospace' },
    ],
  },
];

/** Link Google Fonts cho các font ở trên — nạp LAZY khi mở trang sửa ảnh. */
export const EDITOR_FONTS_HREF =
  'https://fonts.googleapis.com/css2'
  + '?family=Anton'
  + '&family=Baloo+2:wght@500;700;800'
  + '&family=Be+Vietnam+Pro:ital,wght@0,400;0,700;1,400;1,700'
  + '&family=Bebas+Neue'
  + '&family=Charmonman:wght@400;700'
  + '&family=Coiny'
  + '&family=Dancing+Script:wght@400;700'
  + '&family=Itim'
  + '&family=Lobster'
  + '&family=Mali:ital,wght@0,400;0,700;1,400;1,700'
  + '&family=Nunito:ital,wght@0,400;0,800;1,400;1,800'
  + '&family=Oswald:wght@400;700'
  + '&family=Pacifico'
  + '&family=Patrick+Hand'
  + '&family=Quicksand:wght@400;700'
  + '&family=Sriracha'
  + '&display=swap';

/** Góc (radian) ứng với từng hướng đuôi bong bóng — trục y hướng XUỐNG. */
const TAIL_ANGLE: Record<Exclude<TailDir, 'none'>, number> = {
  e: 0,
  se: Math.PI / 4,
  s: Math.PI / 2,
  sw: (3 * Math.PI) / 4,
  w: Math.PI,
  nw: (-3 * Math.PI) / 4,
  n: -Math.PI / 2,
  ne: -Math.PI / 4,
};

/** Số điểm lấy mẫu khi rời rạc hoá đường viền bong bóng. */
const OUTLINE_SAMPLES = 240;

@Injectable({ providedIn: 'root' })
export class ImageEditService {

  // ── Màu ────────────────────────────────────────────────────────────────────

  rgbToHex({ r, g, b }: Rgb): string {
    const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return `#${h(r)}${h(g)}${h(b)}`;
  }

  hexToRgb(hex: string): Rgb {
    const s = hex.replace('#', '').trim();
    const full = s.length === 3 ? s.split('').map(c => c + c).join('') : s;
    const n = parseInt(full, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  /** Màu tại 1 điểm (dùng cho eyedropper). */
  sampleColor(ctx: CanvasRenderingContext2D, x: number, y: number): Rgb {
    const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
    return { r: d[0], g: d[1], b: d[2] };
  }

  /**
   * Bảng màu của các VÙNG LÂN CẬN quanh selection — translator tham khảo để tô
   * đúng tông nền khi xoá SFX / ghi đè chữ.
   *
   * Cách lấy: quét một "viền" dày `ring` px ngay BÊN NGOÀI rect (không lấy pixel
   * bên trong, vì bên trong là phần sắp bị thay), lượng tử hoá màu về bậc `step`
   * để gom các sắc gần nhau, rồi trả về các màu phổ biến nhất.
   */
  neighborPalette(
    ctx: CanvasRenderingContext2D,
    rect: Rect,
    canvasW: number,
    canvasH: number,
    opts: { ring?: number; step?: number; max?: number } = {},
  ): Swatch[] {
    const ring = opts.ring ?? 12;
    const step = opts.step ?? 16;
    const max = opts.max ?? 8;

    const outer = {
      x: Math.max(0, Math.floor(rect.x - ring)),
      y: Math.max(0, Math.floor(rect.y - ring)),
      w: 0, h: 0,
    };
    const right = Math.min(canvasW, Math.ceil(rect.x + rect.w + ring));
    const bottom = Math.min(canvasH, Math.ceil(rect.y + rect.h + ring));
    outer.w = right - outer.x;
    outer.h = bottom - outer.y;
    if (outer.w <= 0 || outer.h <= 0) return [];

    const data = ctx.getImageData(outer.x, outer.y, outer.w, outer.h).data;
    const inner = { x0: rect.x - outer.x, y0: rect.y - outer.y, x1: rect.x + rect.w - outer.x, y1: rect.y + rect.h - outer.y };

    const buckets = new Map<string, { rgb: Rgb; count: number }>();
    for (let y = 0; y < outer.h; y++) {
      for (let x = 0; x < outer.w; x++) {
        // Bỏ qua pixel nằm TRONG selection — chỉ quan tâm vùng xung quanh.
        if (x >= inner.x0 && x < inner.x1 && y >= inner.y0 && y < inner.y1) continue;
        const i = (y * outer.w + x) * 4;
        if (data[i + 3] < 8) continue; // bỏ pixel gần như trong suốt
        const qr = Math.round(data[i] / step) * step;
        const qg = Math.round(data[i + 1] / step) * step;
        const qb = Math.round(data[i + 2] / step) * step;
        const key = `${qr},${qg},${qb}`;
        const hit = buckets.get(key);
        if (hit) hit.count++;
        else buckets.set(key, { rgb: { r: qr, g: qg, b: qb }, count: 1 });
      }
    }

    return Array.from(buckets.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, max)
      .map(b => ({ hex: this.rgbToHex(b.rgb), rgb: b.rgb, count: b.count }));
  }

  /** Màu chiếm ưu thế của vùng lân cận — dùng cho "xoá SFX tự động". */
  dominantNeighborColor(
    ctx: CanvasRenderingContext2D, rect: Rect, canvasW: number, canvasH: number,
  ): Rgb | null {
    return this.neighborPalette(ctx, rect, canvasW, canvasH, { max: 1 })[0]?.rgb ?? null;
  }

  // ── Thao tác trên vùng chọn ────────────────────────────────────────────────

  /** Tô kín vùng chọn bằng 1 màu (xoá SFX / xoá chữ cũ). */
  fillRect(ctx: CanvasRenderingContext2D, rect: Rect, color: string): void {
    ctx.save();
    ctx.fillStyle = color;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
  }

  /**
   * Chức năng: Đổi màu TRONG vùng chọn theo nhiều chế độ. Chế độ `threshold` cũ
   *   hay để sót viền răng cưa (pixel trung gian giữa chữ và nền) khiến người
   *   dùng thấy "đổi không hết màu" → mặc định bật `soft`: pixel nằm trong vùng
   *   đệm quanh ngưỡng sẽ được TRỘN theo tỉ lệ thay vì bỏ qua hoàn toàn.
   * Yêu cầu: `rect` nằm trong canvas, w/h > 0; `tolerance` 0–255 (khoảng cách
   *   Euclid trong không gian RGB); `mode` mặc định `threshold`.
   * Kết quả trả về: không (ghi thẳng pixel vào `ctx`).
   * Exception: không ném — rect rỗng thì bỏ qua.
   */
  recolorRegion(
    ctx: CanvasRenderingContext2D, rect: Rect,
    target: Rgb, replacement: Rgb, tolerance: number,
    opts: { mode?: RecolorMode; soft?: boolean } = {},
  ): void {
    if (rect.w <= 0 || rect.h <= 0) return;
    const mode = opts.mode ?? 'threshold';
    const soft = opts.soft ?? true;

    if (mode === 'all') { this.fillRect(ctx, rect, this.rgbToHex(replacement)); return; }

    const img = ctx.getImageData(rect.x, rect.y, rect.w, rect.h);
    const d = img.data;

    if (mode === 'keepShade') {
      // Giữ độ sáng gốc, chỉ đổi sắc → vùng có bóng đổ vẫn ra đúng màu chọn.
      for (let i = 0; i < d.length; i += 4) {
        const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
        d[i] = replacement.r * lum;
        d[i + 1] = replacement.g * lum;
        d[i + 2] = replacement.b * lum;
      }
      ctx.putImageData(img, rect.x, rect.y);
      return;
    }

    // threshold: trong ngưỡng → thay hẳn; ngoài ngưỡng nhưng trong vùng đệm →
    // trộn dần để không còn viền màu cũ sót lại.
    const hard = tolerance * tolerance;
    const softLimit = soft ? (tolerance * 1.6) * (tolerance * 1.6) : hard;
    for (let i = 0; i < d.length; i += 4) {
      const dr = d[i] - target.r, dg = d[i + 1] - target.g, db = d[i + 2] - target.b;
      const dist = dr * dr + dg * dg + db * db;
      if (dist <= hard) {
        d[i] = replacement.r; d[i + 1] = replacement.g; d[i + 2] = replacement.b;
      } else if (dist <= softLimit) {
        const t = 1 - (Math.sqrt(dist) - tolerance) / (tolerance * 0.6 || 1);
        const k = Math.max(0, Math.min(1, t));
        d[i] += (replacement.r - d[i]) * k;
        d[i + 1] += (replacement.g - d[i + 1]) * k;
        d[i + 2] += (replacement.b - d[i + 2]) * k;
      }
    }
    ctx.putImageData(img, rect.x, rect.y);
  }

  /**
   * Chức năng: XOÁ một màu chỉ định trong vùng chọn rồi LẤP bằng pixel lân cận
   *   (inpaint kiểu lan toả) — dùng để bóc chữ/SFX khỏi nền có hoạ tiết mà không
   *   để lại mảng màu phẳng như khi tô đè.
   *   Cách làm: đánh dấu pixel trùng màu (có nới biên để nuốt răng cưa), rồi lặp
   *   nhiều lượt, mỗi lượt gán cho pixel bị đánh dấu trung bình màu của các
   *   hàng xóm CHƯA bị đánh dấu — màu từ ngoài viền lan dần vào giữa.
   * Yêu cầu: `rect` trong canvas; `target` là màu cần xoá; `tolerance` 0–255;
   *   `canvasW/canvasH` để lấy thêm viền ngoài làm nguồn màu; `expand` số px nới
   *   biên vùng bị xoá (mặc định 1); `fallback` màu dùng khi không còn hàng xóm
   *   hợp lệ (mặc định lấy màu lân cận chiếm ưu thế).
   * Kết quả trả về: số pixel đã xoá/lấp (0 nếu không khớp pixel nào).
   * Exception: không ném — rect rỗng trả về 0.
   */
  removeColorInRegion(
    ctx: CanvasRenderingContext2D, rect: Rect,
    target: Rgb, tolerance: number,
    canvasW: number, canvasH: number,
    opts: { expand?: number; ring?: number; fallback?: Rgb } = {},
  ): number {
    if (rect.w <= 0 || rect.h <= 0) return 0;
    const expand = Math.max(0, Math.round(opts.expand ?? 1));
    const ring = Math.max(2, Math.round(opts.ring ?? 10));

    // Lấy thêm một viền ngoài rect làm "nguồn màu sạch" cho quá trình lan toả.
    const ox = Math.max(0, Math.floor(rect.x - ring));
    const oy = Math.max(0, Math.floor(rect.y - ring));
    const ow = Math.min(canvasW, Math.ceil(rect.x + rect.w + ring)) - ox;
    const oh = Math.min(canvasH, Math.ceil(rect.y + rect.h + ring)) - oy;
    if (ow <= 0 || oh <= 0) return 0;

    const img = ctx.getImageData(ox, oy, ow, oh);
    const d = img.data;
    const inner = {
      x0: Math.max(0, Math.floor(rect.x) - ox),
      y0: Math.max(0, Math.floor(rect.y) - oy),
      x1: Math.min(ow, Math.ceil(rect.x + rect.w) - ox),
      y1: Math.min(oh, Math.ceil(rect.y + rect.h) - oy),
    };

    const limit = tolerance * tolerance;
    let mask = new Uint8Array(ow * oh);
    let count = 0;
    for (let y = inner.y0; y < inner.y1; y++) {
      for (let x = inner.x0; x < inner.x1; x++) {
        const i = (y * ow + x) * 4;
        const dr = d[i] - target.r, dg = d[i + 1] - target.g, db = d[i + 2] - target.b;
        if (dr * dr + dg * dg + db * db <= limit) { mask[y * ow + x] = 1; count++; }
      }
    }
    if (count === 0) return 0;

    // Nới biên: răng cưa quanh nét chữ không bao giờ khớp đúng ngưỡng, không nới
    // thì luôn còn viền xám mờ sau khi xoá.
    for (let k = 0; k < expand; k++) mask = this.dilateMask(mask, ow, oh, inner);

    this.diffuseFill(d, ow, oh, mask, opts.fallback ?? this.dominantNeighborColor(ctx, rect, canvasW, canvasH));
    ctx.putImageData(img, ox, oy);
    return count;
  }

  /** Nở mặt nạ 1 px (8 hướng), chỉ trong phạm vi `inner` để không đụng viền nguồn. */
  private dilateMask(
    mask: Uint8Array, w: number, h: number,
    inner: { x0: number; y0: number; x1: number; y1: number },
  ): Uint8Array {
    const out = new Uint8Array(mask);
    for (let y = inner.y0; y < inner.y1; y++) {
      for (let x = inner.x0; x < inner.x1; x++) {
        if (mask[y * w + x]) continue;
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            if (mask[ny * w + nx]) { near = true; break; }
          }
        }
        if (near) out[y * w + x] = 1;
      }
    }
    return out;
  }

  /**
   * Lan màu từ ngoài vào: mỗi lượt, pixel bị mask có hàng xóm "sạch" sẽ nhận
   * trung bình màu các hàng xóm đó rồi trở thành sạch. Lặp đến khi hết mask.
   */
  private diffuseFill(
    d: Uint8ClampedArray, w: number, h: number, mask: Uint8Array, fallback: Rgb | null,
  ): void {
    let remaining = mask.reduce((s, v) => s + v, 0);
    let guard = 0;
    const maxPass = w + h + 8; // đủ để lan qua vùng rộng nhất

    while (remaining > 0 && guard++ < maxPass) {
      const done: number[] = [];
      const vals: number[] = [];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const p = y * w + x;
          if (!mask[p]) continue;
          let r = 0, g = 0, b = 0, n = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx, ny = y + dy;
              if ((dx === 0 && dy === 0) || nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
              if (mask[ny * w + nx]) continue;
              const i = (ny * w + nx) * 4;
              r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
            }
          }
          if (n === 0) continue;
          done.push(p);
          vals.push(r / n, g / n, b / n);
        }
      }
      if (done.length === 0) break; // không lan thêm được nữa

      for (let k = 0; k < done.length; k++) {
        const i = done[k] * 4;
        d[i] = vals[k * 3];
        d[i + 1] = vals[k * 3 + 1];
        d[i + 2] = vals[k * 3 + 2];
        d[i + 3] = 255;
        mask[done[k]] = 0;
      }
      remaining -= done.length;
    }

    // Vùng bị bao kín hoàn toàn (không có hàng xóm sạch nào) → tô màu dự phòng.
    if (remaining > 0 && fallback) {
      for (let p = 0; p < mask.length; p++) {
        if (!mask[p]) continue;
        const i = p * 4;
        d[i] = fallback.r; d[i + 1] = fallback.g; d[i + 2] = fallback.b; d[i + 3] = 255;
      }
    }
  }

  // ── Bong bóng hội thoại ────────────────────────────────────────────────────

  /**
   * Chức năng: Bán kính đường viền bong bóng tại góc `th` (toạ độ cực, tâm là
   *   tâm rect). Mọi hình đều mô tả bằng r(θ) nên phần vẽ và phần gắn đuôi chỉ
   *   cần một đoạn code chung.
   * Yêu cầu: `rx`, `ry` > 0; `th` radian.
   * Kết quả trả về: bán kính (px) — luôn ≤ max(rx, ry) để bong bóng nằm gọn
   *   trong khung vùng chọn.
   * Exception: không ném.
   */
  private shapeRadius(shape: BubbleShape, rx: number, ry: number, th: number): number {
    switch (shape) {
      case 'rect': {
        const c = Math.abs(Math.cos(th)), s = Math.abs(Math.sin(th));
        return Math.min(c < 1e-6 ? Infinity : rx / c, s < 1e-6 ? Infinity : ry / s);
      }
      case 'round':
        return this.superellipse(rx, ry, th, 5);
      case 'wobble':
        // Viền hơi gợn — giống nét vẽ tay, dùng cho thoại run/yếu.
        return this.superellipse(rx, ry, th, 2) * (0.95 + 0.05 * Math.sin(9 * th + 0.9));
      case 'cloud': {
        // Vỏ sò 14 bướu → bong bóng suy nghĩ.
        const bumps = 14;
        return this.superellipse(rx, ry, th, 2) * (0.86 + 0.14 * Math.abs(Math.sin((bumps * th) / 2)));
      }
      case 'spike': {
        // Răng cưa xen kẽ dài/ngắn → bong bóng hét.
        const spikes = 16;
        const seg = (th + Math.PI) / (Math.PI / spikes);
        const j = Math.floor(seg), t = seg - j;
        const a = j % 2 === 0 ? 1 : 0.66;
        const b = j % 2 === 0 ? 0.66 : 1;
        return this.superellipse(rx, ry, th, 2) * (a + (b - a) * t);
      }
      case 'ellipse':
      default:
        return this.superellipse(rx, ry, th, 2);
    }
  }

  /** Bán kính của siêu-ellipse |x/rx|^n + |y/ry|^n = 1 tại góc `th` (n=2 → ellipse). */
  private superellipse(rx: number, ry: number, th: number, n: number): number {
    const c = Math.abs(Math.cos(th)), s = Math.abs(Math.sin(th));
    return 1 / Math.pow(Math.pow(c / rx, n) + Math.pow(s / ry, n), 1 / n);
  }

  /**
   * Chức năng: Rời rạc hoá đường viền bong bóng thành mảng điểm, đã CHÈN đuôi
   *   (nếu có) vào đúng chỗ để viền và đuôi là MỘT đường khép kín — nhờ vậy nét
   *   viền không bị cắt ngang chân đuôi.
   * Yêu cầu: `rect` w/h > 0.
   * Kết quả trả về: mảng điểm theo chiều kim đồng hồ, dùng để `lineTo`.
   * Exception: không ném.
   */
  private bubbleOutline(rect: Rect, style: BubbleStyle): { x: number; y: number }[] {
    const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
    const rx = Math.max(1, rect.w / 2), ry = Math.max(1, rect.h / 2);
    const n = OUTLINE_SAMPLES;

    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      const th = (i / n) * Math.PI * 2 - Math.PI;
      const r = this.shapeRadius(style.shape, rx, ry, th);
      pts.push({ x: cx + r * Math.cos(th), y: cy + r * Math.sin(th) });
    }

    // Bong bóng suy nghĩ dùng "bong bóng con" thay cho đuôi nhọn → không chèn.
    if (style.tail === 'none' || style.shape === 'cloud') return pts;

    const dir = TAIL_ANGLE[style.tail];
    const rDir = this.shapeRadius(style.shape, rx, ry, dir);
    const len = 1 + Math.max(0.05, Math.min(1.2, style.tailSize));
    const tip = { x: cx + rDir * len * Math.cos(dir), y: cy + rDir * len * Math.sin(dir) };

    const i0 = ((Math.round(((dir + Math.PI) / (Math.PI * 2)) * n) % n) + n) % n;
    const half = Math.max(2, Math.round(n * 0.05)); // bề rộng chân đuôi

    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      const raw = Math.abs(i - i0);
      const dist = Math.min(raw, n - raw);
      if (dist < half) { if (i === i0) out.push(tip); continue; }
      out.push(pts[i]);
    }
    return out;
  }

  /**
   * Chức năng: Vẽ khung bong bóng (nền + viền + đuôi) cho một vùng.
   * Yêu cầu: `rect` w/h > 0; `style.shape !== 'none'` mới vẽ.
   * Kết quả trả về: không (vẽ thẳng lên `ctx`).
   * Exception: không ném.
   */
  drawBubble(ctx: CanvasRenderingContext2D, rect: Rect, style: BubbleStyle): void {
    if (style.shape === 'none' || rect.w <= 0 || rect.h <= 0) return;
    const pts = this.bubbleOutline(rect, style);

    ctx.save();
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    if (style.fill && style.fill !== 'transparent') { ctx.fillStyle = style.fill; ctx.fill(); }
    if (style.strokeWidth > 0) {
      ctx.lineWidth = style.strokeWidth;
      ctx.strokeStyle = style.stroke;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }

    if (style.shape === 'cloud' && style.tail !== 'none') this.drawThoughtDots(ctx, rect, style);
    ctx.restore();
  }

  /** Đuôi của bong bóng suy nghĩ: 3 bong bóng con nhỏ dần theo hướng đuôi. */
  private drawThoughtDots(ctx: CanvasRenderingContext2D, rect: Rect, style: BubbleStyle): void {
    const dir = TAIL_ANGLE[style.tail as Exclude<TailDir, 'none'>];
    const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
    const rx = Math.max(1, rect.w / 2), ry = Math.max(1, rect.h / 2);
    const base = this.shapeRadius('ellipse', rx, ry, dir);
    const reach = base * Math.max(0.05, Math.min(1.2, style.tailSize));
    const unit = Math.min(rx, ry);

    for (let i = 1; i <= 3; i++) {
      const t = i / 3;
      const r = unit * 0.22 * (1 - t * 0.55);
      const dist = base + reach * t;
      ctx.beginPath();
      ctx.ellipse(cx + dist * Math.cos(dir), cy + dist * Math.sin(dir), r, r, 0, 0, Math.PI * 2);
      if (style.fill && style.fill !== 'transparent') { ctx.fillStyle = style.fill; ctx.fill(); }
      if (style.strokeWidth > 0) {
        ctx.lineWidth = style.strokeWidth;
        ctx.strokeStyle = style.stroke;
        ctx.stroke();
      }
    }
  }

  /**
   * Chức năng: Khung chữ nằm gọn BÊN TRONG bong bóng. Hình tròn/gai chỉ chứa
   *   được một hình chữ nhật nội tiếp nhỏ hơn khung ngoài nên phải thu vào,
   *   nếu không chữ sẽ tràn ra ngoài viền.
   * Yêu cầu: `rect` w/h > 0.
   * Kết quả trả về: rect toạ độ ảnh gốc, tối thiểu 4×4 px.
   * Exception: không ném.
   */
  textRect(rect: Rect, style: BubbleStyle): Rect {
    const inset: Record<BubbleShape, number> = {
      none: 0.01, rect: 0.04, round: 0.06, ellipse: 0.15, wobble: 0.15, cloud: 0.17, spike: 0.22,
    };
    const k = inset[style.shape] + Math.max(0, Math.min(0.4, style.padding));
    const px = rect.w * k, py = rect.h * k;
    return {
      x: rect.x + px,
      y: rect.y + py,
      w: Math.max(4, rect.w - px * 2),
      h: Math.max(4, rect.h - py * 2),
    };
  }

  // ── Chữ ────────────────────────────────────────────────────────────────────

  /** Chuỗi `font` cho canvas theo style hiện tại. */
  private fontOf(style: { bold?: boolean; italic?: boolean; fontFamily: string }, size: number): string {
    return `${style.italic ? 'italic ' : ''}${style.bold ? 'bold ' : ''}${size}px ${style.fontFamily}`;
  }

  /** Ngắt dòng theo chiều rộng `maxW`, tôn trọng ký tự xuống dòng người dùng gõ. */
  private wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
    const lines: string[] = [];
    for (const paragraph of text.split('\n')) {
      let current = '';
      for (const word of paragraph.split(/\s+/)) {
        const next = current ? `${current} ${word}` : word;
        if (ctx.measureText(next).width <= maxW || !current) current = next;
        else { lines.push(current); current = word; }
      }
      lines.push(current);
    }
    return lines;
  }

  /**
   * Chức năng: Tìm cỡ chữ LỚN NHẤT mà toàn bộ nội dung vẫn nằm trong `rect`
   *   (dùng cho chế độ tự co — bong bóng nhỏ thì chữ tự nhỏ theo).
   * Yêu cầu: `rect` w/h > 0; `text` đã trim; `ctx` sẽ bị đổi `font` tạm thời.
   * Kết quả trả về: cỡ chữ (px) trong khoảng 6–260.
   * Exception: không ném.
   */
  fitFontSize(
    ctx: CanvasRenderingContext2D, rect: Rect, text: string,
    style: { bold?: boolean; italic?: boolean; fontFamily: string; lineHeight?: number },
  ): number {
    const lh = style.lineHeight ?? 1.25;
    let lo = 6, hi = 260, best = 6;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      ctx.font = this.fontOf(style, mid);
      const lines = this.wrapLines(ctx, text, rect.w);
      const widest = Math.max(...lines.map(l => ctx.measureText(l).width));
      if (lines.length * mid * lh <= rect.h && widest <= rect.w) { best = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    return best;
  }

  /**
   * Vẽ chữ vào trong vùng chọn, tự ngắt dòng theo chiều rộng rect.
   * Trả về false nếu không có chữ để vẽ.
   */
  drawTextInRect(
    ctx: CanvasRenderingContext2D, rect: Rect, text: string,
    style: {
      color: string; fontSize: number; fontFamily: string;
      bold?: boolean; italic?: boolean; align?: CanvasTextAlign;
      lineHeight?: number; strokeColor?: string; strokeWidth?: number;
      uppercase?: boolean; autoFit?: boolean;
    },
  ): boolean {
    let content = (text ?? '').trim();
    if (!content) return false;
    if (style.uppercase) content = content.toUpperCase();

    const lineHeight = style.lineHeight ?? 1.25;
    const size = style.autoFit
      ? this.fitFontSize(ctx, rect, content, { ...style, lineHeight })
      : style.fontSize;

    ctx.save();
    ctx.font = this.fontOf(style, size);
    ctx.fillStyle = style.color;
    ctx.textBaseline = 'top';
    const align = style.align ?? 'center';
    ctx.textAlign = align;

    const lines = this.wrapLines(ctx, content, rect.w);
    const stepY = size * lineHeight;
    const totalH = stepY * lines.length;
    // Canh giữa theo chiều dọc trong rect.
    let y = rect.y + Math.max(0, (rect.h - totalH) / 2);
    const x = align === 'left' ? rect.x : align === 'right' ? rect.x + rect.w : rect.x + rect.w / 2;

    if (style.strokeColor && (style.strokeWidth ?? 0) > 0) {
      ctx.strokeStyle = style.strokeColor;
      ctx.lineWidth = style.strokeWidth!;
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
    }
    for (const line of lines) {
      if (style.strokeColor && (style.strokeWidth ?? 0) > 0) ctx.strokeText(line, x, y);
      ctx.fillText(line, x, y);
      y += stepY;
    }
    ctx.restore();
    return true;
  }

  /**
   * Chức năng: Vẽ TRỌN một vùng (bong bóng + chữ) lên ctx — dùng chung cho lớp
   *   xem trước và cho lúc nung vào ảnh, để cái nhìn thấy đúng bằng cái xuất ra.
   * Yêu cầu: `region.rect` w/h > 0.
   * Kết quả trả về: không.
   * Exception: không ném.
   */
  drawRegion(ctx: CanvasRenderingContext2D, region: EditRegion): void {
    if (!region.visible || region.rect.w <= 0 || region.rect.h <= 0) return;
    this.drawBubble(ctx, region.rect, region.bubble);
    const t = region.text;
    if (!t.content.trim()) return;
    this.drawTextInRect(ctx, this.textRect(region.rect, region.bubble), t.content, {
      color: t.color,
      fontSize: t.fontSize,
      fontFamily: t.fontFamily,
      bold: t.bold,
      italic: t.italic,
      align: t.align,
      lineHeight: t.lineHeight,
      uppercase: t.uppercase,
      autoFit: t.autoFit,
      strokeColor: t.strokeWidth > 0 ? t.strokeColor : undefined,
      strokeWidth: t.strokeWidth,
    });
  }

  // ── Cắt ảnh thành nhiều phần ───────────────────────────────────────────────

  /**
   * Chức năng: Chia một trục thành các đoạn dài `part`. Đoạn cuối ngắn hơn
   *   `minTail` sẽ gộp vào đoạn trước để không sinh mảnh vụn vài pixel.
   * Yêu cầu: `total` > 0; `part` ≤ 0 hoặc ≥ total nghĩa là KHÔNG chia trục này.
   * Kết quả trả về: mảng `{start, size}` phủ kín trục, không chồng lấn.
   * Exception: không ném.
   */
  private axisSpans(total: number, part: number, minTail: number): { start: number; size: number }[] {
    const p = Math.floor(part);
    if (!p || p <= 0 || p >= total) return [{ start: 0, size: total }];
    const spans: { start: number; size: number }[] = [];
    for (let v = 0; v < total; v += p) spans.push({ start: v, size: Math.min(p, total - v) });
    if (spans.length > 1 && spans[spans.length - 1].size < minTail) {
      const last = spans.pop()!;
      spans[spans.length - 1].size += last.size;
    }
    return spans;
  }

  /**
   * Chức năng: Chia ảnh thành lưới theo CẢ chiều rộng và chiều cao. Truyện
   *   manhwa chỉ cần cắt ngang, nhưng ảnh scan 2 trang / poster khổ lớn thì phải
   *   cắt được cả theo cột.
   * Yêu cầu: `width/height` > 0; `partWidth`/`partHeight` = 0 nghĩa là giữ
   *   nguyên trục đó; `minTail` px tối thiểu của mảnh cuối.
   * Kết quả trả về: mảng Rect theo thứ tự trái→phải, trên→dưới.
   * Exception: không ném.
   */
  splitGrid(
    width: number, height: number, partWidth: number, partHeight: number, minTail = 40,
  ): Rect[] {
    const cols = this.axisSpans(width, partWidth, minTail);
    const rows = this.axisSpans(height, partHeight, minTail);
    const out: Rect[] = [];
    for (const r of rows) {
      for (const c of cols) out.push({ x: c.start, y: r.start, w: c.size, h: r.size });
    }
    return out;
  }

  /** Chia ảnh theo chiều CAO (giữ lại cho code cũ — nay là ca riêng của lưới). */
  splitRects(width: number, height: number, partHeight: number, minTail = 40): Rect[] {
    return this.splitGrid(width, height, 0, partHeight, minTail);
  }

  // ── Xuất file ──────────────────────────────────────────────────────────────

  canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality = 0.92): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), type, quality);
    });
  }

  /** Cắt `source` theo danh sách rect → mảng Blob theo đúng thứ tự. */
  async sliceToBlobs(
    source: HTMLCanvasElement, rects: Rect[], type = 'image/png', quality = 0.92,
  ): Promise<Blob[]> {
    const out: Blob[] = [];
    const tmp = document.createElement('canvas');
    const tctx = tmp.getContext('2d')!;
    for (const r of rects) {
      tmp.width = r.w;
      tmp.height = r.h;
      tctx.clearRect(0, 0, r.w, r.h);
      tctx.drawImage(source, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      out.push(await this.canvasToBlob(tmp, type, quality));
    }
    return out;
  }

  /** Gói nhiều blob thành 1 zip (dùng JSZip đã có trong project). */
  async zipBlobs(files: { name: string; blob: Blob }[]): Promise<Blob> {
    const zip = new JSZip();
    for (const f of files) zip.file(f.name, f.blob);
    return zip.generateAsync({ type: 'blob' });
  }

  /** Kích hoạt tải file về máy. */
  download(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    // Nhả URL sau khi browser kịp bắt đầu tải.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  extensionOf(type: string): string {
    return type === 'image/jpeg' ? 'jpg' : type === 'image/webp' ? 'webp' : 'png';
  }

  /**
   * Chức năng: Nạp stylesheet Google Fonts cho trình sửa ảnh — nạp LAZY tại đây
   *   thay vì `index.html` để người đọc truyện không phải tải font họ không dùng.
   * Yêu cầu: chạy trong browser; gọi bao nhiêu lần cũng được (tự chống trùng).
   * Kết quả trả về: không.
   * Exception: không ném.
   */
  ensureEditorFonts(): void {
    const id = 'ie-editor-fonts';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = EDITOR_FONTS_HREF;
    document.head.appendChild(link);
  }

  /**
   * Chức năng: Đợi một font web tải xong. Canvas vẽ chữ NGAY khi font chưa sẵn
   *   sàng sẽ ra font dự phòng và không tự vẽ lại → phải chờ rồi mới render.
   * Yêu cầu: `family` là chuỗi font-family CSS; `size` px dùng để yêu cầu đúng
   *   biến thể.
   * Kết quả trả về: Promise luôn resolve (kể cả khi font lỗi) — không có giá trị.
   * Exception: không ném.
   */
  async waitFont(family: string, size = 40, bold = true): Promise<void> {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (!fonts?.load) return;
    try {
      await fonts.load(`${bold ? 'bold ' : ''}${size}px ${family}`);
      await fonts.load(`${size}px ${family}`);
    } catch {
      /* font lỗi thì cứ vẽ bằng font dự phòng */
    }
  }
}
