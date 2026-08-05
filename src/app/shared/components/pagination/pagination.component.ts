import {
  Component, EventEmitter, Input, Output, OnDestroy, HostListener,
  ViewChild, ElementRef, Inject, PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';

/**
 * Shared pagination bar: first / prev / page-window / next / last plus a
 * "jump to page" control. On mobile the page window shrinks (delta 1 → 3 pages)
 * and buttons wrap so the bar never exceeds the screen width.
 */
@Component({
  selector: 'app-pagination',
  templateUrl: './pagination.component.html',
  styleUrls: ['./pagination.component.scss'],
})
export class PaginationComponent implements OnDestroy {
  @Input() currentPage = 1;
  /** Fallback when totalCount/pageSize aren't supplied. */
  @Input() totalPages = 1;
  /** When both are given, the page count is derived as ceil(totalCount/pageSize). */
  @Input() totalCount?: number | null;
  @Input() pageSize?: number | null;
  /** Pin the bar to the bottom of its scroll container (e.g. search results). */
  @Input() sticky = false;
  @Output() pageChange = new EventEmitter<number>();

  @ViewChild('jumpInput') jumpInputRef?: ElementRef<HTMLInputElement>;

  /**
   * Server-side render không có `window`. Mặc định desktop rồi để `onResize()`
   * và constructor chỉnh lại ở phía client sau khi hydrate.
   */
  isMobile = false;
  jumping = false;
  jumpValue = '';

  private jump$ = new Subject<string>();
  private destroy$ = new Subject<void>();

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {
    if (isPlatformBrowser(this.platformId)) this.isMobile = window.innerWidth <= 768;
    // Commit the typed page 350ms after the user stops typing.
    this.jump$.pipe(debounceTime(350), takeUntil(this.destroy$))
      .subscribe(v => this.commitJump(v));
  }

  @HostListener('window:resize')
  onResize(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.isMobile = window.innerWidth <= 768;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Authoritative page count: derived from totalCount / pageSize when both are
   * provided (so it always matches the template's items-per-page), otherwise
   * falls back to the totalPages input.
   */
  get pageCount(): number {
    if (this.totalCount != null && this.pageSize) {
      return Math.max(1, Math.ceil(this.totalCount / this.pageSize));
    }
    return Math.max(1, this.totalPages || 1);
  }

  /** Visible page-number window around the current page. */
  get pages(): number[] {
    const delta = this.isMobile ? 1 : 2;
    const from = Math.max(1, this.currentPage - delta);
    const to = Math.min(this.pageCount, this.currentPage + delta);
    const arr: number[] = [];
    for (let i = from; i <= to; i++) arr.push(i);
    return arr;
  }

  go(page: number): void {
    if (page < 1 || page > this.pageCount || page === this.currentPage) return;
    this.pageChange.emit(page);
  }

  openJump(): void {
    this.jumping = true;
    this.jumpValue = '';
    setTimeout(() => this.jumpInputRef?.nativeElement.focus());
  }

  onJumpInput(value: string): void {
    // Keep digits only (only number and > 0).
    const digits = (value ?? '').replace(/\D/g, '');
    this.jumpValue = digits;
    this.jump$.next(digits);
  }

  closeJump(): void {
    this.jumping = false;
    this.jumpValue = '';
  }

  private commitJump(value: string): void {
    const n = Number(value);
    if (!value || !Number.isInteger(n) || n < 1) return;
    const target = Math.min(n, this.pageCount);
    this.closeJump();
    this.go(target);
  }
}
