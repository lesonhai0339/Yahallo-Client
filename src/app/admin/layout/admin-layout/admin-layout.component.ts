import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Subject } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';
import { AuthService } from '../../../core/services/auth.service';
import { PermissionService } from '../../../core/services/permission.service';
import { Permission, AppRole } from '../../../core/models/permission.model';
import { ThemeService } from '../../../core/services/theme.service';
import { TranslationService, SupportedLang } from '../../../core/services/translation.service';
import { NotificationService } from '../../../core/services/notification.service';
import { UserInteractionService } from '../../../core/services/user-interaction.service';
import { ensureUtcMarker } from '../../../core/utils/date-format';

interface NavItem {
  label: string;
  path: string;
  icon: string;
  permission?: Permission;
}

@Component({
  selector: 'app-admin-layout',
  templateUrl: './admin-layout.component.html',
  styleUrls: ['./admin-layout.component.scss']
})
export class AdminLayoutComponent implements OnInit, OnDestroy {
  sidebarOpen = true;
  currentRoute = '';
  visibleNavItems: NavItem[] = [];

  private allNavItems: NavItem[] = [
    { label: 'Dashboard', path: '/admin/dashboard', icon: 'dashboard', permission: Permission.ViewDashboard },
    { label: 'Quản lý Truyện', path: '/admin/manga', icon: 'menu_book', permission: Permission.ManageManga },
    { label: 'Quản lý Users', path: '/admin/users', icon: 'people', permission: Permission.ManageUsers },
    { label: 'Tag / Tác giả', path: '/admin/taxonomy', icon: 'sell' },
    { label: 'Yêu cầu Taxonomy', path: '/admin/taxonomy-requests', icon: 'inbox', permission: Permission.ManageTaxonomy },
    { label: 'Thảo luận', path: '/admin/topics', icon: 'forum' },
    // ── ⚠️ MODULE MỚI THÊM (3 item dưới) — docs/ADMIN_MODULES_ADDED.md ──
    { label: 'Kiểm duyệt BL', path: '/admin/comments', icon: 'gpp_maybe', permission: Permission.ModerateComments },
    { label: 'Thùng rác', path: '/admin/trash', icon: 'delete_outline', permission: Permission.ManageManga },
    { label: 'Quản lý Role', path: '/admin/roles', icon: 'badge', permission: Permission.ManageRoles },
    { label: 'Sửa ảnh', path: '/admin/image-editor', icon: 'brush', permission: Permission.ManageChapters },
  ];

  private destroy$ = new Subject<void>();

  // ── Topbar: profile menu / ngôn ngữ / theme / thông báo ────────────────────
  isUserMenuOpen = false;
  isLangOpen = false;
  isNotifOpen = false;

  notifications: any[] = [];
  unreadCount = 0;

  availableLangs: SupportedLang[] = [];
  currentLang: SupportedLang = 'vi';

  /** Cờ quốc gia dùng flagcdn (emoji cờ render trắng trên Windows desktop). */
  readonly langLabels: Record<SupportedLang, { label: string; iso: string }> = {
    vi: { label: 'VI', iso: 'vn' },
    en: { label: 'EN', iso: 'gb' },
  };

  constructor(
    public auth: AuthService,
    public perm: PermissionService,
    public themeService: ThemeService,
    public translation: TranslationService,
    private notifService: NotificationService,
    private userInteraction: UserInteractionService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Mobile: start with the sidebar hidden so the header toggle is reachable.
    if (window.innerWidth <= 768) {
      this.sidebarOpen = false;
    }

    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      takeUntil(this.destroy$)
    ).subscribe((e: any) => {
      this.currentRoute = e.urlAfterRedirects;
    });
    this.currentRoute = this.router.url;

    this.perm.permissions$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.visibleNavItems = this.allNavItems.filter(
        item => !item.permission || this.perm.hasPermission(item.permission)
      );
    });

    // Ngôn ngữ: dùng chung TranslationService với header ngoài trang chính, nên
    // đổi ở admin cũng có hiệu lực toàn app và được lưu lại.
    this.availableLangs = this.translation.getAvailableLangs();
    this.currentLang = this.translation.currentLang;
    this.translation.lang$.pipe(takeUntil(this.destroy$)).subscribe(l => this.currentLang = l);

    // Thông báo: dùng chung store + SignalR hub với header chính.
    this.notifService.unreadCount.pipe(takeUntil(this.destroy$)).subscribe(c => this.unreadCount = c);
    this.notifService.notifications.pipe(takeUntil(this.destroy$))
      .subscribe(n => this.notifications = n.slice(0, 8));
    if (this.currentUser) {
      this.loadNotifications();
      this.notifService.startHub();
    }
  }

  /** Đóng các dropdown khi click ra ngoài. */
  @HostListener('document:click', ['$event'])
  onDocumentClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    if (!t.closest('.admin-user-menu')) this.isUserMenuOpen = false;
    if (!t.closest('.admin-lang')) this.isLangOpen = false;
    if (!t.closest('.admin-notif')) this.isNotifOpen = false;
    if (!t.closest('.view-as')) this.showViewAsSwitcher = false;
  }

  // ── Profile menu ───────────────────────────────────────────────────────────

  toggleUserMenu(): void {
    this.isUserMenuOpen = !this.isUserMenuOpen;
    if (this.isUserMenuOpen) { this.isLangOpen = false; this.isNotifOpen = false; }
  }

  /** Route tới trang cá nhân — cùng dạng /user/:id/:name như header chính. */
  get profileLink(): any[] | null {
    const u = this.currentUser;
    return u?.id ? ['/user', u.id, u.name || 'user'] : null;
  }

  goToProfile(tab?: string): void {
    const link = this.profileLink;
    if (!link) return;
    this.isUserMenuOpen = false;
    this.router.navigate(tab ? [...link, tab] : link);
  }

  // ── Ngôn ngữ ───────────────────────────────────────────────────────────────

  toggleLang(): void {
    this.isLangOpen = !this.isLangOpen;
    if (this.isLangOpen) { this.isUserMenuOpen = false; this.isNotifOpen = false; }
  }

  switchLang(lang: SupportedLang): void {
    this.translation.setLanguage(lang);
    this.isLangOpen = false;
  }

  flagUrl(lang: SupportedLang): string {
    return `https://flagcdn.com/h20/${this.langLabels[lang].iso}.png`;
  }

  // ── Theme ──────────────────────────────────────────────────────────────────

  /** Doi theme kem hieu ung lan tu vi tri click (xem ThemeService). */
  toggleTheme(event?: MouseEvent): void {
    this.themeService.toggleWithRipple(event);
  }

  // ── Thông báo ──────────────────────────────────────────────────────────────

  toggleNotif(): void {
    this.isNotifOpen = !this.isNotifOpen;
    if (this.isNotifOpen) { this.isUserMenuOpen = false; this.isLangOpen = false; }
  }

  loadNotifications(): void {
    const u = this.currentUser;
    if (!u?.id) return;
    this.userInteraction.getUnreadNotifications(u.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe(notifs => this.notifService.setNotifications(notifs as any));
  }

  notifIcon(n: any): string {
    return this.notifService.iconFor(n);
  }

  /**
   * Mốc thời gian thông báo, chuẩn hoá về UTC trước khi qua pipe `date`.
   * AdminModule lazy-load không dùng được `UtcDatePipe` (khai báo ở AppModule).
   */
  notifTime(n: any): string | null {
    return ensureUtcMarker(n?.createDate ?? n?.dateTime);
  }

  openNotif(item: any): void {
    if (!item.seen) {
      // Mention (kind = 5) có endpoint riêng; còn lại dùng mark-read thường.
      const seen$ = this.notifService.isMention(item)
        ? this.notifService.markMentionSeen(item.id)
        : this.userInteraction.markNotificationRead(item.id);
      seen$.subscribe();
      this.notifService.decrementUnread();
      item.seen = true;
    }
    const link = this.notifService.linkFor(item);
    const queryParams = this.notifService.queryParamsFor(item);
    if (link) this.router.navigate(link, queryParams ? { queryParams } : undefined);
    this.isNotifOpen = false;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  isActive(path: string): boolean {
    if (path === '/admin/manga') {
      return this.currentRoute.startsWith('/admin/manga');
    }
    return this.currentRoute === path || this.currentRoute.startsWith(path + '/');
  }

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }

  closeSidebar(): void {
    this.sidebarOpen = false;
  }

  /** On mobile, close the overlay sidebar after navigating. */
  onNavClick(): void {
    if (window.innerWidth <= 768) {
      this.sidebarOpen = false;
    }
  }

  logout(): void {
    // logout() là Observable lạnh → phải subscribe mới thực sự gọi API.
    this.auth.logout().subscribe(() => this.router.navigate(['/auth/login']));
  }

  get currentUser() {
    return this.auth.currentUser;
  }

  viewAsOptions: { label: string; role: AppRole | null }[] = [
    { label: 'Admin', role: null },
    { label: 'Moderator', role: AppRole.Moderator },
    { label: 'Translator', role: AppRole.Trans },
  ];

  showViewAsSwitcher = false;

  toggleViewAsSwitcher(): void {
    this.showViewAsSwitcher = !this.showViewAsSwitcher;
  }

  /**
   * Cờ để DỰNG LẠI <router-outlet>. Đổi view-as chỉ thay đổi permissions$, còn
   * component đang hiển thị vẫn giữ nguyên instance + dữ liệu đã fetch (vd
   * manga-list vẫn hiện truyện của mọi người dù đã chuyển sang view Trans có
   * ViewOwnMangaOnly). Destroy rồi tạo lại outlet buộc trang chạy lại ngOnInit.
   */
  reloadingOutlet = false;

  /** Quyền mà route đang mở yêu cầu (đọc từ `data.permission` của leaf route). */
  private currentRoutePermission(): Permission | null {
    let route = this.router.routerState.root;
    let permission: Permission | null = null;
    while (route.firstChild) {
      route = route.firstChild;
      permission = (route.snapshot.data?.['permission'] as Permission) ?? permission;
    }
    return permission;
  }

  switchViewAs(role: AppRole | null): void {
    this.perm.setViewAs(role);
    this.showViewAsSwitcher = false;

    // Trang đang mở có thể vượt quyền của role vừa chọn — PermissionGuard chỉ
    // chạy lúc điều hướng, nên phải tự kiểm tra rồi đá về dashboard.
    const needed = this.currentRoutePermission();
    if (needed && !this.perm.hasPermission(needed)) {
      this.router.navigate(['/admin/dashboard']);
      return;
    }

    // Được phép ở lại → dựng lại outlet để trang tải lại dữ liệu theo role mới.
    this.reloadingOutlet = true;
    setTimeout(() => this.reloadingOutlet = false);
  }
}
