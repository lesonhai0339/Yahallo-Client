import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../../../core/services/auth.service';
import { UserService } from '../../../core/services/user.service';
import { UserInteractionService } from '../../../core/services/user-interaction.service';
import { ReadingProgressService } from '../../../core/services/reading-progress.service';
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
  phoneInput = '';
  avatarFile: File | null = null;
  backgroundFile: File | null = null;
  avatarPreview: string | null = null;
  backgroundPreview: string | null = null;

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

  loadHistory(): void {
    if (!this.user) return;
    this.readingProgress.get(this.user.id).pipe(takeUntil(this.destroy$)).subscribe(h => {
      this.readingHistory = h || [];
    });
  }

  setTab(tab: string): void {
    this.activeTab = tab;
  }

  // ── Edit profile ─────────────────────────────────────────────────────────────
  startEdit(): void {
    this.editing = true;
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
    const url = URL.createObjectURL(file);
    if (kind === 'avatar') {
      if (this.avatarPreview) URL.revokeObjectURL(this.avatarPreview);
      this.avatarFile = file; this.avatarPreview = url;
    } else {
      if (this.backgroundPreview) URL.revokeObjectURL(this.backgroundPreview);
      this.backgroundFile = file; this.backgroundPreview = url;
    }
  }

  saveProfile(): void {
    const id = this.profile?.id ?? this.user?.id;
    if (!id) return;
    this.saving = true;
    this.auth.updateProfile(
      { id, phoneNumber: this.phoneInput?.trim() || undefined },
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
}
