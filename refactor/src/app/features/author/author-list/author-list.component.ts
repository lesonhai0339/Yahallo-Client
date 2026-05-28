import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormControl } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { AuthorService } from '../../../core/services/author.service';
import { AuthorDto } from '../../../core/models/interfaces';

@Component({
  selector: 'app-author-list',
  templateUrl: './author-list.component.html',
  styleUrls: ['./author-list.component.scss']
})
export class AuthorListComponent implements OnInit, OnDestroy {
  authors: AuthorDto[] = [];
  isLoading = true;
  totalPages = 1;
  currentPage = 1;
  pageSize = 20;
  totalCount = 0;

  searchControl = new FormControl('');

  private destroy$ = new Subject<void>();

  constructor(private authorService: AuthorService) {}

  ngOnInit(): void {
    this.loadAuthors();

    this.searchControl.valueChanges.pipe(
      debounceTime(400),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(value => {
      this.currentPage = 1;
      if (value && value.trim()) {
        this.searchAuthors(value.trim());
      } else {
        this.loadAuthors();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadAuthors(): void {
    this.isLoading = true;
    this.authorService.getAllPagination(this.currentPage, this.pageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          const paged = res?.data ?? res;
          this.authors = paged?.data ?? [];
          this.totalCount = paged?.totalCount ?? this.authors.length;
          this.totalPages = paged?.pageCount ?? Math.ceil(this.totalCount / this.pageSize);
          this.isLoading = false;
        },
        error: () => { this.isLoading = false; }
      });
  }

  searchAuthors(name: string): void {
    this.isLoading = true;
    this.authorService.filter({ Name: name, PageNumber: this.currentPage, PageSize: this.pageSize })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          const paged = res?.data ?? res;
          this.authors = paged?.data ?? [];
          this.totalCount = paged?.totalCount ?? this.authors.length;
          this.totalPages = paged?.pageCount ?? Math.ceil(this.totalCount / this.pageSize);
          this.isLoading = false;
        },
        error: () => { this.isLoading = false; }
      });
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
    const query = this.searchControl.value;
    if (query && query.trim()) {
      this.searchAuthors(query.trim());
    } else {
      this.loadAuthors();
    }
  }

  get pages(): number[] {
    const max = Math.min(this.totalPages, 7);
    const start = Math.max(1, this.currentPage - 3);
    return Array.from({ length: max }, (_, i) => start + i).filter(p => p <= this.totalPages);
  }
}
