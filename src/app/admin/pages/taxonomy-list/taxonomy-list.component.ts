import { Component, OnInit, OnDestroy } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { PageEvent } from '@angular/material/paginator';
import { ToastrService } from 'ngx-toastr';
import { Subject } from 'rxjs';
import { debounceTime, finalize, takeUntil } from 'rxjs/operators';
import { PermissionService } from '../../../core/services/permission.service';
import { AuthService } from '../../../core/services/auth.service';
import { Permission } from '../../../core/models/permission.model';
import { TaxonomyService, TaxonomyType } from '../../services/taxonomy.service';
import {
  TaxonomyFormDialogComponent, TaxonomyFormData,
} from '../../shared/taxonomy-form-dialog/taxonomy-form-dialog.component';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';

interface Tab { type: TaxonomyType; label: string; icon: string; }

@Component({
  selector: 'app-taxonomy-list',
  templateUrl: './taxonomy-list.component.html',
  styleUrls: ['./taxonomy-list.component.scss'],
})
export class TaxonomyListComponent implements OnInit, OnDestroy {
  readonly tabs: Tab[] = [
    { type: 'tag', label: 'Tags', icon: 'sell' },
    { type: 'author', label: 'Tác giả', icon: 'edit_note' },
    { type: 'artist', label: 'Họa sĩ', icon: 'brush' },
  ];
  activeType: TaxonomyType = 'tag';

  items: any[] = [];
  search = '';
  isLoading = false;

  // Server-side pagination (scales to thousands)
  pageIndex = 0;
  pageSize = 20;
  totalCount = 0;

  /** Mobile: id of the card whose details dropdown is open. */
  expandedId: string | null = null;

  private search$ = new Subject<void>();
  private destroy$ = new Subject<void>();

  constructor(
    private taxonomy: TaxonomyService,
    private dialog: MatDialog,
    private toastr: ToastrService,
    private auth: AuthService,
    public perm: PermissionService
  ) {}

  ngOnInit(): void {
    this.search$.pipe(debounceTime(350), takeUntil(this.destroy$)).subscribe(() => {
      this.pageIndex = 0;
      this.load();
    });
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Admin can manage directly; others (mod/trans) submit requests. */
  get canManage(): boolean {
    return this.perm.hasPermission(Permission.ManageTaxonomy);
  }

  selectTab(type: TaxonomyType): void {
    if (type === this.activeType) return;
    this.activeType = type;
    this.search = '';
    this.pageIndex = 0;
    this.expandedId = null;
    this.load();
  }

  load(): void {
    this.isLoading = true;
    this.expandedId = null;
    this.taxonomy.listPaged(this.activeType, {
      page: this.pageIndex + 1,
      pageSize: this.pageSize,
      name: this.search,
    }).pipe(finalize(() => this.isLoading = false))
      .subscribe({
        next: res => { this.items = res.data || []; this.totalCount = res.totalCount; },
        error: () => { this.items = []; this.totalCount = 0; },
      });
  }

  onSearchChange(): void {
    this.search$.next();
  }

  onPageChange(e: PageEvent): void {
    this.pageIndex = e.pageIndex;
    this.pageSize = e.pageSize;
    this.load();
  }

  toggleExpand(item: any): void {
    this.expandedId = this.expandedId === item.id ? null : item.id;
  }

  openForm(mode: 'create' | 'edit', model?: any): void {
    const data: TaxonomyFormData = {
      type: this.activeType,
      mode,
      asRequest: mode === 'create' && !this.canManage,
      model,
    };
    this.dialog.open(TaxonomyFormDialogComponent, { data, width: '480px', autoFocus: false })
      .afterClosed().subscribe(payload => {
        if (!payload) return;
        if (data.asRequest) this.sendRequest(payload);
        else if (mode === 'edit') this.doUpdate(payload);
        else this.doCreate(payload);
      });
  }

  private doCreate(payload: any): void {
    this.taxonomy.create(this.activeType, payload).subscribe({
      next: () => { this.toastr.success('Đã thêm thành công'); this.load(); },
      error: () => this.toastr.error('Không thể thêm'),
    });
  }

  private doUpdate(payload: any): void {
    this.taxonomy.update(this.activeType, payload).subscribe({
      next: () => { this.toastr.success('Đã cập nhật'); this.load(); },
      error: () => this.toastr.error('Không thể cập nhật'),
    });
  }

  private sendRequest(payload: any): void {
    const who = this.auth.currentUser?.name ?? this.auth.currentUser?.id ?? 'unknown';
    this.taxonomy.submitRequest(this.activeType, payload, who).subscribe(() => {
      this.toastr.success('Đã gửi yêu cầu tới admin');
    });
  }

  remove(item: any): void {
    this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Xóa',
        message: `Xóa "${item.name}"?`,
        confirmText: 'Xóa',
        danger: true,
      },
    }).afterClosed().subscribe(ok => {
      if (!ok) return;
      this.taxonomy.delete(this.activeType, item.id).subscribe({
        next: () => { this.toastr.success('Đã xóa'); this.load(); },
        error: () => this.toastr.error('Không thể xóa'),
      });
    });
  }

  countryOf(item: any): number | undefined {
    return item.countryCode ?? item.countries;
  }
}
