import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { Router } from '@angular/router';
import { NotificationService } from '../../../core/services/notification.service';
import { UserInteractionService } from '../../../core/services/user-interaction.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-notifications',
  templateUrl: './notifications.component.html',
  styleUrls: ['./notifications.component.scss']
})
export class NotificationsComponent implements OnInit, OnDestroy {
  notifications: any[] = [];
  isLoading = true;
  page = 1;
  totalPages = 1;

  private destroy$ = new Subject<void>();

  constructor(
    private notifService: NotificationService,
    private userInteraction: UserInteractionService,
    private auth: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadNotifications();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadNotifications(): void {
    const user = this.auth.currentUser;
    if (!user) return;
    this.isLoading = true;
    this.userInteraction.getUnreadNotifications(user.id).pipe(takeUntil(this.destroy$)).subscribe(n => {
      this.notifications = n || [];
      this.isLoading = false;
    });
  }

  notifIcon(n: any): string { return this.notifService.iconFor(n); }

  markRead(notif: any): void {
    if (!notif.seen) {
      // Mention (kind = 5) dùng endpoint riêng; còn lại dùng mark-read thường.
      const seen$ = this.notifService.isMention(notif)
        ? this.notifService.markMentionSeen(notif.id)
        : this.userInteraction.markNotificationRead(notif.id);
      seen$.subscribe(() => {
        notif.seen = true;
        this.notifService.decrementUnread();
      });
    }
    const link = this.notifService.linkFor(notif);
    const queryParams = this.notifService.queryParamsFor(notif);
    if (link) this.router.navigate(link, queryParams ? { queryParams } : undefined);
  }

  markAllRead(): void {
    this.notifService.markAllRead().subscribe(() => {
      this.notifications.forEach(n => n.isRead = true);
    });
  }
}
