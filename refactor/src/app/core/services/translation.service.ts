import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, firstValueFrom } from 'rxjs';

export type SupportedLang = 'vi' | 'en';

const STORAGE_KEY = 'yhl_lang';
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

  constructor(private http: HttpClient) {}

  /**
   * Called from APP_INITIALIZER — loads ALL language JSON files in parallel
   * before the app renders. After this, switching is instant (no HTTP needed).
   */
  async preloadAll(): Promise<void> {
    const saved = (localStorage.getItem(STORAGE_KEY) as SupportedLang) ?? DEFAULT_LANG;
    const initial: SupportedLang = AVAILABLE_LANGS.includes(saved) ? saved : DEFAULT_LANG;

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
    localStorage.setItem(STORAGE_KEY, lang);
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
