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
import { TaxonomyListComponent } from './pages/taxonomy-list/taxonomy-list.component';
import { TaxonomyRequestsComponent } from './pages/taxonomy-requests/taxonomy-requests.component';
// ⚠️ MODULE MỚI THÊM — xem docs/ADMIN_MODULES_ADDED.md
import { CommentModerationComponent } from './pages/comment-moderation/comment-moderation.component';
import { TrashBinComponent } from './pages/trash-bin/trash-bin.component';
import { RoleListComponent } from './pages/role-list/role-list.component';
import { ImageEditorComponent } from './pages/image-editor/image-editor.component';
import { ChapterImagesComponent } from './pages/chapter-images/chapter-images.component';

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
      {
        // Visible to all admin-access roles; the page itself switches between
        // direct manage (admin) and request mode (mod/trans).
        path: 'taxonomy',
        component: TaxonomyListComponent,
      },
      {
        path: 'taxonomy-requests',
        component: TaxonomyRequestsComponent,
        canActivate: [PermissionGuard],
        data: { permission: Permission.ManageTaxonomy }
      },
      // ── ⚠️ MODULE MỚI THÊM (3 route dưới) — docs/ADMIN_MODULES_ADDED.md ──
      {
        path: 'comments',
        component: CommentModerationComponent,
        canActivate: [PermissionGuard],
        // ModerateComments (Admin + Mod), KHÔNG dùng ManageManga vì Trans cũng có.
        data: { permission: Permission.ModerateComments }
      },
      {
        path: 'trash',
        component: TrashBinComponent,
        canActivate: [PermissionGuard],
        data: { permission: Permission.ManageManga }
      },
      {
        path: 'roles',
        component: RoleListComponent,
        canActivate: [PermissionGuard],
        data: { permission: Permission.ManageRoles }
      },
      {
        // Quan ly anh cua 1 chuong (xem/xoa/thay/dao vi tri/sua anh).
        path: 'chapter/:chapterId/images',
        component: ChapterImagesComponent,
        canActivate: [PermissionGuard],
        data: { permission: Permission.ManageChapters }
      },
      {
        // Translator dung duoc: gate bang ManageChapters (Admin/Mod/Trans deu co).
        path: 'image-editor',
        component: ImageEditorComponent,
        canActivate: [PermissionGuard],
        data: { permission: Permission.ManageChapters }
      },
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AdminRoutingModule {}
