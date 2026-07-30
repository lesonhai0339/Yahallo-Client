import { Component, OnInit } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import {
  UserPreferencesService, UserPreferences, ReadProgressMode, ListView,
} from '../../../core/services/user-preferences.service';
import { ReadingProgressService } from '../../../core/services/reading-progress.service';
import {
  ThemeService, Theme, ThemeMeta, ThemeTransition, ThemeTransitionMeta,
  FONT_FAMILY_OPTIONS, FONT_WEIGHT_OPTIONS,
} from '../../../core/services/theme.service';
import { AuthService } from '../../../core/services/auth.service';
import { TranslationService, SupportedLang } from '../../../core/services/translation.service';
import { UserSettingsService } from '../../../core/services/user-settings.service';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
})
export class SettingsComponent implements OnInit {
  prefs!: UserPreferences;
  themes: ThemeMeta[] = [];
  currentTheme: Theme = 'dark';
  transitions: ThemeTransitionMeta[] = [];
  currentTransition: ThemeTransition = 'ripple';
  bgImageInput = '';
  bgImage: string | null = null;
  bgOpacity = 0.82;
  bgBlur = 0;
  bgCoverMain = false;
  syncing = false;
  localCount = 0;

  // Language
  langs: SupportedLang[] = [];
  currentLang: SupportedLang = 'vi';

  // Fonts
  readonly fontFamilyOptions = FONT_FAMILY_OPTIONS;
  readonly fontWeightOptions = FONT_WEIGHT_OPTIONS;
  fontFamily = '';
  fontSize = 16;
  fontWeight = '400';
  fontColor = '';

  // Server save
  saving = false;
  /** Background file picked in this session, uploaded to S3 on save. */
  private pendingBgFile: File | null = null;

  readonly modeOptions: { value: ReadProgressMode; labelKey: string; descKey: string; icon: string }[] = [
    { value: 'off',    labelKey: 'SETTINGS.MODE_OFF',    descKey: 'SETTINGS.MODE_OFF_DESC',    icon: 'block' },
    { value: 'ask',    labelKey: 'SETTINGS.MODE_ASK',    descKey: 'SETTINGS.MODE_ASK_DESC',    icon: 'help_outline' },
    { value: 'always', labelKey: 'SETTINGS.MODE_ALWAYS', descKey: 'SETTINGS.MODE_ALWAYS_DESC', icon: 'bolt' },
  ];

  constructor(
    private prefsService: UserPreferencesService,
    private readingProgress: ReadingProgressService,
    private themeService: ThemeService,
    private auth: AuthService,
    private toastr: ToastrService,
    private i18n: TranslationService,
    private userSettings: UserSettingsService,
  ) {}

  private t(key: string, params?: Record<string, string>): string {
    return this.i18n.get(key, params);
  }

  ngOnInit(): void {
    this.prefs = { ...this.prefsService.current };
    this.themes = this.themeService.themes;
    this.currentTheme = this.themeService.currentTheme;
    this.transitions = this.themeService.transitions;
    this.currentTransition = this.themeService.themeTransition;
    this.bgImage = this.themeService.backgroundImage;
    this.bgImageInput = this.bgImage ?? '';
    this.bgOpacity = this.themeService.backgroundOpacity;
    this.bgBlur = this.themeService.backgroundBlur;
    this.bgCoverMain = this.themeService.backgroundCoverMain;
    this.localCount = this.readingProgress.getAllLocal().length;

    this.langs = this.i18n.getAvailableLangs();
    this.currentLang = this.i18n.currentLang;
    this.fontFamily = this.themeService.fontFamily;
    this.fontSize = this.themeService.fontSize;
    this.fontWeight = this.themeService.fontWeight;
    this.fontColor = this.themeService.fontColor;
  }

  // ── Language ─────────────────────────────────────────────────────────────────
  setLanguage(lang: SupportedLang): void {
    this.currentLang = lang;
    this.i18n.setLanguage(lang);
  }

  // ── Fonts (live preview; persisted to server on Save) ────────────────────────
  onFontFamilyChange(): void { this.themeService.setFontFamily(this.fontFamily); }
  onFontSizeChange(): void { this.themeService.setFontSize(this.fontSize); this.fontSize = this.themeService.fontSize; }
  onFontWeightChange(): void { this.themeService.setFontWeight(this.fontWeight); }
  onFontColorChange(): void { this.themeService.setFontColor(this.fontColor); }

  resetFontColor(): void { this.fontColor = ''; this.themeService.setFontColor(''); }

  /**
   * Revert appearance/behaviour settings to the built-in defaults (the state
   * before this entity existed). Applied locally; press "Save to server" to
   * persist, otherwise the next login pulls the server values back.
   */
  resetDefaults(): void {
    this.themeService.resetToDefaults();
    this.prefsService.reset();
    this.i18n.setLanguage('vi');
    this.pendingBgFile = null;

    // Re-read the now-default values back into the form.
    this.prefs = { ...this.prefsService.current };
    this.currentTheme = this.themeService.currentTheme;
    this.currentTransition = this.themeService.themeTransition;
    this.currentLang = this.i18n.currentLang;
    this.bgImage = this.themeService.backgroundImage;
    this.bgImageInput = '';
    this.bgOpacity = this.themeService.backgroundOpacity;
    this.bgBlur = this.themeService.backgroundBlur;
    this.bgCoverMain = this.themeService.backgroundCoverMain;
    this.fontFamily = this.themeService.fontFamily;
    this.fontSize = this.themeService.fontSize;
    this.fontWeight = this.themeService.fontWeight;
    this.fontColor = this.themeService.fontColor;

    this.toastr.info(this.t('SETTINGS.T_RESET_DONE'));
  }

  // ── Persist everything to the server ─────────────────────────────────────────
  saveToServer(): void {
    if (!this.auth.currentUser?.id) { this.toastr.warning(this.t('SETTINGS.T_NEED_LOGIN')); return; }
    this.saving = true;
    this.userSettings.save(this.pendingBgFile).subscribe({
      next: (accessUrl) => {
        this.saving = false;
        this.pendingBgFile = null;
        this.bgImage = this.themeService.backgroundImage;
        // Surface the cloud (readable) URL in the input once the upload lands.
        if (accessUrl) this.bgImageInput = accessUrl;
        this.toastr.success(this.t('SETTINGS.T_SAVED_SERVER'));
      },
      error: () => {
        this.saving = false;
        this.toastr.error(this.t('SETTINGS.T_SAVE_ERR'));
      },
    });
  }

  // ── Read progress ────────────────────────────────────────────────────────────
  setMode(mode: ReadProgressMode): void {
    const prev = this.prefs.readProgressMode;
    this.prefs.readProgressMode = mode;
    this.prefsService.update({ readProgressMode: mode });

    if (mode === 'off') {
      // Turn off → wipe ALL local progress (server snapshot is kept).
      this.readingProgress.clearLocal();
      this.localCount = 0;
    } else if (prev === 'off') {
      // Re-enable → pull progress back from the server (if logged in).
      const uid = this.auth.currentUser?.id;
      if (uid) this.readingProgress.sync(uid).subscribe(() => {
        this.localCount = this.readingProgress.getAllLocal().length;
      });
    }
  }

  saveLimits(): void {
    const retentionDays = Math.max(0, Math.floor(this.prefs.retentionDays || 0));
    const maxEntries = Math.max(0, Math.floor(this.prefs.maxEntries || 0));
    this.prefs.retentionDays = retentionDays;
    this.prefs.maxEntries = maxEntries;
    this.prefsService.update({ retentionDays, maxEntries });
    this.localCount = this.readingProgress.getAllLocal().length;
    this.toastr.success(this.t('SETTINGS.T_SAVED_LIMITS'));
  }

  syncNow(): void {
    const userId = this.auth.currentUser?.id;
    if (!userId) { this.toastr.warning(this.t('SETTINGS.T_NEED_LOGIN')); return; }
    this.syncing = true;
    this.readingProgress.sync(userId).subscribe(result => {
      this.syncing = false;
      this.localCount = this.readingProgress.getAllLocal().length;
      const msg: Record<string, string> = {
        pushed: this.t('SETTINGS.T_SYNC_PUSHED'),
        pulled: this.t('SETTINGS.T_SYNC_PULLED'),
        'in-sync': this.t('SETTINGS.T_SYNC_INSYNC'),
        skipped: this.t('SETTINGS.T_SYNC_SKIPPED'),
      };
      this.toastr.info(msg[result] ?? '');
    });
  }

  clearLocal(): void {
    this.readingProgress.clearLocal();
    this.localCount = 0;
    this.toastr.info(this.t('SETTINGS.T_CLEARED_LOCAL'));
  }

  // ── List & pagination defaults ───────────────────────────────────────────────
  readonly pageSizeChoices = [10, 20, 50];

  setDefaultPageSize(size: number): void {
    this.prefs.defaultPageSize = size;
    this.prefsService.update({ defaultPageSize: size });
  }

  setDefaultView(view: ListView): void {
    this.prefs.defaultView = view;
    this.prefsService.update({ defaultView: view });
  }

  // ── Theme ────────────────────────────────────────────────────────────────────
  /**
   * Chức năng: Đổi theme từ ô chọn, chạy kèm hiệu ứng đang bật — nhờ vậy chính
   *   thao tác này cũng là bản xem thử của hiệu ứng vừa chọn.
   * Yêu cầu: `theme` — theme đích; `event` — click event lấy tâm toả của hiệu ứng.
   * Kết quả trả về: không.
   * Exception: không ném.
   */
  selectTheme(theme: Theme, event?: MouseEvent): void {
    this.currentTheme = theme;
    this.themeService.setThemeWithEffect(theme, event);
  }

  /**
   * Chức năng: Chọn hiệu ứng chuyển theme.
   * Yêu cầu: `fx` — hiệu ứng.
   * Kết quả trả về: không (lưu vào localStorage theo tài khoản).
   * Exception: không ném.
   *
   * Không chạy thử tại chỗ: cả hai hiệu ứng đều dựa trên ảnh chụp trước/sau của
   * View Transitions, đổi-vào-chính-theme-hiện-tại thì hai ảnh giống hệt nhau
   * nên không thấy gì. Bấm một ô theme phía trên chính là bản xem thử.
   */
  selectTransition(fx: ThemeTransition): void {
    this.currentTransition = fx;
    this.themeService.setThemeTransition(fx);
  }

  get activeThemeMeta(): ThemeMeta | undefined {
    return this.themes.find(t => t.id === this.currentTheme);
  }

  applyBackground(): void {
    this.themeService.setBackgroundImage(this.bgImageInput);
    this.bgImage = this.themeService.backgroundImage;
    this.toastr.success(this.t(this.bgImage ? 'SETTINGS.T_BG_SET' : 'SETTINGS.T_BG_CLEARED'));
  }

  /** Browse a local image file and use it as the background (stored as data URL). */
  onPickFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow re-picking the same file
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.toastr.error(this.t('SETTINGS.T_IMG_ONLY'));
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      this.toastr.warning(this.t('SETTINGS.T_IMG_LARGE'));
    }
    // Keep the File so "Save to server" can upload it to S3.
    this.pendingBgFile = file;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const ok = this.themeService.setBackgroundImage(dataUrl);
      this.bgImage = this.themeService.backgroundImage;
      this.bgImageInput = '';
      if (ok) this.toastr.success(this.t('SETTINGS.T_BG_SET_FILE'));
      else this.toastr.error(this.t('SETTINGS.T_IMG_TOO_LARGE'));
    };
    reader.onerror = () => this.toastr.error(this.t('SETTINGS.T_IMG_READ_ERR'));
    reader.readAsDataURL(file);
  }

  clearBackground(): void {
    this.bgImageInput = '';
    this.pendingBgFile = null;
    this.themeService.setBackgroundImage(null);
    this.bgImage = null;
  }

  onOpacityChange(): void {
    this.themeService.setBackgroundOpacity(this.bgOpacity);
  }

  onBlurChange(): void {
    this.themeService.setBackgroundBlur(this.bgBlur);
  }

  onCoverMainChange(): void {
    this.themeService.setBackgroundCoverMain(this.bgCoverMain);
  }
}
