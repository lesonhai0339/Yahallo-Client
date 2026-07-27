import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { dropLegacyKey, scopedKey } from '../utils/user-storage';

export type SupportedLang = 'vi' | 'en';

/** Tiền tố key — key thật kèm user-id (khách dùng `:guest`). */
const STORAGE_PREFIX = 'yhl_lang';
const DEFAULT_LANG: SupportedLang = 'vi';
const AVAILABLE_LANGS: SupportedLang[] = ['vi', 'en'];

@Injectable({ providedIn: 'root' })
export class TranslationService {
  private store: Record<string, Record<string, any>> = {};
  private langSubject = new BehaviorSubject<SupportedLang>(DEFAULT_LANG);

  /** Emit whenever the language changes — components can subscribe if they need to react. */
  lang$ = this.langSubject.asObservable();

  get currentLang(): SupportedLang {
    return this.langSubject.value;
  }

  /** User-id của scope đang áp dụng — để phát hiện đổi tài khoản. */
  private scope = '';

  constructor(private http: HttpClient, private auth: AuthService) {
    dropLegacyKey(STORAGE_PREFIX);   // key global của bản cũ

    // Ngôn ngữ theo TÀI KHOẢN, nhưng `preloadAll()` chạy ở APP_INITIALIZER
    // TRƯỚC `initAuth` nên lúc khởi động chưa biết user là ai → luôn mở bằng
    // tiếng Việt (hoặc lựa chọn của khách). Khi đăng nhập xong mới đổi sang
    // ngôn ngữ của tài khoản đó — lúc này mọi file ngôn ngữ đã nằm sẵn trong
    // bộ nhớ nên đổi là tức thì, không phải tải lại trang.
    this.auth.auth$.subscribe(() => {
      const next = this.auth.currentUser?.id ?? '';
      if (next === this.scope) return;
      this.scope = next;
      this.langSubject.next(this.savedLang());
    });
  }

  private key(): string {
    return scopedKey(STORAGE_PREFIX, this.auth.currentUser?.id);
  }

  /** Ngôn ngữ đã lưu của scope hiện tại; không có/không hợp lệ → tiếng Việt. */
  private savedLang(): SupportedLang {
    const saved = localStorage.getItem(this.key()) as SupportedLang;
    return AVAILABLE_LANGS.includes(saved) ? saved : DEFAULT_LANG;
  }

  /**
   * Called from APP_INITIALIZER — loads ALL language JSON files in parallel
   * before the app renders. After this, switching is instant (no HTTP needed).
   */
  async preloadAll(): Promise<void> {
    // Chạy trước khi biết user → đây là lựa chọn của KHÁCH, mặc định tiếng Việt.
    const initial = this.savedLang();

    await Promise.all(
      AVAILABLE_LANGS.map(lang =>
        firstValueFrom(this.http.get<Record<string, any>>(`assets/i18n/${lang}.json`)).then(data => {
          this.store[lang] = data;
        })
      )
    );

    this.langSubject.next(initial);
  }

  setLanguage(lang: SupportedLang): void {
    if (!AVAILABLE_LANGS.includes(lang)) return;
    localStorage.setItem(this.key(), lang);
    this.langSubject.next(lang);
  }

  /**
   * Synchronous lookup — used by TranslatePipe.
   * Supports dot-path keys: 'NAV.HOME', 'AUTH.LOGIN_BTN', etc.
   */
  get(key: string, params?: Record<string, string>): string {
    const translations = this.store[this.currentLang] ?? {};
    const value = this.resolve(translations, key);
    if (!value) return key;
    if (!params) return value;
    return value.replace(/\{\{(\w+)\}\}/g, (_: string, k: string) => params[k] ?? `{{${k}}}`);
  }

  getAvailableLangs(): SupportedLang[] {
    return AVAILABLE_LANGS;
  }

  private resolve(obj: Record<string, any>, path: string): string {
    return path.split('.').reduce((acc, part) => {
      if (acc && typeof acc === 'object') return acc[part];
      return undefined;
    }, obj as any) ?? '';
  }
}
