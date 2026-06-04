import {
  Component, Input, Output, EventEmitter,
  ViewChildren, QueryList, ElementRef,
  AfterViewInit, OnDestroy, OnChanges, SimpleChanges
} from '@angular/core';
import { Subject } from 'rxjs';
import { ChapterImage } from 'src/app/core/models/chapter.interface';

@Component({
  selector: 'app-reader-viewer',
  templateUrl: './reader-viewer.component.html',
  styleUrls: ['./reader-viewer.component.scss']
})
export class ReaderViewerComponent implements AfterViewInit, OnDestroy, OnChanges {
  @Input() images: ChapterImage[] = [];
  @Input() initialPage = 0;
  @Output() pageChange = new EventEmitter<number>();

  @ViewChildren('pageRef') pageRefs!: QueryList<ElementRef>;

  currentPage = 0;

  private observer: IntersectionObserver | null = null;
  private visiblePages = new Set<number>();
  private hasScrolledToInitial = false;
  private destroy$ = new Subject<void>();

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
        }
      }
    }, {
      threshold: 0.1
    });

    this.pageRefs.forEach(ref => {
      this.observer!.observe(ref.nativeElement);
    });
  }

  private scrollToInitialIfNeeded(): void {
    if (!this.hasScrolledToInitial && this.initialPage > 0 && this.pageRefs.length > this.initialPage) {
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
    const el = this.pageRefs?.toArray()[index]?.nativeElement;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }
}
