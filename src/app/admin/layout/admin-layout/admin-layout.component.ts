import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Subject } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';
import { AuthService } from '../../../core/services/auth.service';
import { PermissionService } from '../../../core/services/permission.service';
import { Permission, AppRole } from '../../../core/models/permission.model';

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
  ];

  private destroy$ = new Subject<void>();

  constructor(
    public auth: AuthService,
    public perm: PermissionService,
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

  switchViewAs(role: AppRole | null): void {
    this.perm.setViewAs(role);
    this.showViewAsSwitcher = false;
  }
}
