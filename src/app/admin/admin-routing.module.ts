import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AdminGuard } from '../core/guards/admin.guard';
import { AdminLayoutComponent } from './layout/admin-layout/admin-layout.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { MangaListComponent } from './pages/manga-list/manga-list.component';
import { MangaFormComponent } from './pages/manga-form/manga-form.component';
import { ChapterListComponent } from './pages/chapter-list/chapter-list.component';
import { UserListComponent } from './pages/user-list/user-list.component';

const routes: Routes = [
  {
    path: '',
    component: AdminLayoutComponent,
    canActivate: [AdminGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: DashboardComponent },
      { path: 'manga', component: MangaListComponent },
      { path: 'manga/create', component: MangaFormComponent },
      { path: 'manga/edit/:id', component: MangaFormComponent },
      { path: 'manga/:mangaId/chapters', component: ChapterListComponent },
      { path: 'users', component: UserListComponent },
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AdminRoutingModule {}
