import { Directive, ElementRef, HostListener, Input } from '@angular/core';

@Directive({ selector: 'img[appImageFallback]' })
export class ImageFallbackDirective {
  @Input() appImageFallback = '/assets/placeholder-manga.jpg';

  constructor(private el: ElementRef<HTMLImageElement>) {}

  @HostListener('error')
  onError(): void {
    this.el.nativeElement.src = this.appImageFallback;
  }
}
