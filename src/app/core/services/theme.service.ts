import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from './auth.service';
import { dropLegacyKey, scopedKey } from '../utils/user-storage';

export type Theme = 'dark' | 'light' | 'midnight' | 'sepia' | 'ocean';

/** Hiệu ứng chuyển cảnh khi đổi theme. */
export type ThemeTransition = 'none' | 'ripple';

export interface ThemeTransitionMeta {
  id: ThemeTransition;
  /** i18n key cho tên hiệu ứng. */
  label: string;
  /** i18n key mô tả ngắn. */
  desc: string;
  icon: string;
}

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
const FX_KEY = 'yhl_theme_fx';           // hiệu ứng chuyển theme
const BG_KEY = 'yhl_bg_image';
const BG_OPACITY_KEY = 'yhl_bg_opacity'; // tint overlay strength (0 = image clear, 1 = fully tinted)
const BG_BLUR_KEY = 'yhl_bg_blur';       // px
const BG_COVER_KEY = 'yhl_bg_cover_main'; // image shows through main content vs keep theme bg

const FONT_FAMILY_KEY = 'yhl_font_family';
const FONT_SIZE_KEY = 'yhl_font_size';   // px
const FONT_WEIGHT_KEY = 'yhl_font_weight';
const FONT_COLOR_KEY = 'yhl_font_color';

const DEFAULT_OPACITY = 0.82;
const DEFAULT_BLUR = 0;

/** Empty values fall back to the theme/global default (no override). */
export const FONT_FAMILY_OPTIONS = [
  { value: '', label: 'SETTINGS.FONT_DEFAULT' },
  { value: "'Inter', sans-serif", label: 'Inter' },
  { value: "'Roboto', sans-serif", label: 'Roboto' },
  { value: "'Noto Sans', sans-serif", label: 'Noto Sans' },
  { value: "Georgia, 'Times New Roman', serif", label: 'Georgia (serif)' },
  { value: "'Courier New', monospace", label: 'Monospace' },
];
export const FONT_WEIGHT_OPTIONS = ['300', '400', '500', '600', '700'];
const DEFAULT_FONT_SIZE = 16;
const DEFAULT_FONT_WEIGHT = '400';

export const THEMES: ThemeMeta[] = [
  { id: 'dark',     label: 'SETTINGS.THEME_DARK',     swatch: ['#0f0f1a', '#e94560'], supportsImage: true },
  { id: 'light',    label: 'SETTINGS.THEME_LIGHT',    swatch: ['#f0f6ff', '#0ea5e9'], supportsImage: true },
  { id: 'midnight', label: 'SETTINGS.THEME_MIDNIGHT', swatch: ['#070a14', '#7c5cff'], supportsImage: true },
  { id: 'sepia',    label: 'SETTINGS.THEME_SEPIA',    swatch: ['#efe3cf', '#b4622f'], supportsImage: false },
  { id: 'ocean',    label: 'SETTINGS.THEME_OCEAN',    swatch: ['#06212b', '#1ab5b0'], supportsImage: true },
];

// Còn 2 hiệu ứng; thêm hiệu ứng mới thì khai báo ở đây và xử lý trong
// `setThemeWithEffect()`.
export const THEME_TRANSITIONS: ThemeTransitionMeta[] = [
  { id: 'ripple', label: 'SETTINGS.FX_RIPPLE', desc: 'SETTINGS.FX_RIPPLE_DESC', icon: 'fa-solid fa-water' },
  { id: 'none',   label: 'SETTINGS.FX_NONE',   desc: 'SETTINGS.FX_NONE_DESC',   icon: 'fa-solid fa-ban' },
];

const DEFAULT_TRANSITION: ThemeTransition = 'ripple';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly themes = THEMES;

  // Các subject khởi tạo bằng GIÁ TRỊ MẶC ĐỊNH, không đọc localStorage ngay tại
  // field initializer: lúc đó chưa chắc `this.auth` đã được gán nên chưa biết
  // scope của tài khoản nào. Đọc thật ở constructor (`hydrate`) và đọc lại mỗi
  // khi đổi tài khoản.
  private themeSubject = new BehaviorSubject<Theme>('dark');
  theme$ = this.themeSubject.asObservable();

  private bgSubject = new BehaviorSubject<string | null>(null);
  backgroundImage$ = this.bgSubject.asObservable();

  private opacitySubject = new BehaviorSubject<number>(DEFAULT_OPACITY);
  backgroundOpacity$ = this.opacitySubject.asObservable();

  private blurSubject = new BehaviorSubject<number>(DEFAULT_BLUR);
  backgroundBlur$ = this.blurSubject.asObservable();

  private coverMainSubject = new BehaviorSubject<boolean>(false);
  backgroundCoverMain$ = this.coverMainSubject.asObservable();

  private fontFamilySubject = new BehaviorSubject<string>('');
  fontFamily$ = this.fontFamilySubject.asObservable();

  private fontSizeSubject = new BehaviorSubject<number>(DEFAULT_FONT_SIZE);
  fontSize$ = this.fontSizeSubject.asObservable();

  private fontWeightSubject = new BehaviorSubject<string>(DEFAULT_FONT_WEIGHT);
  fontWeight$ = this.fontWeightSubject.asObservable();

  private fontColorSubject = new BehaviorSubject<string>('');
  fontColor$ = this.fontColorSubject.asObservable();

  private transitionSubject = new BehaviorSubject<ThemeTransition>(DEFAULT_TRANSITION);
  themeTransition$ = this.transitionSubject.asObservable();

  readonly transitions = THEME_TRANSITIONS;

  get currentTheme(): Theme { return this.themeSubject.value; }
  get themeTransition(): ThemeTransition { return this.transitionSubject.value; }
  get isDark(): boolean { return this.currentTheme !== 'light' && this.currentTheme !== 'sepia'; }
  get backgroundImage(): string | null { return this.bgSubject.value; }
  get backgroundOpacity(): number { return this.opacitySubject.value; }
  get backgroundBlur(): number { return this.blurSubject.value; }
  get backgroundCoverMain(): boolean { return this.coverMainSubject.value; }
  get fontFamily(): string { return this.fontFamilySubject.value; }
  get fontSize(): number { return this.fontSizeSubject.value; }
  get fontWeight(): string { return this.fontWeightSubject.value; }
  get fontColor(): string { return this.fontColorSubject.value; }

  // ── localStorage theo TÀI KHOẢN ────────────────────────────────────────────
  // Theme/nền/font là thiết lập của từng tài khoản (server cũng lưu theo user),
  // nên key phải kèm user-id. Lưu global thì đăng xuất vẫn còn, và người khác
  // đăng nhập trên cùng máy sẽ thấy ảnh nền cá nhân của người trước.

  /** User-id của lần hydrate gần nhất — để phát hiện đổi tài khoản. */
  private scope = '';

  private k(prefix: string): string {
    return scopedKey(prefix, this.auth.currentUser?.id);
  }

  private read(prefix: string): string | null {
    return localStorage.getItem(this.k(prefix));
  }

  private write(prefix: string, value: string): void {
    localStorage.setItem(this.k(prefix), value);
  }

  private remove(prefix: string): void {
    localStorage.removeItem(this.k(prefix));
  }

  private loadNum(prefix: string, fallback: number): number {
    const v = parseFloat(this.read(prefix) ?? '');
    return isNaN(v) ? fallback : v;
  }

  /**
   * Chức năng: Nạp lại toàn bộ thiết lập hiển thị theo tài khoản đang đăng nhập.
   *   Gọi lúc khởi tạo và mỗi khi đổi tài khoản (đăng nhập / đăng xuất).
   * Yêu cầu: `this.auth` đã sẵn sàng.
   * Kết quả trả về: không (phát giá trị mới cho mọi subject).
   * Exception: không ném.
   */
  private hydrate(): void {
    this.scope = this.auth.currentUser?.id ?? '';
    this.themeSubject.next(this.getSavedTheme());
    this.bgSubject.next(this.read(BG_KEY) || null);
    this.opacitySubject.next(this.loadNum(BG_OPACITY_KEY, DEFAULT_OPACITY));
    this.blurSubject.next(this.loadNum(BG_BLUR_KEY, DEFAULT_BLUR));
    this.coverMainSubject.next(this.read(BG_COVER_KEY) === '1');
    this.fontFamilySubject.next(this.read(FONT_FAMILY_KEY) || '');
    this.fontSizeSubject.next(this.loadNum(FONT_SIZE_KEY, DEFAULT_FONT_SIZE));
    this.fontWeightSubject.next(this.read(FONT_WEIGHT_KEY) || DEFAULT_FONT_WEIGHT);
    this.fontColorSubject.next(this.read(FONT_COLOR_KEY) || '');
    this.transitionSubject.next(this.getSavedTransition());
    // Scope mới = chưa ai đụng vào nền trong phiên này.
    this.bgTouchedByUser = false;
  }

  /** The custom background is a logged-in personalization — hidden when out. */
  private loggedIn = false;

  /**
   * True once the user has explicitly picked/cleared a background this session.
   * A (possibly slow, cold-start) server sync must not clobber that choice when
   * its response lands afterwards.
   */
  private bgTouchedByUser = false;

  constructor(private auth: AuthService) {
    // Dọn key global của bản cũ (dùng chung cho mọi tài khoản).
    [STORAGE_KEY, FX_KEY, BG_KEY, BG_OPACITY_KEY, BG_BLUR_KEY, BG_COVER_KEY,
      FONT_FAMILY_KEY, FONT_SIZE_KEY, FONT_WEIGHT_KEY, FONT_COLOR_KEY]
      .forEach(dropLegacyKey);

    this.hydrate();
    this.auth.auth$.subscribe(state => {
      this.loggedIn = !!state?.status;
      // Đổi tài khoản → nạp lại thiết lập của tài khoản mới rồi vẽ lại toàn bộ.
      if ((this.auth.currentUser?.id ?? '') !== this.scope) {
        this.hydrate();
        this.apply();
        return;
      }
      this.applyBackground();
    });
  }

  private getSavedTheme(): Theme {
    const saved = this.read(STORAGE_KEY) as Theme;
    return THEMES.some(t => t.id === saved) ? saved : 'dark';
  }

  private getSavedTransition(): ThemeTransition {
    const saved = this.read(FX_KEY) as ThemeTransition;
    return THEME_TRANSITIONS.some(t => t.id === saved) ? saved : DEFAULT_TRANSITION;
  }

  /** Apply theme + background image + fonts to the document (call on bootstrap). */
  apply(): void {
    document.documentElement.setAttribute('data-theme', this.currentTheme);
    this.applyBackground();
    this.applyFont();
  }

  /** Back-compat: dark ⇄ light quick toggle (header button). */
  toggle(): void {
    this.setTheme(this.currentTheme === 'light' ? 'dark' : 'light');
  }

  /**
   * Chức năng: Đổi nhanh dark ⇄ light kèm hiệu ứng người dùng đã chọn (nút theme
   *   ở header / admin layout gọi hàm này).
   * Yêu cầu: `event` — click event để lấy tâm hiệu ứng; thiếu thì đổi ngay.
   * Kết quả trả về: không (theme đổi ngay hoặc sau khi hiệu ứng phủ kín màn hình).
   * Exception: không ném.
   */
  toggleWithRipple(event?: MouseEvent): void {
    this.setThemeWithEffect(this.currentTheme === 'light' ? 'dark' : 'light', event);
  }

  /**
   * Chức năng: Đổi sang theme chỉ định kèm hiệu ứng chuyển cảnh đang chọn.
   * Yêu cầu: `theme` — theme đích; `event` — click event để lấy tâm toả (không
   *   có toạ độ thì không có hiệu ứng nào chạy được → đổi ngay).
   * Kết quả trả về: không (cập nhật theme, có thể trễ tới cuối pha "phủ").
   * Exception: không ném — trình duyệt thiếu API thì rơi về đổi ngay.
   */
  setThemeWithEffect(theme: Theme, event?: MouseEvent): void {
    const apply = () => this.setTheme(theme);
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const fx = this.themeTransition;

    // Không hiệu ứng, máy xin giảm chuyển động, hoặc không biết tâm toả → đổi ngay.
    if (fx === 'none' || reduceMotion || !event) { apply(); return; }
    this.runRippleTransition(event, apply);
  }

  /**
   * Chức năng: Hiệu ứng "lan như mặt nước" toả ra từ vị trí bấm.
   *
   *   Cách làm: View Transitions API chụp ảnh trạng thái cũ/mới, rồi animate
   *   `clip-path: circle()` trên snapshot MỚI từ bán kính 0 tại điểm bấm ra tới
   *   góc xa nhất của viewport → trông như gợn nước lan ra.
   *
   * Yêu cầu: `event` — click event; `apply` — hàm đổi theme thật sự.
   * Kết quả trả về: không.
   * Exception: không ném — trình duyệt không hỗ trợ `startViewTransition` thì
   *   gọi thẳng `apply()`, không hiệu ứng.
   */
  private runRippleTransition(event: MouseEvent, apply: () => void): void {
    const doc = document as any;
    if (typeof doc.startViewTransition !== 'function') { apply(); return; }

    const x = event.clientX;
    const y = event.clientY;
    // Bán kính đủ để phủ hết viewport từ điểm click (góc xa nhất).
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );

    const transition = doc.startViewTransition(apply);
    transition.ready
      .then(() => {
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${endRadius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: 520,
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
            pseudoElement: '::view-transition-new(root)',
          },
        );
      })
      // Transition bị skip (vd điều hướng chen ngang) → bỏ qua, theme đã đổi rồi.
      .catch(() => {});
  }

  /**
   * Chức năng: Chọn hiệu ứng chuyển theme (lưu theo tài khoản trong localStorage).
   * Yêu cầu: `fx` — một trong `THEME_TRANSITIONS`.
   * Kết quả trả về: không (phát giá trị mới qua `themeTransition$`).
   * Exception: không ném.
   */
  setThemeTransition(fx: ThemeTransition): void {
    this.write(FX_KEY, fx);
    this.transitionSubject.next(fx);
  }

  setTheme(theme: Theme): void {
    this.write(STORAGE_KEY, theme);
    document.documentElement.setAttribute('data-theme', theme);
    this.themeSubject.next(theme);
  }

  /**
   * Set (or clear with null/'') a custom page background image — either a URL
   * or a data URL from a local file. Returns false if it couldn't be persisted
   * (e.g. localStorage quota for a large image) — it's still applied in-memory.
   *
   * `fromUser` is true for explicit user actions (picking/clearing in Settings)
   * and false for a server sync (`GET /user-settings-get`). A server sync is
   * ignored once the user has touched the background this session, so a slow
   * cold-start response can't overwrite a freshly-picked image.
   */
  setBackgroundImage(url: string | null, fromUser = true): boolean {
    if (!fromUser && this.bgTouchedByUser) return true; // user's choice wins
    const clean = url?.trim() || null;
    let persisted = true;
    try {
      if (clean) this.write(BG_KEY, clean);
      else this.remove(BG_KEY);
    } catch {
      persisted = false; // quota exceeded — apply anyway, just won't survive reload
    }
    if (fromUser) this.bgTouchedByUser = true;
    this.bgSubject.next(clean);
    this.applyBackground();
    return persisted;
  }

  /** Tint overlay strength: 0 = image fully visible, 1 = image fully hidden. */
  setBackgroundOpacity(value: number): void {
    const v = Math.min(1, Math.max(0, value));
    this.write(BG_OPACITY_KEY, String(v));
    this.opacitySubject.next(v);
    this.applyBackground();
  }

  /** Background blur in pixels (0 = sharp). */
  setBackgroundBlur(px: number): void {
    const v = Math.min(40, Math.max(0, px));
    this.write(BG_BLUR_KEY, String(v));
    this.blurSubject.next(v);
    this.applyBackground();
  }

  /** true = image shows through the main content; false = main content keeps the theme bg. */
  setBackgroundCoverMain(cover: boolean): void {
    this.write(BG_COVER_KEY, cover ? '1' : '0');
    this.coverMainSubject.next(cover);
    this.applyBackground();
  }

  /** Reset theme, background and fonts to the built-in defaults (local only). */
  resetToDefaults(): void {
    this.setTheme('dark');
    this.setBackgroundImage(null);
    this.setBackgroundOpacity(DEFAULT_OPACITY);
    this.setBackgroundBlur(DEFAULT_BLUR);
    this.setBackgroundCoverMain(false);
    this.setFontFamily('');
    this.setFontSize(DEFAULT_FONT_SIZE);
    this.setFontWeight(DEFAULT_FONT_WEIGHT);
    this.setFontColor('');
    this.setThemeTransition(DEFAULT_TRANSITION);
  }

  // ── Fonts ────────────────────────────────────────────────────────────────────
  setFontFamily(value: string): void {
    const v = (value || '').trim();
    if (v) this.write(FONT_FAMILY_KEY, v); else this.remove(FONT_FAMILY_KEY);
    this.fontFamilySubject.next(v);
    this.applyFont();
  }

  setFontSize(px: number): void {
    const v = Math.min(28, Math.max(11, Math.round(px || DEFAULT_FONT_SIZE)));
    this.write(FONT_SIZE_KEY, String(v));
    this.fontSizeSubject.next(v);
    this.applyFont();
  }

  setFontWeight(weight: string): void {
    const v = (weight || '').trim() || DEFAULT_FONT_WEIGHT;
    this.write(FONT_WEIGHT_KEY, v);
    this.fontWeightSubject.next(v);
    this.applyFont();
  }

  setFontColor(color: string): void {
    const v = (color || '').trim();
    if (v) this.write(FONT_COLOR_KEY, v); else this.remove(FONT_COLOR_KEY);
    this.fontColorSubject.next(v);
    this.applyFont();
  }

  private applyFont(): void {
    const root = document.documentElement;
    const family = this.fontFamilySubject.value;
    const color = this.fontColorSubject.value;
    // Empty → remove the override so the theme/global default applies.
    if (family) root.style.setProperty('--app-font-family', family);
    else root.style.removeProperty('--app-font-family');
    root.style.setProperty('--app-font-size', `${this.fontSizeSubject.value}px`);
    root.style.setProperty('--app-font-weight', this.fontWeightSubject.value);
    if (color) root.style.setProperty('--app-font-color', color);
    else root.style.removeProperty('--app-font-color');
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
