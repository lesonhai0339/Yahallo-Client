import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AdminGuard } from '../core/guards/admin.guard';
import { PermissionGuard } from '../core/guards/permission.guard';
import { Permission } from '../core/models/permission.model';
import { AdminLayoutComponent } from './layout/admin-layout/admin-layout.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { MangaListComponent } from './pages/manga-list/manga-list.component';
import { MangaFormComponent } from './pages/manga-form/manga-form.component';
import { ChapterListComponent } from './pages/chapter-list/chapter-list.component';
import { MangaAnalyticsComponent } from './pages/manga-analytics/manga-analytics.component';
import { UserListComponent } from './pages/user-list/user-list.component';
import { UserAnalyticsComponent } from './pages/user-analytics/user-analytics.component';
import { TopicListComponent } from './pages/topic-list/topic-list.component';

const routes: Routes = [
  {
    path: '',
    component: AdminLayoutComponent,
    canActivate: [AdminGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: DashboardComponent },
      {
        path: 'manga/create',
        component: MangaFormComponent,
        canActivate: [PermissionGuard],
        data: { permission: Permission.CreateManga }
      },
      {
        path: 'manga/edit/:id',
        component: MangaFormComponent,
        canActivate: [PermissionGuard],
        data: { permission: Permission.EditManga }
      },
      {
        path: 'manga/:mangaId/chapters',
        component: ChapterListComponent,
        canActivate: [PermissionGuard],
        data: { permission: Permission.ManageChapters }
      },
      {
        path: 'manga/:id/analytics',
        component: MangaAnalyticsComponent,
        canActivate: [PermissionGuard],
        data: { permission: Permission.ViewAnalytics }
      },
      {
        path: 'manga',
        component: MangaListComponent,
        canActivate: [PermissionGuard],
        data: { permission: Permission.ManageManga }
      },
      {
        path: 'users/:id/analytics',
        component: UserAnalyticsComponent,
        canActivate: [PermissionGuard],
        data: { permission: Permission.ManageUsers }
      },
      {
        path: 'users',
        component: UserListComponent,
        canActivate: [PermissionGuard],
        data: { permission: Permission.ManageUsers }
      },
      {
        path: 'topics',
        component: TopicListComponent,
      },
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AdminRoutingModule {}
