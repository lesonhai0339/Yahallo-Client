import { Component, OnInit, OnDestroy } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { Subject, takeUntil } from 'rxjs';
import { AdminModerationService, TrashItem, TrashKind } from '../../services/admin-moderation.service';

/**
 * ⚠️ MODULE MỚI THÊM — xem `docs/ADMIN_MODULES_ADDED.md`.
 *
 * Thùng rác: xem các bản ghi đã xoá mềm (manga / chapter / comment / author /
 * artist) và phục hồi. API `restore` là THẬT; phần LIỆT KÊ phụ thuộc backend có
 * hỗ trợ filter `IsDeleted` hay không (xem chú thích trong AdminModerationService).
 */
@Component({
  selector: 'app-trash-bin',
  templateUrl: './trash-bin.component.html',
  styleUrls: ['./trash-bin.component.scss']
})
export class TrashBinComponent implements OnInit, OnDestroy {
  readonly tabs: { kind: TrashKind; label: string; icon: string }[] = [
    { kind: 'manga',   label: 'Truyện',     icon: 'menu_book' },
    { kind: 'chapter', label: 'Chương',     icon: 'auto_stories' },
    { kind: 'comment', label: 'Bình luận',  icon: 'forum' },
    { kind: 'author',  label: 'Tác giả',    icon: 'edit_note' },
    { kind: 'artist',  label: 'Họa sĩ',     icon: 'brush' },
  ];

  activeKind: TrashKind = 'manga';
  items: TrashItem[] = [];
  isLoading = false;
  busyId: string | null = null;

  page = 1;
  pageSize = 20;
  totalCount = 0;

  private destroy$ = new Subject<void>();

  constructor(
    private moderation: AdminModerationService,
    private toastr: ToastrService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  selectTab(kind: TrashKind): void {
    if (this.activeKind === kind) return;
    this.activeKind = kind;
    this.items = [];
    this.load(1);
  }

  load(page = this.page): void {
    this.page = page;
    this.isLoading = true;
    this.moderation.getTrash(this.activeKind, page, this.pageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: res => {
          this.items = res.data;
          this.totalCount = res.totalCount;
          this.isLoading = false;
        },
        error: () => { this.isLoading = false; },
      });
  }

  restore(item: TrashItem): void {
    this.busyId = item.id;
    this.moderation.restoreItem(item.kind, item.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.busyId = null;
          this.toastr.success('Đã phục hồi');
          this.items = this.items.filter(x => x.id !== item.id);
          this.totalCount = Math.max(0, this.totalCount - 1);
        },
        error: () => { this.busyId = null; this.toastr.error('Phục hồi thất bại'); },
      });
  }

  get activeLabel(): string {
    return this.tabs.find(t => t.kind === this.activeKind)?.label ?? '';
  }

  trackById = (_: number, i: TrashItem) => i.id;
}
