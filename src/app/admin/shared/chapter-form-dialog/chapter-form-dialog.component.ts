import { Component, Inject, OnDestroy, OnInit, ViewChild, ViewChildren, QueryList, ElementRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { lastValueFrom } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { AdminMangaService } from '../../services/admin-manga.service';
import { ChapterImageService, CreateChapterImageItem } from '../../services/chapter-image.service';
import { ImageUploadService, FileStatus } from '../../services/image-upload.service';

export interface ChapterFormData {
  mangaId: string;
  chapter?: any;
}

export type Phase = 'idle' | 'creating' | 'signing' | 'uploading' | 'confirming' | 'done';

export interface ImageRow {
  id: number;
  pageIndex: number;
  file: File | null;
  preview: string;
  status: FileStatus;
  uploadPercent: number;
  fileId?: string;
  signedUrl?: string;
  etag?: string;
  error?: string;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

@Component({
  selector: 'app-chapter-form-dialog',
  templateUrl: './chapter-form-dialog.component.html',
  styleUrls: ['./chapter-form-dialog.component.scss'],
})
export class ChapterFormDialogComponent implements OnInit, OnDestroy {
  @ViewChildren('rowFileInput') rowFileInputs!: QueryList<ElementRef<HTMLInputElement>>;
  @ViewChild('multiFileInput') multiFileInput!: ElementRef<HTMLInputElement>;

  form!: FormGroup;
  phase: Phase = 'idle';
  imageRows: ImageRow[] = [];
  validationErrors: string[] = [];
  private nextRowId = 1;

  get isBusy(): boolean { return this.phase !== 'idle'; }
  get filledRows(): ImageRow[] { return this.imageRows.filter(r => r.file !== null); }
  get doneCount(): number { return this.imageRows.filter(r => r.status === 'done').length; }
  get failedCount(): number { return this.imageRows.filter(r => r.status === 'failed').length; }

  get overallPercent(): number {
    const filled = this.filledRows;
    if (!filled.length) return 0;
    return Math.round(filled.reduce((s, r) => s + r.uploadPercent, 0) / filled.length);
  }

  get duplicateIndices(): Set<number> {
    const seen = new Map<number, number[]>();
    this.imageRows.forEach((r, i) => {
      const key = r.pageIndex;
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key)!.push(i);
    });
    const dupes = new Set<number>();
    seen.forEach(indices => {
      if (indices.length > 1) indices.forEach(i => dupes.add(i));
    });
    return dupes;
  }

  constructor(
    private fb: FormBuilder,
    private mangaService: AdminMangaService,
    private chapterImages: ChapterImageService,
    private imageUpload: ImageUploadService,
    private toastr: ToastrService,
    public dialogRef: MatDialogRef<ChapterFormDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ChapterFormData
  ) {}

  ngOnInit(): void {
    const ch = this.data.chapter;
    this.form = this.fb.group({
      // Title là MÔ TẢ chương — nhiều bộ không có, nên không bắt buộc.
      title: [ch?.title ?? ''],
      index: [ch?.index ?? 1, [Validators.required, Validators.min(0)]],
      subIndex: [ch?.subIndex ?? 0, [Validators.min(0)]],
    });
  }

  /** Nhãn chương ghép từ index + subIndex — "10" hoặc "10.5". */
  get chapterLabel(): string {
    const i = Number(this.form?.value?.index ?? 0);
    const sub = Number(this.form?.value?.subIndex ?? 0);
    return sub > 0 ? `${i}.${sub}` : `${i}`;
  }

  ngOnDestroy(): void {
    this.imageRows.forEach(r => { if (r.preview) this.imageUpload.revokePreview(r.preview); });
  }

  // ── Row management ─────────────────────────────────────────────────────────

  addEmptyRow(): void {
    this.imageRows.push({
      id: this.nextRowId++,
      pageIndex: this.imageRows.length + 1,
      file: null,
      preview: '',
      status: 'pending',
      uploadPercent: 0,
    });
  }

  removeRow(index: number): void {
    const row = this.imageRows[index];
    if (row.preview) this.imageUpload.revokePreview(row.preview);
    this.imageRows.splice(index, 1);
    this.reindex();
  }

  moveUp(index: number): void {
    if (index === 0) return;
    [this.imageRows[index - 1], this.imageRows[index]] = [this.imageRows[index], this.imageRows[index - 1]];
    this.reindex();
  }

  moveDown(index: number): void {
    if (index >= this.imageRows.length - 1) return;
    [this.imageRows[index], this.imageRows[index + 1]] = [this.imageRows[index + 1], this.imageRows[index]];
    this.reindex();
  }

  onPageIndexChange(index: number, value: number): void {
    this.imageRows[index].pageIndex = value;
  }

  incrementIndex(index: number): void {
    this.imageRows[index].pageIndex++;
  }

  decrementIndex(index: number): void {
    if (this.imageRows[index].pageIndex > 1) {
      this.imageRows[index].pageIndex--;
    }
  }

  private reindex(): void {
    this.imageRows.forEach((r, i) => r.pageIndex = i + 1);
  }

  // ── Drag-drop reorder (CDK) ───────────────────────────────────────────────

  onRowReorder(event: CdkDragDrop<ImageRow[]>): void {
    moveItemInArray(this.imageRows, event.previousIndex, event.currentIndex);
    this.reindex();
  }

  // ── File validation ───────────────────────────────────────────────────────

  private validateFile(file: File): string | null {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return `"${file.name}" — định dạng không hỗ trợ (chỉ JPG, PNG, WebP, GIF, AVIF)`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `"${file.name}" — vượt quá 10MB`;
    }
    return null;
  }

  private isValidImage(file: File): boolean {
    return ALLOWED_TYPES.includes(file.type) && file.size <= MAX_FILE_SIZE;
  }

  // ── File selection (per-row) ───────────────────────────────────────────────

  triggerFileSelect(index: number): void {
    const inputs = this.rowFileInputs?.toArray();
    if (inputs?.[index]) {
      inputs[index].nativeElement.click();
    }
  }

  onRowFileSelected(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) { input.value = ''; return; }

    const err = this.validateFile(file);
    if (err) {
      this.toastr.error(err, 'File không hợp lệ');
      input.value = '';
      return;
    }

    const row = this.imageRows[index];
    if (row.preview) this.imageUpload.revokePreview(row.preview);
    row.file = file;
    row.preview = this.imageUpload.createPreview(file);
    input.value = '';
  }

  onRowDrop(event: DragEvent, index: number): void {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;

    const err = this.validateFile(file);
    if (err) {
      this.toastr.error(err, 'File không hợp lệ');
      return;
    }

    const row = this.imageRows[index];
    if (row.preview) this.imageUpload.revokePreview(row.preview);
    row.file = file;
    row.preview = this.imageUpload.createPreview(file);
  }

  onRowDragOver(event: DragEvent): void { event.preventDefault(); }

  // ── Multi-file selection ──────────────────────────────────────────────────

  triggerMultiFileSelect(): void {
    this.multiFileInput?.nativeElement?.click();
  }

  onMultiFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) return;

    const errors: string[] = [];
    const validFiles: File[] = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const err = this.validateFile(f);
      if (err) {
        errors.push(err);
      } else {
        validFiles.push(f);
      }
    }

    if (errors.length > 0) {
      this.validationErrors = errors;
      setTimeout(() => this.validationErrors = [], 8000);
    }

    const emptyIndices: number[] = [];
    this.imageRows.forEach((r, i) => { if (!r.file) emptyIndices.push(i); });

    let fileIdx = 0;
    for (const emptyIdx of emptyIndices) {
      if (fileIdx >= validFiles.length) break;
      const f = validFiles[fileIdx];
      const row = this.imageRows[emptyIdx];
      row.file = f;
      row.preview = this.imageUpload.createPreview(f);
      fileIdx++;
    }

    for (; fileIdx < validFiles.length; fileIdx++) {
      const f = validFiles[fileIdx];
      this.imageRows.push({
        id: this.nextRowId++,
        pageIndex: this.imageRows.length + 1,
        file: f,
        preview: this.imageUpload.createPreview(f),
        status: 'pending',
        uploadPercent: 0,
      });
    }

    input.value = '';
  }

  // ── Upload workflow ────────────────────────────────────────────────────────

  /**
   * Chức năng: Lưu chương rồi upload ảnh, theo đúng 3 bước của backend:
   *   1. `POST /chapter/create` (hoặc `PUT /chapter/update`) → lấy chapterId.
   *   2. `POST /chapter-image/create` → gửi METADATA cả loạt ảnh, nhận về danh
   *      sách `uploadUrl` pre-signed (server tự đánh index theo thứ tự gửi lên).
   *   3. Client PUT thẳng từng file lên S3 bằng `uploadUrl` đó.
   *   Không có bước "confirm" — server đã tạo bản ghi ảnh ngay ở bước 2.
   * Yêu cầu: form hợp lệ, không có STT trùng, mọi file đã qua kiểm tra định dạng.
   * Kết quả trả về: Promise<void>; đóng dialog với `true` khi lưu xong.
   * Exception: không ném — mọi lỗi đều hiển thị bằng toast và đưa phase về idle.
   */
  async save(): Promise<void> {
    if (this.form.invalid || this.isBusy) return;

    if (this.duplicateIndices.size > 0) {
      this.toastr.error('Có STT trùng lặp, vui lòng kiểm tra lại');
      return;
    }

    const invalidFiles = this.filledRows.filter(r => r.file && !this.isValidImage(r.file!));
    if (invalidFiles.length > 0) {
      this.toastr.error(`${invalidFiles.length} file không đúng định dạng hoặc vượt quá kích thước`);
      return;
    }

    // ── Bước 1: thông tin chương ─────────────────────────────────────────────
    this.phase = 'creating';
    const payload = {
      mangaId: this.data.mangaId,
      index: Number(this.form.value.index) || 0,
      subIndex: Number(this.form.value.subIndex) || 0,
      title: this.form.value.title as string,
      chapterId: this.data.chapter?.id,
    };

    let chapterId: string;
    try {
      if (payload.chapterId) {
        await lastValueFrom(this.mangaService.updateChapter(payload));
        chapterId = payload.chapterId;
      } else {
        chapterId = await lastValueFrom(this.mangaService.createChapter(payload));
      }
    } catch {
      this.toastr.error('Không thể lưu thông tin chương');
      this.phase = 'idle';
      return;
    }

    if (!chapterId) {
      this.toastr.error('Server không trả về mã chương — không thể upload ảnh');
      this.phase = 'idle';
      return;
    }

    // Thứ tự trang do STT quyết định: server đánh index theo thứ tự phần tử
    // trong danh sách, nên phải sắp trước khi gửi.
    const toUpload = [...this.filledRows].sort((a, b) => a.pageIndex - b.pageIndex);
    if (toUpload.length === 0) {
      this.toastr.success(this.data.chapter ? 'Cập nhật thành công' : 'Tạo chương thành công');
      this.dialogRef.close(true);
      return;
    }

    // ── Bước 2: đăng ký ảnh, xin uploadUrl ───────────────────────────────────
    this.phase = 'signing';
    toUpload.forEach(r => { r.status = 'signing'; r.uploadPercent = 0; });

    let items: CreateChapterImageItem[];
    try {
      items = await lastValueFrom(
        this.chapterImages.createChapterImages(chapterId, toUpload.map(r => r.file!)),
      );
    } catch {
      this.toastr.error('Không đăng ký được ảnh của chương (chapter-image/create)');
      toUpload.forEach(r => { r.status = 'failed'; r.error = 'Không lấy được URL upload'; });
      this.phase = 'idle';
      return;
    }

    if (items.length !== toUpload.length) {
      this.toastr.warning(
        `Server trả về ${items.length} URL cho ${toUpload.length} ảnh — chỉ upload phần khớp được`,
      );
    }

    toUpload.forEach((r, i) => {
      const item = items[i];
      if (!item?.uploadUrl) {
        r.status = 'failed';
        r.error = 'Thiếu uploadUrl';
        return;
      }
      r.fileId = item.id;
      r.signedUrl = item.uploadUrl;
      r.status = 'uploading';
    });

    // ── Bước 3: PUT thẳng lên S3 ─────────────────────────────────────────────
    this.phase = 'uploading';
    await Promise.all(toUpload.map((_, i) => this.uploadOneRow(toUpload, i)));

    this.phase = 'done';
    const failed = this.failedCount;
    if (failed > 0) {
      this.toastr.warning(`Hoàn tất — ${this.doneCount} thành công, ${failed} thất bại`);
    } else {
      this.toastr.success(`Upload hoàn tất — ${this.doneCount} trang`);
    }
    setTimeout(() => this.dialogRef.close(true), 800);
  }

  private async uploadOneRow(rows: ImageRow[], index: number): Promise<void> {
    const r = rows[index];
    if (!r.signedUrl || !r.file) {
      r.status = 'failed';
      r.error = 'Không có Signed URL';
      return;
    }
    try {
      const etag = await lastValueFrom(
        this.imageUpload.uploadToS3(r.signedUrl, r.file, pct => { r.uploadPercent = pct; })
      );
      r.etag = etag;
      r.status = 'done';
      r.uploadPercent = 100;
    } catch (err: any) {
      r.status = 'failed';
      r.error = err?.message ?? 'Upload thất bại';
      r.uploadPercent = 0;
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

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
