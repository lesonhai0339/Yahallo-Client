import { Component, OnInit } from '@angular/core';
import { Router, NavigationEnd, NavigationError } from '@angular/router';
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
      // Điều hướng thành công → xóa cờ retry để lần outage sau vẫn được reload lại.
      sessionStorage.removeItem('chunkReload:' + e.url);
      sessionStorage.removeItem('chunkReload:' + e.urlAfterRedirects);
    });
    this.isAdminRoute = this.router.url.startsWith('/admin');

    // Lazy route (/admin) load có thể fail nếu server tắt/restart lúc client vẫn mở:
    // dynamic import() bị reject và webpack CACHE promise reject đó → mọi lần vào
    // /admin sau đều fail cho tới khi reload cả runtime. Bắt ChunkLoadError và hard
    // reload thẳng vào URL đích để trình duyệt tải lại chunk mới từ server đã hồi.
    this.router.events.pipe(
      filter((e): e is NavigationError => e instanceof NavigationError)
    ).subscribe(e => {
      if (this.isChunkLoadError(e.error)) {
        // Guard chống loop reload vô hạn nếu chunk hỏng thật sự (không phải do server down).
        const key = 'chunkReload:' + e.url;
        if (sessionStorage.getItem(key)) { sessionStorage.removeItem(key); return; }
        sessionStorage.setItem(key, '1');
        window.location.assign(e.url);
      }
    });
  }

  /** Nhận diện lỗi tải lazy chunk thất bại (nhiều dạng message tùy bundler/trình duyệt). */
  private isChunkLoadError(err: any): boolean {
    const name = err?.name ?? '';
    const msg = err?.message ?? String(err ?? '');
    return name === 'ChunkLoadError'
      || /Loading chunk .* failed/i.test(msg)
      || /(error )?loading dynamically imported module/i.test(msg)
      || /Failed to fetch dynamically imported module/i.test(msg);
  }
}
