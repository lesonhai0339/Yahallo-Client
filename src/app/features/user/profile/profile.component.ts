import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../../../core/services/auth.service';
import { UserService } from '../../../core/services/user.service';
import { UserInteractionService } from '../../../core/services/user-interaction.service';
import { ReadingProgressService } from '../../../core/services/reading-progress.service';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';
import { TranslationService } from '../../../core/services/translation.service';
import { DownloadService } from '../../../core/services/download.service';
import { UserProfile, ReadingHistoryItem, ReadingHistoryChapter } from '../../../core/models/interfaces';
import { chapterName } from '../../../core/utils/chapter-label';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnInit, OnDestroy {
  user: any = null;
  profile: UserProfile | null = null;
  private viewedId = '';
  following: any[] = [];
  followingPage = 1;
  followingPageSize = 24;
  followingTotal = 0;
  readingHistory: ReadingHistoryItem[] = [];
  historyPage = 1;
  historyPageSize = 20;
  historyTotal = 0;
  /** Số chương gần nhất hiện trong dropdown của một truyện. */
  readonly HISTORY_CHAPTER_LIMIT = 5;
  /**
   * `mangaId` của các thẻ đang mở dropdown. Dùng Set thay vì một field
   * `openMangaId` để mở được nhiều thẻ cùng lúc — người dùng hay so tiến trình
   * giữa vài bộ, đóng thẻ này để mở thẻ kia thì khó chịu.
   */
  openHistoryIds = new Set<string>();
  activeTab = 'info';
  readonly validTabs = ['info', 'following', 'history', 'frames', 'downloads', 'settings'];
  isLoading = true;
  followingLoading = false;
  historyLoading = false;

  // Temp profile cover until a per-user background field exists on the backend.
  readonly defaultCover = 'https://cdn.yahallo.online/public/user_backgrounds/1.jpg';
  get coverImage(): string {
    return this.user?.background || this.user?.coverImage || this.defaultCover;
  }

  // ── Edit-profile state (owner only) ──────────────────────────────────────────
  editing = false;
  saving = false;
  displayNameInput = '';
  phoneInput = '';
  avatarFile: File | null = null;
  backgroundFile: File | null = null;
  avatarPreview: string | null = null;
  backgroundPreview: string | null = null;

  // ── Image crop dialog state ──────────────────────────────────────────────────
  /** Aspect ratios of the crop frame per target (1 = square avatar, 3 = banner). */
  private static readonly CROP_ASPECT = { avatar: 1, background: 3 } as const;
  /** The freshly-picked file awaiting crop; null when the dialog is closed. */
  cropFile: File | null = null;
  cropKind: 'avatar' | 'background' | null = null;
  cropAspect = 1;
  cropRound = false;
  cropTitleKey = 'USER.CROP_TITLE';

  // ── Change-password state (owner only) ───────────────────────────────────────
  changingPassword = false;
  savingPassword = false;
  oldPassword = '';
  newPassword = '';
  confirmPassword = '';

  get isOwner(): boolean {
    const uid = this.auth.currentUser?.id;
    return !!uid && uid === (this.profile?.id ?? this.user?.id);
  }

  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private auth: AuthService,
    private userService: UserService,
    private userInteraction: UserInteractionService,
    private readingProgress: ReadingProgressService,
    private prefs: UserPreferencesService,
    private toastr: ToastrService,
    private i18n: TranslationService,
    public download: DownloadService,
  ) {}

  private t(key: string): string { return this.i18n.get(key); }

  // ── Downloads tab ────────────────────────────────────────────────────────────
  cancelDownload(id: string): void { this.download.cancel(id); }
  resumeDownload(id: string): void { this.download.resume(id); }
  removeDownload(id: string): void { this.download.remove(id); }
  trackJob = (_: number, j: { id: string }) => j.id;

  ngOnInit(): void {
    // History pagination follows the user's effective page-size preference
    // (includes the local "temp" override from settings).
    this.historyPageSize = this.prefs.current.defaultPageSize;

    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(pm => {
      // Mở đúng tab theo route param (info | following | history | frames | settings).
      const tab = pm.get('tab') ?? 'info';
      this.activeTab = this.validTabs.includes(tab) ? tab : 'info';

      // Tải profile theo id trên route (fallback về user đang đăng nhập).
      const id = pm.get('id') ?? this.auth.currentUser?.id ?? '';
      if (id && id !== this.viewedId) {
        this.viewedId = id;
        this.loadProfile(id);
      }
    });
  }

  private loadProfile(id: string): void {
    this.isLoading = true;
    this.userService.getProfile(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: p => {
        this.profile = p;
        // Avatar + background đọc từ kết quả API (card-body dùng coverImage).
        this.user = {
          id: p.id,
          name: p.displayName || p.email,
          email: p.email,
          avatar: p.avatar || '/assets/user.jpg',
          background: p.background,
        };
        this.isLoading = false;
        this.loadFollowing();
        this.loadHistory();
      },
      error: () => {
        // Fallback: dùng user đang đăng nhập nếu API lỗi.
        this.user = this.auth.currentUser;
        this.profile = null;
        this.isLoading = false;
        if (this.user) {
          this.loadFollowing();
          this.loadHistory();
        }
      },
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadFollowing(page: number = this.followingPage): void {
    if (!this.user) return;
    this.followingPage = page;
    this.followingLoading = true;
    this.userInteraction.getFollowing(this.user.id, page, this.followingPageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: res => {
          this.following = res.items;
          this.followingTotal = res.totalCount;
          this.followingLoading = false;
        },
        error: () => { this.followingLoading = false; },
      });
  }

  onFollowingPageChange(page: number): void {
    this.loadFollowing(page);
  }

  /**
   * Chức năng: nạp một trang lịch sử đọc (gom theo truyện).
   * Yêu cầu: `page` đếm từ 1; đã đăng nhập — endpoint lấy user từ token nên KHÔNG
   *   truyền `user.id`, nhưng vẫn chặn khi chưa có `user` để tránh gọi lúc trang
   *   chưa dựng xong.
   * Kết quả trả về: không (gán `readingHistory`, `historyTotal`; `historyTotal`
   *   nay đếm theo TRUYỆN nên `app-pagination` tự đúng).
   * Exception: không ném — lỗi chỉ tắt cờ loading, service đã quy lỗi về trang rỗng.
   */
  loadHistory(page: number = this.historyPage): void {
    if (!this.user) return;
    this.historyPage = page;
    this.historyLoading = true;
    // Đổi thẻ truyện thì các dropdown đang mở không còn ý nghĩa — đóng hết.
    this.openHistoryIds.clear();
    this.readingProgress.getUserHistory(page, this.historyPageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: res => {
          this.readingHistory = res.data;
          this.historyTotal = res.totalCount;
          this.historyLoading = false;
        },
        error: () => { this.historyLoading = false; },
      });
  }

  onHistoryPageChange(page: number): void {
    this.loadHistory(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── Lịch sử đọc: dropdown tiến trình từng chương ────────────────────────────
  /**
   * Chức năng: mở/đóng dropdown chương của một thẻ truyện trong tab lịch sử.
   * Yêu cầu: `mangaId` — id truyện của thẻ vừa bấm.
   * Kết quả trả về: không (thêm/bớt trong `openHistoryIds`).
   * Exception: không ném — id rỗng thì bỏ qua.
   */
  toggleHistoryChapters(mangaId: string): void {
    if (!mangaId) return;
    if (this.openHistoryIds.has(mangaId)) this.openHistoryIds.delete(mangaId);
    else this.openHistoryIds.add(mangaId);
  }

  isHistoryOpen(mangaId: string): boolean {
    return this.openHistoryIds.has(mangaId);
  }

  /**
   * Chức năng: lấy các chương hiện trong dropdown — tối đa `HISTORY_CHAPTER_LIMIT`
   *   chương gần nhất, không đủ thì trả hết những gì có.
   * Yêu cầu: `h` — một dòng lịch sử đã chuẩn hoá (`chapters` đã sắp mới nhất trước
   *   ở service, nên ở đây chỉ cần cắt).
   * Kết quả trả về: mảng chương, rỗng nếu truyện chưa có chương nào.
   * Exception: không ném.
   */
  historyChapters(h: ReadingHistoryItem): ReadingHistoryChapter[] {
    return (h?.chapters ?? []).slice(0, this.HISTORY_CHAPTER_LIMIT);
  }

  /**
   * Chức năng: phần trăm đã đọc của một chương, để đổ vào thanh tiến trình.
   * Yêu cầu: `c.readIndex` 1-based, `c.totalPage` là tổng ảnh của chương.
   * Kết quả trả về: số nguyên 0–100; trả `0` khi thiếu `totalPage` (template ẩn
   *   thanh trong trường hợp đó nên không hiện "0%" gây hiểu nhầm).
   * Exception: không ném — kẹp trần 100 phòng khi server trả `readIndex` vượt tổng.
   */
  chapterProgressPercent(c: ReadingHistoryChapter): number {
    if (!c?.totalPage) return 0;
    return Math.min(100, Math.round((c.readIndex / c.totalPage) * 100));
  }

  /** Route đọc tiếp một chương — reader dùng 0-based nên trừ 1. */
  chapterReadLink(h: ReadingHistoryItem, c: ReadingHistoryChapter): any[] {
    return ['/manga', h.mangaId, 'chapter', c.chapterId, Math.max(0, c.readIndex - 1)];
  }

  /**
   * Tên chương — dùng util chung, dựng từ `index`/`subIndex` ("Chương 10.5").
   * KHÔNG lấy `title`: bên backend đó là mô tả và được phép rỗng, lấy nó thì mọi
   * chương không mô tả sẽ hiện dòng trống (xem chú thích đầu `chapter-label.ts`).
   */
  readonly chapterName = chapterName;

  setTab(tab: string): void {
    this.activeTab = tab;
  }

  // ── Edit profile ─────────────────────────────────────────────────────────────
  startEdit(): void {
    this.editing = true;
    this.displayNameInput = this.profile?.displayName ?? this.user?.name ?? '';
    this.phoneInput = this.profile?.phoneNumber ?? '';
    this.clearPicks();
  }

  cancelEdit(): void {
    this.editing = false;
    this.clearPicks();
  }

  private clearPicks(): void {
    if (this.avatarPreview) URL.revokeObjectURL(this.avatarPreview);
    if (this.backgroundPreview) URL.revokeObjectURL(this.backgroundPreview);
    this.avatarFile = this.backgroundFile = null;
    this.avatarPreview = this.backgroundPreview = null;
  }

  onPick(event: Event, kind: 'avatar' | 'background'): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { this.toastr.error(this.t('USER.T_IMG_ONLY')); return; }
    // Open the crop dialog instead of using the raw file — the user pans/zooms to
    // pick the area, and onCropConfirmed receives the cropped File.
    this.cropKind = kind;
    this.cropAspect = ProfileComponent.CROP_ASPECT[kind];
    this.cropRound = kind === 'avatar';
    this.cropTitleKey = kind === 'avatar' ? 'USER.CROP_TITLE_AVATAR' : 'USER.CROP_TITLE_BG';
    this.cropFile = file;
  }

  onCropConfirmed(file: File): void {
    const kind = this.cropKind;
    const url = URL.createObjectURL(file);
    if (kind === 'avatar') {
      if (this.avatarPreview) URL.revokeObjectURL(this.avatarPreview);
      this.avatarFile = file; this.avatarPreview = url;
    } else if (kind === 'background') {
      if (this.backgroundPreview) URL.revokeObjectURL(this.backgroundPreview);
      this.backgroundFile = file; this.backgroundPreview = url;
    }
    this.closeCrop();
  }

  closeCrop(): void {
    this.cropFile = null;
    this.cropKind = null;
  }

  saveProfile(): void {
    const id = this.profile?.id ?? this.user?.id;
    if (!id) return;
    this.saving = true;
    this.auth.updateProfile(
      {
        id,
        displayName: this.displayNameInput?.trim() || undefined,
        phoneNumber: this.phoneInput?.trim() || undefined,
      },
      this.avatarFile ?? undefined,
      this.backgroundFile ?? undefined,
    ).pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        this.saving = false;
        this.editing = false;
        this.clearPicks();
        if (res?.uploadFailed) this.toastr.warning(this.t('USER.T_UPLOAD_WARN'));
        else this.toastr.success(this.t('USER.T_PROFILE_SAVED'));
        // Vừa đổi profile → bỏ cache để load lại lấy dữ liệu mới (không dùng bản cũ).
        this.userService.invalidateProfile(id);
        this.loadProfile(id);
      },
      error: () => {
        this.saving = false;
        this.toastr.error(this.t('USER.T_PROFILE_ERR'));
      },
    });
  }

  // ── Change password ──────────────────────────────────────────────────────────
  startChangePassword(): void {
    this.changingPassword = true;
    this.oldPassword = this.newPassword = this.confirmPassword = '';
  }

  cancelChangePassword(): void {
    this.changingPassword = false;
    this.oldPassword = this.newPassword = this.confirmPassword = '';
  }

  submitChangePassword(): void {
    const email = this.profile?.email ?? this.user?.email;
    if (!email) return;

    const oldPwd = this.oldPassword;
    const newPwd = this.newPassword;
    if (!oldPwd || !newPwd || !this.confirmPassword) { this.toastr.warning(this.t('USER.T_PWD_FILL_ALL')); return; }
    if (newPwd.length < 6) { this.toastr.warning(this.t('USER.T_PWD_TOO_SHORT')); return; }
    if (newPwd !== this.confirmPassword) { this.toastr.warning(this.t('USER.T_PWD_MISMATCH')); return; }
    if (newPwd === oldPwd) { this.toastr.warning(this.t('USER.T_PWD_SAME')); return; }

    this.savingPassword = true;
    this.auth.changePassword(email, oldPwd, newPwd).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.savingPassword = false;
        this.cancelChangePassword();
        this.toastr.success(this.t('USER.T_PWD_CHANGED'));
      },
      error: () => {
        this.savingPassword = false;
        this.toastr.error(this.t('USER.T_PWD_ERR'));
      },
    });
  }
}
