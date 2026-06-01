import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay, map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

// ── Domain types ──────────────────────────────────────────────────────────────

export interface ImageUploadMeta {
  userId: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  chapterId?: string;
  pageIndex?: number;
}

export interface SignedUrlItem {
  fileId: string;
  signedUrl: string;
  key: string;
}

export interface FileUploadResult {
  fileId: string;
  etag: string | null;
  status: 'uploaded' | 'failed';
}

export type FileStatus = 'pending' | 'signing' | 'uploading' | 'done' | 'failed';

export interface FileUploadState {
  file: File;
  pageIndex: number;
  preview: string;          // object URL for thumbnail
  fileId?: string;
  signedUrl?: string;
  status: FileStatus;
  uploadPercent: number;    // 0-100 per-file S3 upload progress
  etag?: string;
  error?: string;
}

// ── Service ───────────────────────────────────────────────────────────────────

// NOTE: Set to false and implement real endpoints when backend is ready.
const USE_MOCK = true;
const MOCK_DELAY_MS = 600;

@Injectable({ providedIn: 'root' })
export class ImageUploadService {
  // TODO: Replace with actual API base when endpoints are ready
  private readonly base = environment.serviceApi;

  constructor(private http: HttpClient) {}

  /**
   * Step 1 — Ask server for pre-signed S3 URLs.
   * Request: POST /services/presign-upload  body: ImageUploadMeta[]
   * Response: { value: SignedUrlItem[] }
   */
  getSignedUrls(metas: ImageUploadMeta[]): Observable<SignedUrlItem[]> {
    if (USE_MOCK) {
      const mockItems: SignedUrlItem[] = metas.map((m, i) => ({
        fileId: `mock-${Date.now()}-${i}`,
        signedUrl: `mock-s3://${m.fileName}`,
        key: `chapters/${m.chapterId ?? 'unknown'}/${m.pageIndex}/${m.fileName}`,
      }));
      return of(mockItems).pipe(delay(MOCK_DELAY_MS));
    }

    return this.http.post<any>(`${this.base}/presign-upload`, metas).pipe(
      map((res: any) => {
        const items = res?.value ?? res;
        return Array.isArray(items) ? items : [];
      })
    );
  }

  /**
   * Step 2 — Upload a single file directly to S3 via the signed URL.
   * @param onProgress optional callback receiving 0-100 percent during XHR upload
   * Returns the ETag from S3 response headers on success.
   */
  uploadToS3(
    signedUrl: string,
    file: File,
    onProgress?: (percent: number) => void
  ): Observable<string> {
    // Mock: simulate progress ticks then return fake ETag
    if (signedUrl.startsWith('mock-s3://')) {
      return new Observable<string>(subscriber => {
        let pct = 0;
        const tick = setInterval(() => {
          pct = Math.min(100, pct + 20);
          onProgress?.(pct);
          if (pct >= 100) {
            clearInterval(tick);
            setTimeout(() => {
              subscriber.next(`mock-etag-${Date.now()}`);
              subscriber.complete();
            }, 150);
          }
        }, MOCK_DELAY_MS / 5);
        return () => clearInterval(tick);
      });
    }

    return new Observable<string>(subscriber => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', signedUrl, true);
      xhr.setRequestHeader('Content-Type', file.type);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress?.(Math.round(e.loaded / e.total * 100));
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(100);
          const etag = (xhr.getResponseHeader('ETag') ?? '').replace(/"/g, '');
          subscriber.next(etag || 'ok');
          subscriber.complete();
        } else {
          subscriber.error(new Error(`S3 responded ${xhr.status}`));
        }
      };
      xhr.onerror = () => subscriber.error(new Error('Network error during S3 upload'));
      xhr.send(file);

      return () => xhr.abort();
    });
  }

  /**
   * Step 3 — Notify server of all upload results in one batch.
   * Request: POST /services/confirm-uploads  body: { files: FileUploadResult[] }
   */
  confirmBatchUploads(results: FileUploadResult[]): Observable<any> {
    if (USE_MOCK) {
      return of({ value: { success: true } }).pipe(delay(300));
    }
    return this.http.post(`${this.base}/confirm-uploads`, { files: results });
  }

  /**
   * Step 3b (failure path) — Tell server these uploads failed so it can clean up.
   * Request: POST /services/fail-uploads  body: { fileIds: string[] }
   */
  failUploads(fileIds: string[]): Observable<any> {
    if (USE_MOCK) {
      return of({ value: { success: true } }).pipe(delay(200));
    }
    return this.http.post(`${this.base}/fail-uploads`, { fileIds });
  }

  /** Helper: create preview URL for a File object. Remember to revoke when done. */
  createPreview(file: File): string {
    return URL.createObjectURL(file);
  }

  revokePreview(url: string): void {
    URL.revokeObjectURL(url);
  }
}
