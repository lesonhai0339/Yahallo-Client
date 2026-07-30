import { HttpBackend, HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { from, Observable, of } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { buildFileUploadInfo, appendFileUploadInfo, FileUploadInfo } from '../utils/file-upload-info';
import { environment } from '../../../environments/environment';
import { Theme, ThemeService, ThemeTransition } from './theme.service';
import {
  ListView, ReadProgressMode, UserPreferences, UserPreferencesService,
} from './user-preferences.service';
import { SupportedLang, TranslationService } from './translation.service';
import { AuthService } from './auth.service';

/** Server-side enum names (PascalCase) paired index-by-index with client values. */
const THEME_NAMES = ['Dark', 'Light', 'Midnight', 'Sepia', 'Ocean'];
const THEME_VALUES: Theme[] = ['dark', 'light', 'midnight', 'sepia', 'ocean'];

const VIEW_NAMES = ['List', 'Grid'];
const VIEW_VALUES: ListView[] = ['list', 'grid'];

const MODE_NAMES = ['Off', 'Ask', 'Always'];
const MODE_VALUES: ReadProgressMode[] = ['off', 'ask', 'always'];

// Thứ tự phải khớp enum Transition ở backend (None = 0, Ripple = 1, Blocks = 2)
// vì enum có thể về dưới dạng số. Client đã bỏ hiệu ứng Blocks nhưng vẫn giữ chỗ
// thứ 3: tài khoản từng lưu `Blocks` thì đọc về sẽ rơi êm sang `ripple` thay vì
// hỏng. Chiều gửi đi thì `indexOf('ripple')` luôn khớp ô số 1 nên không bao giờ
// ghi ngược `Blocks` lên server.
const TRANSITION_NAMES = ['None', 'Ripple', 'Blocks'];
const TRANSITION_VALUES: ThemeTransition[] = ['none', 'ripple', 'ripple'];

/** Shape returned by GET /user-settings-get (UserSettingsDto). Enums may arrive as int or name. */
export interface UserSettingsDto {
  id?: string;
  language?: string | null;
  theme?: string | number | null;
  /** Hiệu ứng chuyển theme (enum Transition — nullable ở backend). */
  transition?: string | number | null;
  bgImageUrl?: string | null;
  bgOpacity?: number | null;
  bgBlur?: number | null;
  fontFamily?: string | null;
  fontSize?: number | null;
  fontWeight?: string | null;
  fontColor?: string | null;
  listView?: string | number | null;
  pageSize?: number | null;
  progressReadMode?: string | number | null;
  retentionDays?: number | null;
  maxEntries?: number | null;
}

/**
 * Reply of both POST /create (`CreateUserSettingResult`) and PUT /update
 * (`UpdateUserSettingResult`) — same shape:
 *  - `uploadUrl` — pre-signed S3 *PUT* URL the client uploads the new bg to.
 *  - `accessUrl` — readable URL to display the bg afterwards (don't derive it
 *    from `uploadUrl`; a private bucket won't serve the PUT URL on GET).
 * Either may be null when no background file was sent.
 */
export interface UserSettingResult {
  uploadUrl?: string | null;
  accessUrl?: string | null;
}

/** Read a C# enum that may serialize as a number (index) or a string (name). */
function parseEnum<T>(value: string | number | null | undefined, names: string[], values: T[]): T | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return values[value] ?? null;
  const s = String(value).trim();
  if (/^\d+$/.test(s)) return values[Number(s)] ?? null;
  const byName = names.findIndex(n => n.toLowerCase() === s.toLowerCase());
  if (byName >= 0) return values[byName];
  const byValue = values.findIndex(v => String(v).toLowerCase() === s.toLowerCase());
  return byValue >= 0 ? values[byValue] : null;
}

/** Convert a client enum value to its server-side PascalCase name for sending. */
function toEnumName<T>(value: T, values: T[], names: string[]): string {
  const i = values.indexOf(value);
  return names[i] ?? names[0];
}

/**
 * Single source of truth for the user's appearance / behaviour settings.
 *
 * Server is authoritative: on login we pull `GET /user-settings-get` and apply
 * it through ThemeService / UserPreferencesService / TranslationService, which
 * also caches each value in localStorage for an instant (flicker-free) re-apply
 * on the next bootstrap. Saving pushes everything back via
 * `POST /user-settings-create` (multipart, upsert) and, when a new background
 * file was picked, PUTs it straight to the returned pre-signed S3 URL.
 */
@Injectable({ providedIn: 'root' })
export class UserSettingsService {
  private readonly base = environment.userSettingsApi;
  /** Bypasses interceptors so the S3 PUT isn't given an Authorization header. */
  private readonly s3Http: HttpClient;
  private loaded = false;
  /** True once GET /get returns an existing settings row → Save must UPDATE, not CREATE. */
  private hasServerSettings = false;

  constructor(
    private http: HttpClient,
    httpBackend: HttpBackend,
    private theme: ThemeService,
    private prefs: UserPreferencesService,
    private translation: TranslationService,
    private auth: AuthService,
  ) {
    this.s3Http = new HttpClient(httpBackend);
    // Pull the user's settings once, right after they log in.
    this.auth.auth$.subscribe(state => {
      if (state?.status) {
        if (!this.loaded) this.loadFromServer().subscribe();
      } else {
        this.loaded = false;
        this.hasServerSettings = false;
      }
    });
  }

  /** GET the settings and apply them locally. Safe to call when logged out (no-op on error). */
  loadFromServer(): Observable<UserSettingsDto | null> {
    return this.http.get<any>(`${this.base}/get`).pipe(
      map(res => (res?.value ?? res) as UserSettingsDto | null),
      tap(dto => {
        // A returned row means the user already has settings → Save should update.
        if (dto) { this.applyDto(dto); this.hasServerSettings = true; }
        this.loaded = true;
      }),
      catchError(() => { this.loaded = true; return of(null); }),
    );
  }

  private applyDto(dto: UserSettingsDto): void {
    const theme = parseEnum(dto.theme, THEME_NAMES, THEME_VALUES);
    if (theme) this.theme.setTheme(theme);

    // Field nullable: chưa từng lưu → parseEnum trả null → giữ nguyên lựa chọn local.
    const transition = parseEnum(dto.transition, TRANSITION_NAMES, TRANSITION_VALUES);
    if (transition) this.theme.setThemeTransition(transition);

    if (dto.bgImageUrl != null) this.theme.setBackgroundImage(dto.bgImageUrl, false);
    if (dto.bgOpacity != null) this.theme.setBackgroundOpacity(dto.bgOpacity);
    if (dto.bgBlur != null) this.theme.setBackgroundBlur(dto.bgBlur);

    if (dto.fontFamily != null) this.theme.setFontFamily(dto.fontFamily);
    if (dto.fontSize != null) this.theme.setFontSize(dto.fontSize);
    if (dto.fontWeight != null) this.theme.setFontWeight(dto.fontWeight);
    if (dto.fontColor != null) this.theme.setFontColor(dto.fontColor);

    const lang = (dto.language || '').toLowerCase();
    if (lang === 'vi' || lang === 'en') this.translation.setLanguage(lang as SupportedLang);

    const patch: Partial<UserPreferences> = {};
    const mode = parseEnum(dto.progressReadMode, MODE_NAMES, MODE_VALUES);
    if (mode) patch.readProgressMode = mode;
    if (dto.retentionDays != null) patch.retentionDays = dto.retentionDays;
    if (dto.maxEntries != null) patch.maxEntries = dto.maxEntries;

    // Pagination (list/grid + page size) is a local "temp" override once the
    // user has touched it outside the settings page — local wins over server.
    if (!this.prefs.hasStored) {
      const view = parseEnum(dto.listView, VIEW_NAMES, VIEW_VALUES);
      if (view) patch.defaultView = view;
      if (dto.pageSize != null) patch.defaultPageSize = Number(dto.pageSize) || 20;
    }

    if (Object.keys(patch).length) this.prefs.update(patch);
  }

  /**
   * Push the current settings to the server. Pass `bgFile` when the user picked
   * a new background image — it's PUT to the returned pre-signed `uploadUrl`, and
   * the server's readable `accessUrl` is adopted as the background and emitted so
   * the caller can show it. Emits null when no new background was sent.
   */
  save(bgFile?: File | null): Observable<string | null> {
    // BgImage giờ là FileUploadInfo (metadata) qua [FromForm], KHÔNG gửi file bytes.
    // Setting background chỉ cần original size → resize = null (0). Đọc kích thước
    // ảnh trước rồi mới build form.
    const info$: Observable<FileUploadInfo | null> =
      bgFile ? from(buildFileUploadInfo(bgFile)) : of(null);
    return info$.pipe(switchMap(bgInfo => this.saveWith(bgFile, bgInfo)));
  }

  private saveWith(
    bgFile: File | null | undefined,
    bgInfo: FileUploadInfo | null,
  ): Observable<string | null> {
    const form = new FormData();
    const p = this.prefs.current;

    form.append('Language', this.translation.currentLang);
    form.append('Theme', toEnumName(this.theme.currentTheme, THEME_VALUES, THEME_NAMES));
    form.append('Transition', toEnumName(this.theme.themeTransition, TRANSITION_VALUES, TRANSITION_NAMES));

    if (bgInfo) appendFileUploadInfo(form, 'BgImage', bgInfo);
    form.append('BgOpacity', String(this.theme.backgroundOpacity));
    form.append('BgBlur', String(this.theme.backgroundBlur));

    if (this.theme.fontFamily) form.append('FontFamily', this.theme.fontFamily);
    form.append('FontSize', String(this.theme.fontSize));
    form.append('FontWeight', this.theme.fontWeight);
    if (this.theme.fontColor) form.append('FontColor', this.theme.fontColor);

    form.append('ListView', toEnumName(p.defaultView, VIEW_VALUES, VIEW_NAMES));
    form.append('PageSize', String(p.defaultPageSize));

    form.append('ProgressReadMode', toEnumName(p.readProgressMode, MODE_VALUES, MODE_NAMES));
    form.append('RetentionDays', String(p.retentionDays));
    form.append('MaxEntries', String(p.maxEntries));

    // First save creates the row; every save afterwards (and after a successful
    // GET) updates it. Both endpoints take the same multipart body and reply
    // with a pre-signed S3 URL when a new background was uploaded.
    const request$ = this.hasServerSettings
      ? this.http.put<any>(`${this.base}/update`, form)
      : this.http.post<any>(`${this.base}/create`, form);

    // Emits the readable `accessUrl` of the freshly-uploaded background (or null
    // when no new file was sent) so the caller can show it in the URL field.
    return request$.pipe(
      tap(() => { this.hasServerSettings = true; }),
      switchMap(res => {
        const result = (res?.value ?? res) as UserSettingResult | null;
        const uploadUrl = result?.uploadUrl ?? null;
        const accessUrl = result?.accessUrl ?? null;
        if (bgFile && typeof uploadUrl === 'string' && /^https?:\/\//.test(uploadUrl)) {
          // PUT to S3, then adopt the server's readable `accessUrl` (forced —
          // the pick is now committed server-side, so it overrides this
          // session's "user touched it" guard). Never display `uploadUrl`: it's
          // a PUT URL a private bucket won't serve on GET.
          return this.uploadToS3(uploadUrl, bgFile).pipe(
            tap(() => { if (accessUrl) this.theme.setBackgroundImage(accessUrl, true); }),
            map(() => accessUrl),
          );
        }
        return of(accessUrl);
      }),
    );
  }

  private uploadToS3(url: string, file: File): Observable<unknown> {
    return this.s3Http.put(url, file, {
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
    });
  }
}
