import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, switchMap, takeUntil } from 'rxjs';
import { MangaService } from '../../../core/services/manga.service';
import { TagService } from '../../../core/services/tag.service';
import { Manga, Tag } from '../../../core/models/interfaces';

@Component({
  selector: 'app-manga-search',
  templateUrl: './manga-search.component.html',
  styleUrls: ['./manga-search.component.scss']
})
export class MangaSearchComponent implements OnInit, OnDestroy {
  results: Manga[] = [];
  tags: Tag[] = [];
  categories: any[] = [];
  selectedTags: string[] = [];
  selectedCategories: string[] = [];
  searchQuery = '';
  isLoading = false;
  hasSearched = false;

  private searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private mangaService: MangaService,
    private tagService: TagService
  ) {}

  ngOnInit(): void {
    this.mangaService.getCategories().pipe(takeUntil(this.destroy$)).subscribe(c => this.categories = c || []);
    this.tagService.getAll().pipe(takeUntil(this.destroy$)).subscribe((res: any) => {
      this.tags = (res?.data ?? res) || [];
    });

    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      if (params['q']) {
        this.searchQuery = params['q'];
        this.doSearch(this.searchQuery);
      }
    });

    this.searchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged(),
      switchMap(q => {
        if (!q.trim()) return [];
        this.isLoading = true;
        return this.mangaService.search(q);
      }),
      takeUntil(this.destroy$)
    ).subscribe({ next: r => { this.results = r as Manga[]; this.isLoading = false; this.hasSearched = true; } });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSearchInput(): void {
    this.searchSubject.next(this.searchQuery);
    this.router.navigate([], { queryParams: { q: this.searchQuery }, replaceUrl: true });
  }

  doSearch(query: string): void {
    if (!query.trim()) return;
    this.isLoading = true;
    this.mangaService.search(query).pipe(takeUntil(this.destroy$)).subscribe(r => {
      this.results = r as Manga[];
      this.isLoading = false;
      this.hasSearched = true;
    });
  }

  toggleCategory(id: string): void {
    const idx = this.selectedCategories.indexOf(id);
    if (idx > -1) this.selectedCategories.splice(idx, 1);
    else this.selectedCategories.push(id);
     if (this.selectedCategories.length > 0) this.searchByCategories();
  }

  searchByCategories(): void {
    this.isLoading = true;
    this.mangaService.getByCategories(this.selectedCategories).pipe(takeUntil(this.destroy$)).subscribe(r => {
      this.results = r as Manga[];
      this.isLoading = false;
      this.hasSearched = true;
    });
  }

  isCategorySelected(id: string): boolean {
    return this.selectedCategories.includes(id);
  }
}
