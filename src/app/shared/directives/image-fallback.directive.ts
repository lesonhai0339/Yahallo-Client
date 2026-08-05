import { Directive, ElementRef, HostListener, Input } from '@angular/core';

@Directive({ selector: 'img[appImageFallback]' })
export class ImageFallbackDirective {
  /**
   * Phải trỏ tới file CÓ THẬT trong `src/assets`. Trước đây mặc định là
   * `/assets/placeholder-manga.jpg` — file không tồn tại — nên ảnh lỗi đổi sang
   * fallback rồi fallback cũng 404, guard bên dưới chặn lại và người dùng nhìn
   * thấy icon ảnh vỡ. Đổi asset thì nhớ kiểm tra lại dòng này.
   */
  @Input() appImageFallback = '/assets/sorry.jpg';

  constructor(private el: ElementRef<HTMLImageElement>) {}

  @HostListener('error')
  onError(): void {
    const el = this.el.nativeElement;
    // Chốt chặn vòng lặp: nếu src hiện tại đã là fallback (nghĩa là chính ảnh
    // fallback cũng lỗi, hoặc fallback rỗng) thì dừng — tránh error → set → error
    // lặp vô tận (đặc biệt khi src ban đầu là chuỗi rỗng).
    if (!this.appImageFallback || el.getAttribute('src') === this.appImageFallback) return;
    el.src = this.appImageFallback;
  }
}
