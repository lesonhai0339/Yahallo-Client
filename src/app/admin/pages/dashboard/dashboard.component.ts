import { Component, OnInit } from '@angular/core';
import { forkJoin } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { of } from 'rxjs';
import { AdminMangaService } from '../../services/admin-manga.service';
import { AdminService } from '../../services/admin.service';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  loading = true;
  stats = { manga: 0, users: 0, tags: 0, chapters: 0 };

  quickLinks = [
    { label: 'Thêm truyện mới', path: '/admin/manga/create', icon: 'add_circle', color: 'accent' },
    { label: 'Danh sách truyện', path: '/admin/manga', icon: 'menu_book', color: 'blue' },
    { label: 'Quản lý users', path: '/admin/users', icon: 'people', color: 'green' },
  ];

  constructor(
    private mangaService: AdminMangaService,
    private adminService: AdminService
  ) {}

  ngOnInit(): void {
    forkJoin({
      manga: this.mangaService.getAll(1, 1).pipe(catchError(() => of(null))),
      users: this.adminService.getAllUsers(1, 1).pipe(catchError(() => of(null))),
      tags: this.mangaService.getAllTags().pipe(catchError(() => of(null))),
    }).subscribe(({ manga, users, tags }) => {
      this.stats.manga = this.extractTotal(manga);
      this.stats.users = this.extractTotal(users);
      const tagsArr = tags?.value ?? tags ?? [];
      this.stats.tags = Array.isArray(tagsArr) ? tagsArr.length : 0;
      this.loading = false;
    });
  }

  private extractTotal(res: any): number {
    if (!res) return 0;
    const d = res?.value ?? res;
    return d?.totalCount ?? d?.data?.totalCount ?? 0;
  }
}
