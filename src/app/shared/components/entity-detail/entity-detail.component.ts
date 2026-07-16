import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslationService } from '../../../core/services/translation.service';

export type EntityKind = 'tag' | 'author' | 'artist';

/**
 * Presentational "entity detail" — hai phần: (1) thông tin đối tượng
 * (tác giả / hoạ sĩ / thể loại), (2) danh sách manga phụ thuộc đối tượng đó
 * (cùng author / artist / tag). Không tự fetch — mọi dữ liệu qua @Input, phân
 * trang phát ra qua (pageChange). Dùng chung cho person-detail page và phần
 * result của trang search.
 */
@Component({
  selector: 'app-entity-detail',
  templateUrl: './entity-detail.component.html',
  styleUrls: ['./entity-detail.component.scss'],
})
export class EntityDetailComponent {
  @Input() kind: EntityKind = 'tag';
  @Input() name = '';
  @Input() description?: string | null;

  /** Person-only meta (author/artist). */
  @Input() birth?: string | null;
  @Input() lifeStatus?: number | null;

  @Input() mangas: any[] = [];
  @Input() isLoading = false;
  @Input() showTags = true;
  @Input() mockNotice = false;

  /** Tổng số manga hiển thị cạnh tiêu đề (vd số kết quả của search). Ẩn nếu null. */
  @Input() count?: number | null;

  /** Phân trang — search nhúng có; trang standalone thì không. */
  @Input() showPagination = false;
  @Input() currentPage = 1;
  @Input() totalCount = 0;
  @Input() pageSize = 12;
  @Output() pageChange = new EventEmitter<number>();

  constructor(public translation: TranslationService) {}

  get isPerson(): boolean { return this.kind === 'author' || this.kind === 'artist'; }
  get isDeceased(): boolean { return this.lifeStatus === 2; }
  get lifeStatusKey(): string { return this.isDeceased ? 'PERSON.DECEASED' : 'PERSON.ALIVE'; }

  get iconClass(): string {
    switch (this.kind) {
      case 'author': return 'fa-solid fa-pen-nib';
      case 'artist': return 'fa-solid fa-palette';
      default:       return 'fa-solid fa-tags';
    }
  }

  get roleKey(): string {
    switch (this.kind) {
      case 'author': return 'PERSON.AUTHOR';
      case 'artist': return 'PERSON.ARTIST';
      default:       return 'PERSON.TAG';
    }
  }

  get worksTitleKey(): string {
    return this.kind === 'tag' ? 'PERSON.MANGA_IN_TAG' : 'PERSON.WORKS_BY';
  }
}
