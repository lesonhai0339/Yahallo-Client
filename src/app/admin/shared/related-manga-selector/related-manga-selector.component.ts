import {
  Component, Input, Output, EventEmitter, OnInit, OnDestroy,
  ElementRef, HostListener, ViewChild
} from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, takeUntil, finalize } from 'rxjs/operators';
import { of } from 'rxjs';
import { AdminMangaService } from '../../services/admin-manga.service';

export interface PrefixOption {
  prefix: string;
  label: string;
  icon: string;
  hint: string;
}

@Component({
  selector: 'app-related-manga-selector',
  templateUrl: './related-manga-selector.component.html',
  styleUrls: ['./related-manga-selector.component.scss'],
})
export class RelatedMangaSelectorComponent implements OnInit, OnDestroy {
  @Input() currentMangaId?: string;
  @Input() selectedMangas: any[] = [];
  @Output() selectedMangasChange = new EventEmitter<any[]>();

  @ViewChild('searchInput') searchInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('dropdownEl') dropdownEl?: ElementRef<HTMLElement>;

  searchQuery = '';
  searchResults: any[] = [];
  isSearching = false;
  showDropdown = false;
  highlightedIndex = -1;

  readonly prefixOptions: PrefixOption[] = [
    { prefix: 'ref:name:',   label: 'Tên',    icon: 'title',       hint: 'Tìm theo tên truyện' },
    { prefix: 'ref:id:',     label: 'ID',     icon: 'fingerprint', hint: 'Tìm theo manga ID' },
    { prefix: 'ref:author:', label: 'Tác giả',icon: 'person',      hint: 'Tìm theo tên tác giả' },
    { prefix: 'ref:artist:', label: 'Họa sĩ', icon: 'brush',       hint: 'Tìm theo tên họa sĩ' },
  ];

  activePrefix = this.prefixOptions[0];

  private searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();

  constructor(
    private mangaService: AdminMangaService,
    private host: ElementRef
  ) {}

  ngOnInit(): void {
    this.searchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged(),
      switchMap(query => {
        if (!query.trim()) {
          this.searchResults = [];
          this.showDropdown = false;
          return of([]);
        }
        this.isSearching = true;
        const fullQuery = `${this.activePrefix.prefix}${query}`;
        return this.mangaService.searchByPrefix(fullQuery).pipe(
          finalize(() => this.isSearching = false)
        );
      }),
      takeUntil(this.destroy$)
    ).subscribe(results => {
      const excludedIds = new Set([
        ...(this.selectedMangas.map(m => m.id)),
        this.currentMangaId,
      ].filter(Boolean));

      this.searchResults = results
        .filter((r: any) => !excludedIds.has(r.id))
        .map((r: any) => ({
          ...r,
          thumbnailUrl: r.thumbnail ? this.mangaService.imgUrl(r.thumbnail) : null,
        }));

      this.showDropdown = this.searchResults.length > 0 || this.searchQuery.trim().length > 0;
      this.highlightedIndex = this.searchResults.length ? 0 : -1;
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Close on outside click ────────────────────────────────────────────────
  @HostListener('document:click', ['$event'])
  onDocumentClick(e: MouseEvent): void {
    if (!this.host.nativeElement.contains(e.target as Node)) {
      this.showDropdown = false;
    }
  }

  // ── Prefix selection ──────────────────────────────────────────────────────
  setPrefix(opt: PrefixOption): void {
    this.activePrefix = opt;
    this.searchQuery = '';
    this.searchResults = [];
    this.showDropdown = false;
    setTimeout(() => this.searchInputRef?.nativeElement.focus(), 0);
  }

  // ── Input events ──────────────────────────────────────────────────────────
  onInput(): void {
    this.searchSubject.next(this.searchQuery);
  }

  onFocus(): void {
    if (this.searchResults.length) this.showDropdown = true;
  }

  onKeyDown(event: KeyboardEvent): void {
    const items = this.searchResults;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.highlightedIndex = Math.min(this.highlightedIndex + 1, items.length - 1);
        this.scrollToHighlighted();
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.highlightedIndex = Math.max(this.highlightedIndex - 1, 0);
        this.scrollToHighlighted();
        break;
      case 'Enter':
        event.preventDefault();
        if (items[this.highlightedIndex]) this.select(items[this.highlightedIndex]);
        break;
      case 'Escape':
        this.showDropdown = false;
        break;
    }
  }

  private scrollToHighlighted(): void {
    if (!this.dropdownEl) return;
    const rows = this.dropdownEl.nativeElement.querySelectorAll('.rms-result-row');
    (rows[this.highlightedIndex] as HTMLElement)?.scrollIntoView({ block: 'nearest' });
  }

  // ── Selection ─────────────────────────────────────────────────────────────
  select(manga: any): void {
    if (!this.selectedMangas.find(m => m.id === manga.id)) {
      this.selectedMangas = [...this.selectedMangas, manga];
      this.selectedMangasChange.emit(this.selectedMangas);
    }
    this.searchQuery = '';
    this.searchResults = [];
    this.showDropdown = false;
  }

  remove(id: string): void {
    this.selectedMangas = this.selectedMangas.filter(m => m.id !== id);
    this.selectedMangasChange.emit(this.selectedMangas);
  }

  clearAll(): void {
    this.selectedMangas = [];
    this.selectedMangasChange.emit([]);
  }

  // ── Display helpers ───────────────────────────────────────────────────────
  getTagNames(manga: any, max = 4): string {
    return (manga.tags ?? []).map((t: any) => t.name).slice(0, max).join(' · ') || '—';
  }

  getAuthorNames(manga: any): string {
    return (manga.authors ?? []).map((a: any) => a.name).join(', ') || '—';
  }

  getArtistNames(manga: any): string {
    return (manga.artists ?? []).map((a: any) => a.name).join(', ') || '—';
  }

  get searchPlaceholder(): string {
    return `${this.activePrefix.hint}...`;
  }

  get fullQueryPreview(): string {
    return this.searchQuery ? `${this.activePrefix.prefix}${this.searchQuery}` : '';
  }
}
