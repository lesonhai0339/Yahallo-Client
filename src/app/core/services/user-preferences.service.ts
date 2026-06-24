import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type ReadProgressMode = 'off' | 'ask' | 'always';

export type ListView = 'list' | 'grid';

export interface UserPreferences {
  /** off = don't track; ask = prompt to resume; always = jump straight to last page */
  readProgressMode: ReadProgressMode;
  /** Drop progress entries not updated within this many days (0 = keep forever). */
  retentionDays: number;
  /** Max number of manga progress entries kept locally (subscription lever later). */
  maxEntries: number;
  /** Default items-per-page on paginated lists. */
  defaultPageSize: number;
  /** Default item layout (list/grid) on paginated lists. */
  defaultView: ListView;
}

const STORAGE_KEY = 'yhl_prefs';

const DEFAULTS: UserPreferences = {
  readProgressMode: 'ask',
  retentionDays: 90,
  maxEntries: 100,
  defaultPageSize: 20,
  defaultView: 'grid',
};

@Injectable({ providedIn: 'root' })
export class UserPreferencesService {
  private subject = new BehaviorSubject<UserPreferences>(this.load());
  prefs$ = this.subject.asObservable();

  get current(): UserPreferences {
    return this.subject.value;
  }

  /**
   * True once the user has any locally-saved prefs. Used so that pagination
   * tweaks made outside the settings page (list/grid, page size) — which are
   * local-only "temp" overrides — win over the server snapshot on the next load.
   */
  get hasStored(): boolean {
    return localStorage.getItem(STORAGE_KEY) !== null;
  }

  private load(): UserPreferences {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
    } catch {
      return { ...DEFAULTS };
    }
  }

  update(patch: Partial<UserPreferences>): void {
    const next = { ...this.subject.value, ...patch };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    this.subject.next(next);
  }

  reset(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULTS));
    this.subject.next({ ...DEFAULTS });
  }
}
