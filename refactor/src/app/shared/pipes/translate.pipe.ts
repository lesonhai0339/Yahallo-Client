import { ChangeDetectorRef, OnDestroy, Pipe, PipeTransform } from '@angular/core';
import { Subscription } from 'rxjs';
import { TranslationService } from '../../core/services/translation.service';

/**
 * Usage:
 *   {{ 'NAV.HOME' | translate }}
 *   {{ 'MANGA.CHAPTERS' | translate:{ count: '5' } }}
 *   [placeholder]="'NAV.SEARCH_PLACEHOLDER' | translate"
 *
 * pure: false — re-evaluates when the language changes.
 * We also subscribe to lang$ and force a ChangeDetectorRef.markForCheck()
 * so OnPush components update correctly.
 */
@Pipe({ name: 'translate', pure: false })
export class TranslatePipe implements PipeTransform, OnDestroy {
  private langSub: Subscription;
  private lastLang = '';
  private lastKey = '';
  private lastValue = '';

  constructor(
    private translation: TranslationService,
    private cdr: ChangeDetectorRef
  ) {
    this.langSub = this.translation.lang$.subscribe(() => {
      this.lastKey = '';        // invalidate cache so the next transform() recalculates
      this.cdr.markForCheck();
    });
  }

  transform(key: string, params?: Record<string, string>): string {
    const lang = this.translation.currentLang;
    // micro-cache: avoid redundant lookups when both key and lang are unchanged
    if (key === this.lastKey && lang === this.lastLang && !params) return this.lastValue;
    this.lastKey = key;
    this.lastLang = lang;
    this.lastValue = this.translation.get(key, params);
    return this.lastValue;
  }

  ngOnDestroy(): void {
    this.langSub.unsubscribe();
  }
}
