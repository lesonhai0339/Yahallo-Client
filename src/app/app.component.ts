import { Component, OnInit } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { ThemeService } from './core/services/theme.service';
import { MasterDataService } from './core/services/master-data.service';
import { UserSettingsService } from './core/services/user-settings.service';

@Component({
  selector: 'app-root',
  template: `
    <app-header *ngIf="!isAdminRoute"></app-header>
    <main [style.min-height]="isAdminRoute ? '100vh' : 'calc(100vh - 60px)'">
      <router-outlet></router-outlet>
    </main>
    <app-footer *ngIf="!isAdminRoute"></app-footer>
    <app-download-tray *ngIf="!isAdminRoute"></app-download-tray>
  `,
  styles: [`
    main { display: block; }
  `]
})
export class AppComponent implements OnInit {
  isAdminRoute = false;

  constructor(
    private theme: ThemeService,
    private router: Router,
    private masterData: MasterDataService,
    // Injected so it boots at startup and pulls the user's settings on login.
    private userSettings: UserSettingsService,
  ) {}

  ngOnInit(): void {
    this.theme.apply();
    this.masterData.load();
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd)
    ).subscribe((e: any) => {
      this.isAdminRoute = (e.urlAfterRedirects as string).startsWith('/admin');
    });
    this.isAdminRoute = this.router.url.startsWith('/admin');
  }
}
