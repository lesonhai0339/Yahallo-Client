import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
// ng2-charts v6 bỏ NgChartsModule: directive thành standalone, còn phần đăng ký
// controller/scale của Chart.js chuyển sang provider.
import { BaseChartDirective, provideCharts, withDefaultRegisterables } from 'ng2-charts';

// Angular Material
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatSortModule } from '@angular/material/sort';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { DragDropModule } from '@angular/cdk/drag-drop';

import { AdminRoutingModule } from './admin-routing.module';

// Layout
import { AdminLayoutComponent } from './layout/admin-layout/admin-layout.component';

// Pages
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { MangaListComponent } from './pages/manga-list/manga-list.component';
import { MangaFormComponent } from './pages/manga-form/manga-form.component';
import { ChapterListComponent } from './pages/chapter-list/chapter-list.component';
import { UserListComponent } from './pages/user-list/user-list.component';
import { UserProfileComponent } from './pages/user-profile/user-profile.component';
import { MangaAnalyticsComponent } from './pages/manga-analytics/manga-analytics.component';
import { MangaInfoComponent } from './pages/manga-info/manga-info.component';
import { TaxonomyInfoComponent } from './pages/taxonomy-info/taxonomy-info.component';
import { InteractionSkeletonComponent } from './shared/interaction-skeleton/interaction-skeleton.component';
import { UserAnalyticsComponent } from './pages/user-analytics/user-analytics.component';

// Shared dialogs & components
import { ConfirmDialogComponent } from './shared/confirm-dialog/confirm-dialog.component';
import { ChapterFormDialogComponent } from './shared/chapter-form-dialog/chapter-form-dialog.component';
import { UserRoleDialogComponent } from './shared/user-role-dialog/user-role-dialog.component';
import { MultiTagSelectComponent } from './shared/multi-tag-select/multi-tag-select.component';
import { RelatedMangaSelectorComponent } from './shared/related-manga-selector/related-manga-selector.component';
import { SendNotificationDialogComponent } from './shared/send-notification-dialog/send-notification-dialog.component';
import { UserMessagesDialogComponent } from './shared/user-messages-dialog/user-messages-dialog.component';
import { TopicListComponent } from './pages/topic-list/topic-list.component';
import { CreateTopicDialogComponent } from './shared/create-topic-dialog/create-topic-dialog.component';
import { ResetPasswordDialogComponent } from './shared/reset-password-dialog/reset-password-dialog.component';
import { TaxonomyListComponent } from './pages/taxonomy-list/taxonomy-list.component';
import { TaxonomyRequestsComponent } from './pages/taxonomy-requests/taxonomy-requests.component';
import { TaxonomyFormDialogComponent } from './shared/taxonomy-form-dialog/taxonomy-form-dialog.component';
import { DetailCardSkeletonComponent } from './shared/detail-card-skeleton/detail-card-skeleton.component';
import { TableSkeletonComponent } from './shared/table-skeleton/table-skeleton.component';
import { AnalyticsSkeletonComponent } from './shared/analytics-skeleton/analytics-skeleton.component';
import { FormSkeletonComponent } from './shared/form-skeleton/form-skeleton.component';
// ⚠️ MODULE MỚI THÊM (comment-moderation / trash-bin / role-list)
// → xem docs/ADMIN_MODULES_ADDED.md để remove chính xác.
import { CommentModerationComponent } from './pages/comment-moderation/comment-moderation.component';
import { TrashBinComponent } from './pages/trash-bin/trash-bin.component';
import { RoleListComponent } from './pages/role-list/role-list.component';
import { ImageEditorComponent } from './pages/image-editor/image-editor.component';
import { ImageEditorPanelComponent } from './shared/image-editor-panel/image-editor-panel.component';
import { ChapterImagesComponent } from './pages/chapter-images/chapter-images.component';

const MAT_MODULES = [
  MatTableModule,
  MatPaginatorModule,
  MatSortModule,
  MatFormFieldModule,
  MatInputModule,
  MatSelectModule,
  MatButtonModule,
  MatIconModule,
  MatDialogModule,
  MatTooltipModule,
  MatSlideToggleModule,
  MatChipsModule,
  MatCardModule,
  MatProgressBarModule,
  MatProgressSpinnerModule,
  DragDropModule,
];

@NgModule({
  declarations: [
    AdminLayoutComponent,
    DetailCardSkeletonComponent,
    TableSkeletonComponent,
    AnalyticsSkeletonComponent,
    FormSkeletonComponent,
    DashboardComponent,
    MangaListComponent,
    MangaFormComponent,
    ChapterListComponent,
    UserListComponent,
    UserProfileComponent,
    MangaAnalyticsComponent,
    MangaInfoComponent,
    TaxonomyInfoComponent,
    InteractionSkeletonComponent,
    UserAnalyticsComponent,
    ConfirmDialogComponent,
    ChapterFormDialogComponent,
    UserRoleDialogComponent,
    MultiTagSelectComponent,
    RelatedMangaSelectorComponent,
    SendNotificationDialogComponent,
    UserMessagesDialogComponent,
    TopicListComponent,
    CreateTopicDialogComponent,
    ResetPasswordDialogComponent,
    TaxonomyListComponent,
    TaxonomyRequestsComponent,
    TaxonomyFormDialogComponent,
    // ⚠️ MODULE MỚI THÊM — xoá 3 dòng dưới khi remove (docs/ADMIN_MODULES_ADDED.md)
    CommentModerationComponent,
    TrashBinComponent,
    RoleListComponent,
    ImageEditorComponent,
    ImageEditorPanelComponent,
    ChapterImagesComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AdminRoutingModule,
    BaseChartDirective,
    ...MAT_MODULES,
  ],
  providers: [provideCharts(withDefaultRegisterables())],
})
export class AdminModule {}
