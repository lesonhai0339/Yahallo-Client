import {
  Component, Input, Output, EventEmitter,
  ElementRef, HostListener, ViewChild, OnChanges, SimpleChanges
} from '@angular/core';

export interface TagItem {
  id: string;
  name: string;
}

@Component({
  selector: 'app-multi-tag-select',
  templateUrl: './multi-tag-select.component.html',
  styleUrls: ['./multi-tag-select.component.scss']
})
export class MultiTagSelectComponent implements OnChanges {
  @Input() label = '';
  @Input() placeholder = 'Tìm kiếm...';
  @Input() allItems: TagItem[] = [];
  @Input() selectedIds: string[] = [];
  @Output() selectedIdsChange = new EventEmitter<string[]>();

  @ViewChild('searchInput') searchInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('dropdownEl') dropdownEl?: ElementRef<HTMLElement>;

  searchText = '';
  showDropdown = false;
  highlightedIndex = -1;

  // Close dropdown when clicking outside this component
  @HostListener('document:click', ['$event'])
  onDocumentClick(e: MouseEvent): void {
    if (!this.host.nativeElement.contains(e.target as Node)) {
      this.showDropdown = false;
    }
  }

  constructor(private host: ElementRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    // If selected IDs change externally, reset nothing — display will update via getters
  }

  // ── Computed ──────────────────────────────────────────────────────────────

  get selectedItems(): TagItem[] {
    return this.allItems.filter(item => this.selectedIds.includes(item.id));
  }

  get filteredItems(): TagItem[] {
    const q = this.searchText.toLowerCase().trim();
    return this.allItems
      .filter(item =>
        !this.selectedIds.includes(item.id) &&
        (!q || item.name.toLowerCase().includes(q))
      )
      .slice(0, 12);
  }

  // ── Interactions ──────────────────────────────────────────────────────────

  focusInput(): void {
    this.searchInputRef?.nativeElement.focus();
  }

  onFocus(): void {
    this.showDropdown = true;
    this.highlightedIndex = this.filteredItems.length ? 0 : -1;
  }

  onInput(): void {
    this.showDropdown = true;
    this.highlightedIndex = this.filteredItems.length ? 0 : -1;
  }

  onKeyDown(event: KeyboardEvent): void {
    const items = this.filteredItems;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.showDropdown = true;
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
        if (this.highlightedIndex >= 0 && items[this.highlightedIndex]) {
          this.select(items[this.highlightedIndex]);
        }
        break;

      case 'Escape':
        this.showDropdown = false;
        break;

      case 'Backspace':
        if (!this.searchText && this.selectedIds.length) {
          this.removeLast();
        }
        break;
    }
  }

  select(item: TagItem): void {
    if (!this.selectedIds.includes(item.id)) {
      this.selectedIds = [...this.selectedIds, item.id];
      this.selectedIdsChange.emit(this.selectedIds);
    }
    this.searchText = '';
    this.showDropdown = false;
    this.highlightedIndex = -1;
    // Keep focus in input for continuous selection
    setTimeout(() => this.searchInputRef?.nativeElement.focus(), 0);
  }

  remove(id: string): void {
    this.selectedIds = this.selectedIds.filter(sid => sid !== id);
    this.selectedIdsChange.emit(this.selectedIds);
  }

  clearAll(): void {
    this.selectedIds = [];
    this.selectedIdsChange.emit(this.selectedIds);
  }

  private removeLast(): void {
    this.selectedIds = this.selectedIds.slice(0, -1);
    this.selectedIdsChange.emit(this.selectedIds);
  }

  private scrollToHighlighted(): void {
    if (!this.dropdownEl) return;
    const el = this.dropdownEl.nativeElement;
    const item = el.querySelectorAll('.mts-item')[this.highlightedIndex] as HTMLElement;
    item?.scrollIntoView({ block: 'nearest' });
  }
}
