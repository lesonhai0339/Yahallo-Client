import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormControl } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { ArtistService } from '../../../core/services/artist.service';
import { ArtistDto } from '../../../core/models/interfaces';

@Component({
  selector: 'app-artist-list',
  templateUrl: './artist-list.component.html',
  styleUrls: ['./artist-list.component.scss']
})
export class ArtistListComponent implements OnInit, OnDestroy {
  artists: ArtistDto[] = [];
  isLoading = true;
  totalPages = 1;
  currentPage = 1;
  pageSize = 20;
  totalCount = 0;

  searchControl = new FormControl('');

  private destroy$ = new Subject<void>();

  constructor(private artistService: ArtistService) {}

  ngOnInit(): void {
    this.loadArtists();

    this.searchControl.valueChanges.pipe(
      debounceTime(400),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(value => {
      this.currentPage = 1;
      if (value && value.trim()) {
        this.searchArtists(value.trim());
      } else {
        this.loadArtists();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadArtists(): void {
    this.isLoading = true;
    this.artistService.getAllPagination(this.currentPage, this.pageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          const paged = res?.data ?? res;
          this.artists = paged?.data ?? [];
          this.totalCount = paged?.totalCount ?? this.artists.length;
          this.totalPages = paged?.pageCount ?? Math.ceil(this.totalCount / this.pageSize);
          this.isLoading = false;
        },
        error: () => { this.isLoading = false; }
      });
  }

  searchArtists(name: string): void {
    this.isLoading = true;
    this.artistService.filter({ Name: name, PageNumber: this.currentPage, PageSize: this.pageSize })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          const paged = res?.data ?? res;
          this.artists = paged?.data ?? [];
          this.totalCount = paged?.totalCount ?? this.artists.length;
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
      this.searchArtists(query.trim());
    } else {
      this.loadArtists();
    }
  }

  get pages(): number[] {
    const max = Math.min(this.totalPages, 7);
    const start = Math.max(1, this.currentPage - 3);
    return Array.from({ length: max }, (_, i) => start + i).filter(p => p <= this.totalPages);
  }
}
