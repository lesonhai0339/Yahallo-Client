import { Component, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { TaxonomyType } from '../../services/taxonomy.service';

export interface TaxonomyFormData {
  type: TaxonomyType;
  mode: 'create' | 'edit';
  /** Submit as a request for admin review instead of creating directly. */
  asRequest: boolean;
  model?: any;
}

@Component({
  selector: 'app-taxonomy-form-dialog',
  templateUrl: './taxonomy-form-dialog.component.html',
  styleUrls: ['./taxonomy-form-dialog.component.scss'],
})
export class TaxonomyFormDialogComponent {
  name = '';
  description = '';      // tag
  depscription = '';     // author/artist (matches backend spelling)
  country: number | null = null;
  birth = '';            // yyyy-MM-dd
  lifeStatus = 1;

  readonly lifeStatusOptions = [
    { value: 1, label: 'Còn sống' },
    { value: 2, label: 'Đã mất' },
  ];

  constructor(
    private dialogRef: MatDialogRef<TaxonomyFormDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: TaxonomyFormData
  ) {
    const m = data.model;
    if (m) {
      this.name = m.name ?? '';
      this.description = m.description ?? '';
      this.depscription = m.depscription ?? '';
      this.country = m.countryCode ?? m.countries ?? null;
      this.birth = m.birth ? String(m.birth).slice(0, 10) : '';
      this.lifeStatus = m.lifeStatus ?? 1;
    }
  }

  get isPerson(): boolean {
    return this.data.type === 'author' || this.data.type === 'artist';
  }

  get typeLabel(): string {
    return this.data.type === 'tag' ? 'tag' : this.data.type === 'author' ? 'tác giả' : 'họa sĩ';
  }

  get title(): string {
    if (this.data.asRequest) return `Yêu cầu thêm ${this.typeLabel}`;
    return (this.data.mode === 'edit' ? 'Sửa ' : 'Thêm ') + this.typeLabel;
  }

  get canSubmit(): boolean {
    if (!this.name.trim()) return false;
    if (this.isPerson) {
      return !!this.depscription.trim() && !!this.birth && this.country != null;
    }
    return true;
  }

  submit(): void {
    if (!this.canSubmit) return;
    this.dialogRef.close(this.buildPayload());
  }

  cancel(): void {
    this.dialogRef.close(null);
  }

  private buildPayload(): any {
    const { type, mode, model } = this.data;
    const editing = mode === 'edit';

    if (type === 'tag') {
      return {
        ...(editing ? { id: model.id } : {}),
        name: this.name.trim(),
        description: this.description.trim() || null,
      };
    }

    // author / artist
    const base: any = {
      ...(editing ? { id: model.id } : {}),
      name: this.name.trim(),
      depscription: this.depscription.trim(),
      birth: new Date(this.birth).toISOString(),
      lifeStatus: Number(this.lifeStatus),
    };
    // Backend field name differs: artist *create* uses countryCode; everything
    // else (author, and update commands) uses countries.
    if (type === 'artist' && !editing) base.countryCode = Number(this.country);
    else base.countries = Number(this.country);
    return base;
  }
}
