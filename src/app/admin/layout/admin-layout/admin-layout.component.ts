import { Component, OnInit } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-admin-layout',
  templateUrl: './admin-layout.component.html',
  styleUrls: ['./admin-layout.component.scss']
})
export class AdminLayoutComponent implements OnInit {
  sidebarOpen = true;
  currentRoute = '';

  navItems = [
    { label: 'Dashboard', path: '/admin/dashboard', icon: 'dashboard' },
    { label: 'Quản lý Truyện', path: '/admin/manga', icon: 'menu_book' },
    { label: 'Quản lý Users', path: '/admin/users', icon: 'people' },
  ];

  constructor(public auth: AuthService, private router: Router) {}

  ngOnInit(): void {
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd)
    ).subscribe((e: any) => {
      this.currentRoute = e.urlAfterRedirects;
    });
    this.currentRoute = this.router.url;
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

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/auth/login']);
  }

  get currentUser() {
    return this.auth.currentUser;
  }
}
