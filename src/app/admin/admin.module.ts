import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgChartsModule } from 'ng2-charts';

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
import { MangaAnalyticsComponent } from './pages/manga-analytics/manga-analytics.component';
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
    DashboardComponent,
    MangaListComponent,
    MangaFormComponent,
    ChapterListComponent,
    UserListComponent,
    MangaAnalyticsComponent,
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
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AdminRoutingModule,
    NgChartsModule,
    ...MAT_MODULES,
  ],
})
export class AdminModule {}
