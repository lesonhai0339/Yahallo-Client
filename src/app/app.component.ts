import { Component, OnInit } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { ThemeService } from './core/services/theme.service';

@Component({
  selector: 'app-root',
  template: `
    <app-header *ngIf="!isAdminRoute"></app-header>
    <main [style.min-height]="isAdminRoute ? '100vh' : 'calc(100vh - 60px)'">
      <router-outlet></router-outlet>
    </main>
    <app-footer *ngIf="!isAdminRoute"></app-footer>
  `,
  styles: [`
    main { display: block; }
  `]
})
export class AppComponent implements OnInit {
  isAdminRoute = false;

  constructor(private theme: ThemeService, private router: Router) {}

  ngOnInit(): void {
    this.theme.apply();
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd)
    ).subscribe((e: any) => {
      this.isAdminRoute = (e.urlAfterRedirects as string).startsWith('/admin');
    });
    this.isAdminRoute = this.router.url.startsWith('/admin');
  }
}
