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

  markRead(notif: any): void {
    this.userInteraction.markNotificationRead(notif.id).subscribe(() => {
      notif.isRead = true;
      this.notifService.decrementUnread();
    });
    if (notif.idTarget) {
      this.router.navigate(['/manga', notif.idTarget]);
    }
  }

  markAllRead(): void {
    this.notifService.markAllRead().subscribe(() => {
      this.notifications.forEach(n => n.isRead = true);
    });
  }
}
