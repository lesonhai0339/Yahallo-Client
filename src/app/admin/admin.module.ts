import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

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

import { AdminRoutingModule } from './admin-routing.module';

// Layout
import { AdminLayoutComponent } from './layout/admin-layout/admin-layout.component';

// Pages
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { MangaListComponent } from './pages/manga-list/manga-list.component';
import { MangaFormComponent } from './pages/manga-form/manga-form.component';
import { ChapterListComponent } from './pages/chapter-list/chapter-list.component';
import { UserListComponent } from './pages/user-list/user-list.component';

// Shared dialogs & components
import { ConfirmDialogComponent } from './shared/confirm-dialog/confirm-dialog.component';
import { ChapterFormDialogComponent } from './shared/chapter-form-dialog/chapter-form-dialog.component';
import { UserRoleDialogComponent } from './shared/user-role-dialog/user-role-dialog.component';
import { MultiTagSelectComponent } from './shared/multi-tag-select/multi-tag-select.component';
import { RelatedMangaSelectorComponent } from './shared/related-manga-selector/related-manga-selector.component';

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
];

@NgModule({
  declarations: [
    AdminLayoutComponent,
    DashboardComponent,
    MangaListComponent,
    MangaFormComponent,
    ChapterListComponent,
    UserListComponent,
    ConfirmDialogComponent,
    ChapterFormDialogComponent,
    UserRoleDialogComponent,
    MultiTagSelectComponent,
    RelatedMangaSelectorComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AdminRoutingModule,
    ...MAT_MODULES,
  ],
})
export class AdminModule {}
