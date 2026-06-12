import {
  Component, Input, Output, EventEmitter,
  ViewChildren, QueryList, ElementRef,
  AfterViewInit, OnDestroy, OnChanges, SimpleChanges, HostListener
} from '@angular/core';
import { Subject } from 'rxjs';
import { ChapterImage } from '../../../core/models/chapter.interface';

@Component({
  selector: 'app-reader-viewer',
  templateUrl: './reader-viewer.component.html',
  styleUrls: ['./reader-viewer.component.scss']
})
export class ReaderViewerComponent implements AfterViewInit, OnDestroy, OnChanges {
  @Input() images: ChapterImage[] = [];
  @Input() initialPage = 0;
  @Input() direction: 'vertical' | 'horizontal' = 'vertical';
  @Input() horizontalDir: 'rtl' | 'ltr' = 'rtl';
  @Input() imageSize = 100;
  @Input() preloadCount = 3;
  @Output() pageChange = new EventEmitter<number>();

  @ViewChildren('pageRef') pageRefs!: QueryList<ElementRef>;

  currentPage = 0;
  visibleIndices = new Set<number>();

  private observer: IntersectionObserver | null = null;
  private visiblePages = new Set<number>();
  private hasScrolledToInitial = false;
  private destroy$ = new Subject<void>();
  private touchStartX = 0;
  private touchStartY = 0;
  private touchStartTime = 0;
  private readonly SWIPE_THRESHOLD = 50;
  private readonly SWIPE_TIME_LIMIT = 300;

  ngAfterViewInit(): void {
    this.pageRefs.changes.subscribe(() => {
      this.setupObserver();
      this.scrollToInitialIfNeeded();
    });

    if (this.pageRefs.length > 0) {
      this.setupObserver();
      this.scrollToInitialIfNeeded();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['images']) {
      this.hasScrolledToInitial = false;
      this.updateVisibleIndices();
    }
    if (changes['preloadCount'] || changes['images'] || changes['direction']) {
      this.updateVisibleIndices();
    }
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupObserver(): void {
    this.observer?.disconnect();
    this.visiblePages.clear();

    this.observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const page = parseInt(entry.target.getAttribute('data-page') || '0', 10);
        if (entry.isIntersecting) {
          this.visiblePages.add(page);
        } else {
          this.visiblePages.delete(page);
        }
      }

      if (this.visiblePages.size > 0) {
        const topPage = Math.min(...this.visiblePages);
        if (topPage !== this.currentPage) {
          this.currentPage = topPage;
          this.pageChange.emit(topPage);
          this.updateVisibleIndices();
        }
      }
    }, {
      threshold: 0.1
    });

    this.pageRefs.forEach(ref => {
      this.observer!.observe(ref.nativeElement);
    });
  }

  private updateVisibleIndices(): void {
    this.visibleIndices.clear();
    const behind = this.direction === 'horizontal' ? this.preloadCount : 1;
    const start = Math.max(0, this.currentPage - behind);
    const end = Math.min(this.images.length - 1, this.currentPage + this.preloadCount);
    for (let i = start; i <= end; i++) {
      this.visibleIndices.add(i);
    }
  }

  shouldLoad(index: number): boolean {
    return this.visibleIndices.has(index);
  }

  /**
   * Pages around the current one to warm in the background while in horizontal
   * mode (where only the current page is shown). Excludes the current page,
   * which is already rendered.
   */
  get preloadIndices(): number[] {
    const result: number[] = [];
    this.visibleIndices.forEach(i => {
      if (i !== this.currentPage && i >= 0 && i < this.images.length) result.push(i);
    });
    return result;
  }

  @HostListener('window:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    const isRtl = this.horizontalDir === 'rtl';
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.goToPage(isRtl ? 'prev' : 'next');
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.goToPage(isRtl ? 'next' : 'prev');
    }
  }

  onTouchStart(event: TouchEvent): void {
    if (event.touches.length !== 1) return;
    this.touchStartX = event.touches[0].clientX;
    this.touchStartY = event.touches[0].clientY;
    this.touchStartTime = Date.now();
  }

  onTouchEnd(event: TouchEvent): void {
    if (event.changedTouches.length !== 1) return;
    const dx = event.changedTouches[0].clientX - this.touchStartX;
    const dy = event.changedTouches[0].clientY - this.touchStartY;
    const dt = Date.now() - this.touchStartTime;

    if (Math.abs(dx) < this.SWIPE_THRESHOLD) return;
    if (Math.abs(dx) < Math.abs(dy)) return;
    if (dt > this.SWIPE_TIME_LIMIT) return;

    const isRtl = this.horizontalDir === 'rtl';
    if (dx > 0) {
      this.goToPage(isRtl ? 'next' : 'prev');
    } else {
      this.goToPage(isRtl ? 'prev' : 'next');
    }
  }

  goToPage(direction: 'prev' | 'next'): void {
    const target = direction === 'prev'
      ? Math.max(0, this.currentPage - 1)
      : Math.min(this.images.length - 1, this.currentPage + 1);
    if (this.direction === 'horizontal') {
      this.currentPage = target;
      this.pageChange.emit(target);
      this.updateVisibleIndices();
    } else {
      this.scrollToPage(target);
    }
  }

  private scrollToInitialIfNeeded(): void {
    if (this.hasScrolledToInitial || this.initialPage <= 0) return;

    // Horizontal mode shows a single page — jump currentPage to the saved index
    // so neighbours preload around it (same as the preload window).
    if (this.direction === 'horizontal') {
      if (this.images.length === 0) return;
      this.currentPage = Math.min(this.initialPage, this.images.length - 1);
      this.updateVisibleIndices();
      this.pageChange.emit(this.currentPage);
      this.hasScrolledToInitial = true;
      return;
    }

    if (this.pageRefs.length > this.initialPage) {
      setTimeout(() => {
        const el = this.pageRefs.toArray()[this.initialPage]?.nativeElement;
        if (el) {
          el.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
        }
      });
      this.hasScrolledToInitial = true;
    }
  }

  scrollToPage(index: number): void {
    if (this.direction === 'horizontal') {
      this.currentPage = Math.min(Math.max(0, index), this.images.length - 1);
      this.updateVisibleIndices();
      this.pageChange.emit(this.currentPage);
      return;
    }
    const el = this.pageRefs?.toArray()[index]?.nativeElement;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }
}
