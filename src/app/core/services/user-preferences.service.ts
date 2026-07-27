import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from './auth.service';
import { dropLegacyKey, scopedKey } from '../utils/user-storage';

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

/** Tiền tố key — key thật luôn kèm user-id (xem `core/utils/user-storage.ts`). */
const STORAGE_PREFIX = 'yhl_prefs';

const DEFAULTS: UserPreferences = {
  readProgressMode: 'ask',
  retentionDays: 90,
  maxEntries: 100,
  defaultPageSize: 20,
  defaultView: 'grid',
};

@Injectable({ providedIn: 'root' })
export class UserPreferencesService {
  // Khởi tạo bằng DEFAULTS chứ không đọc storage ngay tại field initializer:
  // lúc đó `this.auth` chưa chắc đã được gán nên chưa biết scope. Đọc thật ở
  // constructor, và đọc LẠI mỗi khi đổi tài khoản.
  private subject = new BehaviorSubject<UserPreferences>({ ...DEFAULTS });
  prefs$ = this.subject.asObservable();

  /** User-id của lần hydrate gần nhất — dùng để phát hiện đổi tài khoản. */
  private scope = '';

  constructor(private auth: AuthService) {
    dropLegacyKey(STORAGE_PREFIX);   // dọn key global của bản cũ
    this.hydrate();
    this.auth.auth$.subscribe(() => {
      const next = this.auth.currentUser?.id ?? '';
      if (next !== this.scope) this.hydrate();
    });
  }

  get current(): UserPreferences {
    return this.subject.value;
  }

  /**
   * True once the user has any locally-saved prefs. Used so that pagination
   * tweaks made outside the settings page (list/grid, page size) — which are
   * local-only "temp" overrides — win over the server snapshot on the next load.
   */
  get hasStored(): boolean {
    return localStorage.getItem(this.key()) !== null;
  }

  private key(): string {
    return scopedKey(STORAGE_PREFIX, this.auth.currentUser?.id);
  }

  /**
   * Chức năng: Nạp lại tuỳ chọn theo tài khoản đang đăng nhập (đăng nhập/đăng
   *   xuất đều phải đổi bộ tuỳ chọn, không dùng lại của người trước).
   * Yêu cầu: không.
   * Kết quả trả về: không (phát giá trị mới qua `prefs$`).
   * Exception: không ném — dữ liệu hỏng thì rơi về DEFAULTS.
   */
  private hydrate(): void {
    this.scope = this.auth.currentUser?.id ?? '';
    this.subject.next(this.load());
  }

  private load(): UserPreferences {
    try {
      const raw = localStorage.getItem(this.key());
      return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
    } catch {
      return { ...DEFAULTS };
    }
  }

  update(patch: Partial<UserPreferences>): void {
    const next = { ...this.subject.value, ...patch };
    localStorage.setItem(this.key(), JSON.stringify(next));
    this.subject.next(next);
  }

  reset(): void {
    localStorage.setItem(this.key(), JSON.stringify(DEFAULTS));
    this.subject.next({ ...DEFAULTS });
  }
}
