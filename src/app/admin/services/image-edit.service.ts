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
   * Đổi màu TRONG vùng chọn: pixel nào gần `target` (trong ngưỡng `tolerance`)
   * thì đổi sang `replacement`; các pixel khác giữ nguyên. Giữ nguyên alpha.
   *
   * `tolerance` 0–255 so trên khoảng cách Euclid trong không gian RGB.
   */
  recolorRegion(
    ctx: CanvasRenderingContext2D, rect: Rect,
    target: Rgb, replacement: Rgb, tolerance: number,
  ): void {
    if (rect.w <= 0 || rect.h <= 0) return;
    const img = ctx.getImageData(rect.x, rect.y, rect.w, rect.h);
    const d = img.data;
    // So bình phương để khỏi phải căn bậc hai mỗi pixel.
    const limit = tolerance * tolerance;
    for (let i = 0; i < d.length; i += 4) {
      const dr = d[i] - target.r, dg = d[i + 1] - target.g, db = d[i + 2] - target.b;
      if (dr * dr + dg * dg + db * db <= limit) {
        d[i] = replacement.r; d[i + 1] = replacement.g; d[i + 2] = replacement.b;
      }
    }
    ctx.putImageData(img, rect.x, rect.y);
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
    },
  ): boolean {
    const content = (text ?? '').trim();
    if (!content) return false;

    const lineHeight = style.lineHeight ?? 1.25;
    ctx.save();
    ctx.font = `${style.italic ? 'italic ' : ''}${style.bold ? 'bold ' : ''}${style.fontSize}px ${style.fontFamily}`;
    ctx.fillStyle = style.color;
    ctx.textBaseline = 'top';
    const align = style.align ?? 'center';
    ctx.textAlign = align;

    // Ngắt dòng: tôn trọng \n do người dùng nhập, rồi wrap theo từ.
    const lines: string[] = [];
    for (const paragraph of content.split('\n')) {
      let current = '';
      for (const word of paragraph.split(/\s+/)) {
        const next = current ? `${current} ${word}` : word;
        if (ctx.measureText(next).width <= rect.w || !current) current = next;
        else { lines.push(current); current = word; }
      }
      lines.push(current);
    }

    const stepY = style.fontSize * lineHeight;
    const totalH = stepY * lines.length;
    // Canh giữa theo chiều dọc trong rect.
    let y = rect.y + Math.max(0, (rect.h - totalH) / 2);
    const x = align === 'left' ? rect.x : align === 'right' ? rect.x + rect.w : rect.x + rect.w / 2;

    if (style.strokeColor && (style.strokeWidth ?? 0) > 0) {
      ctx.strokeStyle = style.strokeColor;
      ctx.lineWidth = style.strokeWidth!;
      ctx.lineJoin = 'round';
    }
    for (const line of lines) {
      if (style.strokeColor && (style.strokeWidth ?? 0) > 0) ctx.strokeText(line, x, y);
      ctx.fillText(line, x, y);
      y += stepY;
    }
    ctx.restore();
    return true;
  }

  // ── Cắt ảnh dài thành nhiều phần ───────────────────────────────────────────

  /**
   * Chia ảnh theo chiều CAO thành các dải liên tiếp.
   * Phần cuối nếu ngắn hơn `minTail` sẽ được gộp vào dải trước, tránh sinh ra
   * một mảnh vụn chỉ vài pixel.
   */
  splitRects(width: number, height: number, partHeight: number, minTail = 40): Rect[] {
    const h = Math.max(1, Math.floor(partHeight));
    const rects: Rect[] = [];
    for (let y = 0; y < height; y += h) {
      rects.push({ x: 0, y, w: width, h: Math.min(h, height - y) });
    }
    if (rects.length > 1) {
      const last = rects[rects.length - 1];
      if (last.h < minTail) {
        rects.pop();
        rects[rects.length - 1].h += last.h;
      }
    }
    return rects;
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
}
