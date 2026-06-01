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
import { NotificationsComponent } from './features/user/notifications/notifications.component';
import { AuthGuard } from './core/guards/auth.guard';

const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'manga/:id/:name', component: MangaDetailComponent },
  { path: 'manga/:id/:name/:chapterId/:chapterIndex', component: MangaReaderComponent, canActivate: [AuthGuard] },
  { path: 'search', component: MangaSearchComponent },
  { path: 'search/advanced', component: MangaSearchComponent },
  { path: 'the-loai/:id', component: MangaSearchComponent },
  { path: 'auth/login', component: LoginComponent },
  { path: 'auth/register', component: RegisterComponent },
  { path: 'auth/forgot-password', component: ForgotPasswordComponent },
  { path: 'user/:id/:name', component: ProfileComponent, canActivate: [AuthGuard] },
  { path: 'user/:id/:name/notifications', component: NotificationsComponent, canActivate: [AuthGuard] },
  {
    path: 'admin',
    loadChildren: () => import('./admin/admin.module').then(m => m.AdminModule)
  },
  { path: '**', redirectTo: '' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { scrollPositionRestoration: 'top' })],
  exports: [RouterModule]
})
export class AppRoutingModule {}
