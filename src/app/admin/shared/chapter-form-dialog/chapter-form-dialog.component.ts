import { Component, Inject, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { lastValueFrom } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { AdminMangaService } from '../../services/admin-manga.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  ImageUploadService,
  FileUploadState,
  FileUploadResult,
  ImageUploadMeta,
  FileStatus,
} from '../../services/image-upload.service';

export interface ChapterFormData {
  mangaId: string;
  chapter?: any;
}

export type Phase = 'idle' | 'creating' | 'signing' | 'uploading' | 'confirming' | 'done';

// 3-step labels for single-file mode
export interface Step {
  key: 'signing' | 'uploading' | 'confirming';
  label: string;
}

@Component({
  selector: 'app-chapter-form-dialog',
  templateUrl: './chapter-form-dialog.component.html',
  styleUrls: ['./chapter-form-dialog.component.scss'],
})
export class ChapterFormDialogComponent implements OnInit, OnDestroy {
  form!: FormGroup;
  phase: Phase = 'idle';
  fileStates: FileUploadState[] = [];

  readonly steps: Step[] = [
    { key: 'signing',    label: 'Lấy Signed URL' },
    { key: 'uploading',  label: 'Upload lên Cloud' },
    { key: 'confirming', label: 'Xác nhận server' },
  ];

  get isBusy(): boolean  { return this.phase !== 'idle'; }
  get isSingle(): boolean { return this.fileStates.length === 1; }

  get doneCount()   { return this.fileStates.filter(f => f.status === 'done').length; }
  get failedCount() { return this.fileStates.filter(f => f.status === 'failed').length; }

  /** Overall percent — average of per-file upload percents */
  get overallPercent(): number {
    if (!this.fileStates.length) return 0;
    const sum = this.fileStates.reduce((acc, f) => acc + f.uploadPercent, 0);
    return Math.round(sum / this.fileStates.length);
  }

  constructor(
    private fb: FormBuilder,
    private mangaService: AdminMangaService,
    private imageUpload: ImageUploadService,
    private auth: AuthService,
    private toastr: ToastrService,
    public dialogRef: MatDialogRef<ChapterFormDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ChapterFormData
  ) {}

  ngOnInit(): void {
    const ch = this.data.chapter;
    this.form = this.fb.group({
      title: [ch?.title ?? '', Validators.required],
      index: [ch?.index ?? 1, [Validators.required, Validators.min(0)]],
    });
  }

  ngOnDestroy(): void {
    this.fileStates.forEach(fs => this.imageUpload.revokePreview(fs.preview));
  }

  // ── File selection ──────────────────────────────────────────────────────────

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    this.addFiles(Array.from(input.files).filter(f => f.type.startsWith('image/')));
    input.value = '';
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.addFiles(Array.from(event.dataTransfer?.files ?? []).filter(f => f.type.startsWith('image/')));
  }

  onDragOver(event: DragEvent): void { event.preventDefault(); }

  private addFiles(files: File[]): void {
    const base = this.fileStates.length;
    this.fileStates = [
      ...this.fileStates,
      ...files.map((file, i) => ({
        file,
        pageIndex: base + i + 1,
        preview: this.imageUpload.createPreview(file),
        status: 'pending' as FileStatus,
        uploadPercent: 0,
      })),
    ];
  }

  removeFile(fs: FileUploadState): void {
    this.imageUpload.revokePreview(fs.preview);
    this.fileStates = this.fileStates
      .filter(f => f !== fs)
      .map((f, i) => ({ ...f, pageIndex: i + 1 }));
  }

  moveUp(i: number): void {
    if (i === 0) return;
    const a = [...this.fileStates];
    [a[i - 1], a[i]] = [a[i], a[i - 1]];
    this.fileStates = a.map((f, idx) => ({ ...f, pageIndex: idx + 1 }));
  }

  moveDown(i: number): void {
    if (i >= this.fileStates.length - 1) return;
    const a = [...this.fileStates];
    [a[i], a[i + 1]] = [a[i + 1], a[i]];
    this.fileStates = a.map((f, idx) => ({ ...f, pageIndex: idx + 1 }));
  }

  // ── Main upload workflow ────────────────────────────────────────────────────

  async save(): Promise<void> {
    if (this.form.invalid || this.isBusy) return;

    // Step 0 — Create / update chapter metadata
    this.phase = 'creating';
    let chapterId: string;
    try {
      const fd = new FormData();
      fd.append('MangaId', this.data.mangaId);
      fd.append('Title', this.form.value.title);
      fd.append('Index', String(this.form.value.index));
      if (this.data.chapter?.id) fd.append('ChapterId', this.data.chapter.id);

      const req = this.data.chapter?.id
        ? this.mangaService.updateChapter(fd)
        : this.mangaService.createChapter(fd);

      const res: any = await lastValueFrom(req);
      chapterId = res?.value?.id ?? res?.id ?? this.data.chapter?.id;
    } catch {
      this.toastr.error('Không thể lưu thông tin chương');
      this.phase = 'idle';
      return;
    }

    if (this.fileStates.length === 0) {
      this.toastr.success(this.data.chapter ? 'Cập nhật thành công' : 'Tạo chương thành công');
      this.dialogRef.close(true);
      return;
    }

    // Step 1 — Get signed URLs (= "signing" phase)
    this.phase = 'signing';
    this.patchAll({ status: 'signing', uploadPercent: 0 });

    const userId = this.auth.currentUser?.id ?? '';
    const metas: ImageUploadMeta[] = this.fileStates.map(fs => ({
      userId,
      fileName: fs.file.name,
      contentType: fs.file.type,
      fileSize: fs.file.size,
      chapterId,
      pageIndex: fs.pageIndex,
    }));

    let signedItems;
    try {
      signedItems = await lastValueFrom(this.imageUpload.getSignedUrls(metas));
    } catch {
      this.toastr.error('Không lấy được Signed URL từ server');
      this.patchAll({ status: 'failed' });
      this.phase = 'idle';
      return;
    }

    signedItems.forEach((item, i) => {
      if (this.fileStates[i]) {
        this.fileStates[i] = {
          ...this.fileStates[i],
          fileId: item.fileId,
          signedUrl: item.signedUrl,
          status: 'uploading',
        };
      }
    });

    // Step 2 — Upload all files to S3 in parallel
    this.phase = 'uploading';
    await Promise.all(this.fileStates.map((_, i) => this.uploadOne(i)));

    // Step 3 — Batch confirm with server
    this.phase = 'confirming';
    const results: FileUploadResult[] = this.fileStates
      .filter(fs => fs.fileId)
      .map(fs => ({
        fileId: fs.fileId!,
        etag: fs.etag ?? null,
        status: fs.status === 'done' ? 'uploaded' : 'failed',
      }));

    try {
      await lastValueFrom(this.imageUpload.confirmBatchUploads(results));
    } catch {
      this.toastr.warning('Chương đã lưu nhưng xác nhận trạng thái ảnh thất bại');
    }

    this.phase = 'done';
    const failed = this.failedCount;
    if (failed > 0) {
      this.toastr.warning(`Hoàn tất — ${this.doneCount} thành công, ${failed} thất bại`);
    } else {
      this.toastr.success(`Upload hoàn tất — ${this.doneCount} trang`);
    }
    setTimeout(() => this.dialogRef.close(true), 800);
  }

  private async uploadOne(index: number): Promise<void> {
    const fs = this.fileStates[index];
    if (!fs.signedUrl) {
      this.fileStates[index] = { ...fs, status: 'failed', error: 'Không có Signed URL' };
      return;
    }
    try {
      const etag = await lastValueFrom(
        this.imageUpload.uploadToS3(fs.signedUrl, fs.file, pct => {
          // Update per-file progress — create new ref for Angular CD
          this.fileStates[index] = { ...this.fileStates[index], uploadPercent: pct };
        })
      );
      this.fileStates[index] = {
        ...this.fileStates[index],
        etag,
        status: 'done',
        uploadPercent: 100,
      };
    } catch (err: any) {
      this.fileStates[index] = {
        ...this.fileStates[index],
        status: 'failed',
        error: err?.message ?? 'Upload thất bại',
        uploadPercent: 0,
      };
    }
  }

  private patchAll(patch: Partial<FileUploadState>): void {
    this.fileStates = this.fileStates.map(f => ({ ...f, ...patch }));
  }

  // ── Template helpers ────────────────────────────────────────────────────────

  stepActive(key: Step['key']): boolean {
    const order: Phase[] = ['signing', 'uploading', 'confirming', 'done'];
    return order.indexOf(this.phase as any) >= order.indexOf(key);
  }

  stepCurrent(key: Step['key']): boolean { return this.phase === key; }

  statusIcon(status: FileStatus): string {
    return { pending: 'schedule', signing: 'sync', uploading: 'cloud_upload', done: 'check_circle', failed: 'error' }[status];
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  cancel(): void { if (!this.isBusy) this.dialogRef.close(false); }
}
