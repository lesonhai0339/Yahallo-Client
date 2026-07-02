import { Directive, ElementRef, HostListener, Input } from '@angular/core';

@Directive({ selector: 'img[appImageFallback]' })
export class ImageFallbackDirective {
  @Input() appImageFallback = '/assets/placeholder-manga.jpg';

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
