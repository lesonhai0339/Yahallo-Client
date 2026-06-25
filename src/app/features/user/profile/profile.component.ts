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
import { UserProfile } from '../../../core/models/interfaces';

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
  readingHistory: any[] = [];
  historyPage = 1;
  historyPageSize = 20;
  historyTotal = 0;
  activeTab = 'info';
  readonly validTabs = ['info', 'following', 'history', 'frames', 'downloads', 'settings'];
  isLoading = true;

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
    this.userInteraction.getFollowing(this.user.id, page, this.followingPageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe(res => {
        this.following = res.items;
        this.followingTotal = res.totalCount;
      });
  }

  onFollowingPageChange(page: number): void {
    this.loadFollowing(page);
  }

  loadHistory(page: number = this.historyPage): void {
    if (!this.user) return;
    this.historyPage = page;
    this.readingProgress.getPaginated(this.user.id, page, this.historyPageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe(res => {
        this.readingHistory = res.data;
        this.historyTotal = res.totalCount;
      });
  }

  onHistoryPageChange(page: number): void {
    this.loadHistory(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** Chapter display name: title if present, else "Chương {index}" (i18n). */
  chapterName(h: any): string {
    if (h?.chapterTitle) return h.chapterTitle;
    if (h?.chapterIndex != null) return `${this.t('USER.CHAPTER_LABEL')} ${h.chapterIndex}`;
    return '—';
  }

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
