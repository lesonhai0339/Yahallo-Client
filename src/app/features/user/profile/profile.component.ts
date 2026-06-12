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
  readingHistory: any[] = [];
  activeTab = 'info';
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
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadFollowing(): void {
    if (!this.user) return;
    this.userInteraction.getFollowing(this.user.id).pipe(takeUntil(this.destroy$)).subscribe(f => {
      this.following = f || [];
    });
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
