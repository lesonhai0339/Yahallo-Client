import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, shareReplay } from 'rxjs/operators';

/**
 * TTL cache đơn giản cho các GET ít đổi, để tránh gọi lại API khi điều hướng
 * qua lại (vd back từ reading-chapter về manga-detail) trong một cửa sổ thời gian.
 *
 * - `get()` trả stream đã cache nếu còn hạn; hết hạn/miss thì chạy producer, chia
 *   sẻ cho các subscriber đồng thời (shareReplay) và lưu lại. Lỗi KHÔNG cache.
 * - `invalidate()` xóa theo key hoặc prefix — gọi sau khi mutation (rate/follow/
 *   comment) để lần đọc kế tiếp lấy dữ liệu mới.
 *
 * TTL nên khớp cache phía server: homepage/comment 2 phút, manga-detail 10 phút.
 */
export const CACHE_TTL = {
  HOMEPAGE: 2 * 60_000,
  MANGA_DETAIL: 10 * 60_000,
  CHAPTERS: 10 * 60_000,
  INTERACTION: 10 * 60_000,
  COMMENTS: 2 * 60_000,
  PROFILE: 5 * 60_000,
} as const;

interface CacheEntry {
  expiry: number;
  stream$: Observable<unknown>;
}

@Injectable({ providedIn: 'root' })
export class CacheService {
  private store = new Map<string, CacheEntry>();

  get<T>(key: string, ttlMs: number, producer: () => Observable<T>): Observable<T> {
    const hit = this.store.get(key);
    if (hit && hit.expiry > Date.now()) {
      return hit.stream$ as Observable<T>;
    }

    const stream$ = producer().pipe(
      // Lỗi thì bỏ khỏi cache để lần sau thử lại (không "đóng băng" lỗi trong TTL).
      catchError(err => { this.store.delete(key); return throwError(() => err); }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.store.set(key, { expiry: Date.now() + ttlMs, stream$ });
    return stream$ as Observable<T>;
  }

  /** Xóa một key chính xác hoặc mọi key bắt đầu bằng `keyOrPrefix`. */
  invalidate(keyOrPrefix: string): void {
    for (const k of Array.from(this.store.keys())) {
      if (k === keyOrPrefix || k.startsWith(keyOrPrefix)) this.store.delete(k);
    }
  }

  clear(): void {
    this.store.clear();
  }
}
