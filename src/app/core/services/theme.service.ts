import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from './auth.service';

export type Theme = 'dark' | 'light' | 'midnight' | 'sepia' | 'ocean';

export interface ThemeMeta {
  id: Theme;
  /** i18n key for the theme's display name (translated at the view layer). */
  label: string;
  /** Swatch colors [bg, accent] for the picker preview. */
  swatch: [string, string];
  /** Whether a custom background image reads well on this theme. */
  supportsImage: boolean;
}

const STORAGE_KEY = 'yhl_theme';
const BG_KEY = 'yhl_bg_image';
const BG_OPACITY_KEY = 'yhl_bg_opacity'; // tint overlay strength (0 = image clear, 1 = fully tinted)
const BG_BLUR_KEY = 'yhl_bg_blur';       // px
const BG_COVER_KEY = 'yhl_bg_cover_main'; // image shows through main content vs keep theme bg

const DEFAULT_OPACITY = 0.82;
const DEFAULT_BLUR = 0;

export const THEMES: ThemeMeta[] = [
  { id: 'dark',     label: 'SETTINGS.THEME_DARK',     swatch: ['#0f0f1a', '#e94560'], supportsImage: true },
  { id: 'light',    label: 'SETTINGS.THEME_LIGHT',    swatch: ['#f0f6ff', '#0ea5e9'], supportsImage: true },
  { id: 'midnight', label: 'SETTINGS.THEME_MIDNIGHT', swatch: ['#070a14', '#7c5cff'], supportsImage: true },
  { id: 'sepia',    label: 'SETTINGS.THEME_SEPIA',    swatch: ['#efe3cf', '#b4622f'], supportsImage: false },
  { id: 'ocean',    label: 'SETTINGS.THEME_OCEAN',    swatch: ['#06212b', '#1ab5b0'], supportsImage: true },
];

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly themes = THEMES;

  private themeSubject = new BehaviorSubject<Theme>(this.getSavedTheme());
  theme$ = this.themeSubject.asObservable();

  private bgSubject = new BehaviorSubject<string | null>(localStorage.getItem(BG_KEY) || null);
  backgroundImage$ = this.bgSubject.asObservable();

  private opacitySubject = new BehaviorSubject<number>(this.loadNum(BG_OPACITY_KEY, DEFAULT_OPACITY));
  backgroundOpacity$ = this.opacitySubject.asObservable();

  private blurSubject = new BehaviorSubject<number>(this.loadNum(BG_BLUR_KEY, DEFAULT_BLUR));
  backgroundBlur$ = this.blurSubject.asObservable();

  private coverMainSubject = new BehaviorSubject<boolean>(localStorage.getItem(BG_COVER_KEY) === '1');
  backgroundCoverMain$ = this.coverMainSubject.asObservable();

  get currentTheme(): Theme { return this.themeSubject.value; }
  get isDark(): boolean { return this.currentTheme !== 'light' && this.currentTheme !== 'sepia'; }
  get backgroundImage(): string | null { return this.bgSubject.value; }
  get backgroundOpacity(): number { return this.opacitySubject.value; }
  get backgroundBlur(): number { return this.blurSubject.value; }
  get backgroundCoverMain(): boolean { return this.coverMainSubject.value; }

  private loadNum(key: string, fallback: number): number {
    const v = parseFloat(localStorage.getItem(key) ?? '');
    return isNaN(v) ? fallback : v;
  }

  /** The custom background is a logged-in personalization — hidden when out. */
  private loggedIn = false;

  constructor(private auth: AuthService) {
    this.auth.auth$.subscribe(state => {
      this.loggedIn = !!state?.status;
      this.applyBackground();
    });
  }

  private getSavedTheme(): Theme {
    const saved = localStorage.getItem(STORAGE_KEY) as Theme;
    return THEMES.some(t => t.id === saved) ? saved : 'dark';
  }

  /** Apply theme + background image to the document (call on bootstrap). */
  apply(): void {
    document.documentElement.setAttribute('data-theme', this.currentTheme);
    this.applyBackground();
  }

  /** Back-compat: dark ⇄ light quick toggle (header button). */
  toggle(): void {
    this.setTheme(this.currentTheme === 'light' ? 'dark' : 'light');
  }

  setTheme(theme: Theme): void {
    localStorage.setItem(STORAGE_KEY, theme);
    document.documentElement.setAttribute('data-theme', theme);
    this.themeSubject.next(theme);
  }

  /**
   * Set (or clear with null/'') a custom page background image — either a URL
   * or a data URL from a local file. Returns false if it couldn't be persisted
   * (e.g. localStorage quota for a large image) — it's still applied in-memory.
   */
  setBackgroundImage(url: string | null): boolean {
    const clean = url?.trim() || null;
    let persisted = true;
    try {
      if (clean) localStorage.setItem(BG_KEY, clean);
      else localStorage.removeItem(BG_KEY);
    } catch {
      persisted = false; // quota exceeded — apply anyway, just won't survive reload
    }
    this.bgSubject.next(clean);
    this.applyBackground();
    return persisted;
  }

  /** Tint overlay strength: 0 = image fully visible, 1 = image fully hidden. */
  setBackgroundOpacity(value: number): void {
    const v = Math.min(1, Math.max(0, value));
    localStorage.setItem(BG_OPACITY_KEY, String(v));
    this.opacitySubject.next(v);
    this.applyBackground();
  }

  /** Background blur in pixels (0 = sharp). */
  setBackgroundBlur(px: number): void {
    const v = Math.min(40, Math.max(0, px));
    localStorage.setItem(BG_BLUR_KEY, String(v));
    this.blurSubject.next(v);
    this.applyBackground();
  }

  /** true = image shows through the main content; false = main content keeps the theme bg. */
  setBackgroundCoverMain(cover: boolean): void {
    localStorage.setItem(BG_COVER_KEY, cover ? '1' : '0');
    this.coverMainSubject.next(cover);
    this.applyBackground();
  }

  private applyBackground(): void {
    const url = this.bgSubject.value;
    const root = document.documentElement;
    root.style.setProperty('--app-bg-overlay', String(this.opacitySubject.value));
    root.style.setProperty('--app-bg-blur', `${this.blurSubject.value}px`);
    // Only show the user's custom background while logged in (it persists in
    // localStorage, so it returns on the next login).
    const active = !!url && this.loggedIn;
    if (active) {
      root.style.setProperty('--app-bg-image', `url("${url}")`);
      document.body.classList.add('has-bg-image');
    } else {
      root.style.removeProperty('--app-bg-image');
      document.body.classList.remove('has-bg-image');
    }
    document.body.classList.toggle('bg-cover-main', active && this.coverMainSubject.value);
  }
}
