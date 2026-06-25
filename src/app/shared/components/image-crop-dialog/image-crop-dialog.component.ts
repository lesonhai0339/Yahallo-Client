import {
  Component, EventEmitter, Input, Output, ChangeDetectionStrategy,
} from '@angular/core';
import { ImageCroppedEvent, ImageTransform } from 'ngx-image-cropper';

/**
 * Modal cropper: pick an image, then pan (drag the image) / zoom / rotate to
 * choose the crop area before it's uploaded. The cropped result is emitted as a
 * File so callers can drop it straight into their existing upload flow.
 *
 * Bootstrap-style overlay (the public app doesn't use Angular Material), driven
 * by *ngIf in the parent — render it only while a file is being cropped.
 */
@Component({
  selector: 'app-image-crop-dialog',
  templateUrl: './image-crop-dialog.component.html',
  styleUrls: ['./image-crop-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageCropDialogComponent {
  /** Source file the user picked. Re-cropping a fresh pick re-feeds this input. */
  @Input() file!: File;
  /** Width / height ratio of the crop frame (1 = square avatar, 3 = wide banner). */
  @Input() aspectRatio = 1;
  /** Circular mask preview (avatars). The output is still a rectangle. */
  @Input() round = false;
  /** i18n key for the dialog title. */
  @Input() titleKey = 'USER.CROP_TITLE';

  @Output() confirmed = new EventEmitter<File>();
  @Output() cancelled = new EventEmitter<void>();

  transform: ImageTransform = { scale: 1, rotate: 0 };
  private croppedBlob: Blob | null = null;
  loaded = false;
  failed = false;

  private get scale(): number { return this.transform.scale ?? 1; }

  imageCropped(e: ImageCroppedEvent): void {
    this.croppedBlob = e.blob ?? null;
  }

  imageLoaded(): void { this.loaded = true; }
  loadFailed(): void { this.failed = true; }

  zoomIn(): void { this.setScale(this.scale + 0.1); }
  zoomOut(): void { this.setScale(this.scale - 0.1); }
  rotateLeft(): void { this.rotate(-90); }
  rotateRight(): void { this.rotate(90); }

  reset(): void {
    this.transform = { scale: 1, rotate: 0, flipH: false, flipV: false };
  }

  private setScale(value: number): void {
    // Clamp so the image can't be zoomed away entirely or blown up absurdly.
    const scale = Math.min(3, Math.max(0.2, Math.round(value * 10) / 10));
    this.transform = { ...this.transform, scale };
  }

  private rotate(deg: number): void {
    const rotate = (((this.transform.rotate ?? 0) + deg) % 360 + 360) % 360;
    this.transform = { ...this.transform, rotate };
  }

  apply(): void {
    if (!this.croppedBlob) { this.cancel(); return; }
    // Keep the source name (so the server sees a sensible filename); fall back to
    // png. The blob type drives the extension/content-type on upload.
    const type = this.croppedBlob.type || 'image/png';
    const ext = type.split('/')[1] || 'png';
    const base = (this.file?.name || 'image').replace(/\.[^.]+$/, '');
    const out = new File([this.croppedBlob], `${base}.${ext}`, { type });
    this.confirmed.emit(out);
  }

  cancel(): void { this.cancelled.emit(); }
}
