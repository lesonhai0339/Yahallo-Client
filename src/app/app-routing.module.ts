import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HomeComponent } from './features/home/home.component';
import { MangaDetailComponent } from './features/manga/manga-detail/manga-detail.component';
import { MangaReaderComponent } from './features/manga/manga-reader/manga-reader.component';
import { MangaSearchComponent } from './features/manga/manga-search/manga-search.component';
import { LoginComponent } from './features/auth/login/login.component';
import { RegisterComponent } from './features/auth/register/register.component';
import { ForgotPasswordComponent } from './features/auth/forgot-password/forgot-password.component';
import { ProfileComponent } from './features/user/profile/profile.component';
import { SettingsComponent } from './features/user/settings/settings.component';
import { NotificationsComponent } from './features/user/notifications/notifications.component';
import { TopMangaComponent } from './features/manga/top-manga/top-manga.component';
import { MangaListPageComponent } from './features/manga/manga-list-page/manga-list-page.component';
import { AuthGuard } from './core/guards/auth.guard';
import { ErrorPageComponent } from './features/error/error-page.component';
import { OfflineReaderComponent } from './features/offline-reader/offline-reader.component';
import { PersonDetailComponent } from './features/person/person-detail/person-detail.component';

const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'manga/:id', component: MangaDetailComponent },
  { path: 'manga/:id/chapter/:chapterId/:chapterIndex', component: MangaReaderComponent },
  { path: 'search', component: MangaSearchComponent },
  { path: 'search/advanced', component: MangaSearchComponent },
  { path: 'the-loai/:id', component: MangaSearchComponent },
  { path: 'latest', component: MangaListPageComponent, data: { mode: 'latest', titleKey: 'HOME.LATEST_UPDATE', icon: 'fa-solid fa-clock-rotate-left' } },
  // 'new' sắp theo CreateDate (mới thêm vào site), khác 'latest' sắp theo
  // LastUpdate (mới ra chương). Dùng chung MangaListPageComponent.
  { path: 'new', component: MangaListPageComponent, data: { mode: 'new', titleKey: 'HOME.NEW_MANGA', icon: 'fa-solid fa-certificate' } },
  { path: 'popular', component: MangaListPageComponent, data: { mode: 'popular', titleKey: 'HOME.POPULAR', icon: 'fa-solid fa-chart-line' } },
  { path: 'top-manga', component: TopMangaComponent },
  { path: 'top-manga/:criterion', component: TopMangaComponent },
  { path: 'author/:id', component: PersonDetailComponent, data: { kind: 'author' } },
  { path: 'artist/:id', component: PersonDetailComponent, data: { kind: 'artist' } },
  { path: 'tag/:id', component: PersonDetailComponent, data: { kind: 'tag' } },
  // "Xem thêm" từ trang đối tượng → cùng giao diện /latest nhưng lọc theo đối tượng.
  { path: 'author/:id/manga', component: MangaListPageComponent, data: { mode: 'author', titleKey: 'PERSON.WORKS_BY', icon: 'fa-solid fa-pen-nib' } },
  { path: 'artist/:id/manga', component: MangaListPageComponent, data: { mode: 'artist', titleKey: 'PERSON.WORKS_BY', icon: 'fa-solid fa-palette' } },
  { path: 'tag/:id/manga', component: MangaListPageComponent, data: { mode: 'tag', titleKey: 'PERSON.MANGA_IN_TAG', icon: 'fa-solid fa-tags' } },
  { path: 'auth/login', component: LoginComponent },
  { path: 'auth/register', component: RegisterComponent },
  { path: 'auth/forgot-password', component: ForgotPasswordComponent },
  { path: 'user/:id/:name', component: ProfileComponent, canActivate: [AuthGuard] },
  { path: 'user/:id/:name/notifications', component: NotificationsComponent, canActivate: [AuthGuard] },
  // Profile tab deep-links (info | following | history | settings). Phải đứng sau 'notifications'.
  { path: 'user/:id/:name/:tab', component: ProfileComponent, canActivate: [AuthGuard] },
  { path: 'settings', component: SettingsComponent },
  { path: 'offline', component: OfflineReaderComponent },
  {
    path: 'admin',
    loadChildren: () => import('./admin/admin.module').then(m => m.AdminModule)
  },
  // `status` được ErrorPageComponent báo ngược cho Express khi render ở server:
  // 503 để Google hiểu "API đang chết, quay lại sau" thay vì index trang lỗi,
  // 404 để URL sai không còn trả 200 kèm trang chủ (soft 404).
  {
    path: 'server-error', component: ErrorPageComponent,
    data: {
      code: '503', titleKey: 'ERROR.SERVER_DOWN', descKey: 'ERROR.SERVER_DOWN_DESC',
      icon: 'fa-solid fa-server', status: 503,
    },
  },
  {
    path: '**', component: ErrorPageComponent,
    data: {
      code: '404', titleKey: 'ERROR.NOT_FOUND', descKey: 'ERROR.NOT_FOUND_DESC',
      icon: 'fa-solid fa-compass', status: 404,
    },
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { scrollPositionRestoration: 'top' })],
  exports: [RouterModule]
})
export class AppRoutingModule {}
