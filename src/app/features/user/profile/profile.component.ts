import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { UserInteractionService } from '../../../core/services/user-interaction.service';
import { ReadingProgressService } from '../../../core/services/reading-progress.service';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnInit, OnDestroy {
  user: any = null;
  following: any[] = [];
  followingPage = 1;
  followingPageSize = 24;
  followingTotal = 0;
  readingHistory: any[] = [];
  activeTab = 'info';
  readonly validTabs = ['info', 'following', 'history', 'settings'];
  isLoading = true;

  // Temp profile cover until a per-user background field exists on the backend.
  readonly defaultCover = 'https://cdn.yahallo.online/public/user_backgrounds/1.jpg';
  get coverImage(): string {
    return this.user?.background || this.user?.coverImage || this.defaultCover;
  }

  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private auth: AuthService,
    private userInteraction: UserInteractionService,
    private readingProgress: ReadingProgressService
  ) {}

  ngOnInit(): void {
    this.user = this.auth.currentUser;
    if (this.user) {
      this.loadFollowing();
      this.loadHistory();
    }
    this.isLoading = false;

    // Mở đúng tab theo route param (info | following | history | settings).
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(pm => {
      const tab = pm.get('tab') ?? 'info';
      this.activeTab = this.validTabs.includes(tab) ? tab : 'info';
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
}
