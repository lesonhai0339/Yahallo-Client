import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ReadingProgress } from '../models/interfaces';
import { UserPreferencesService } from './user-preferences.service';

/** A single manga's local read position. */
export interface LocalProgress {
  mangaId: string;
  chapterId: string;
  imageIndex: number;
  updatedAt: number; // epoch ms
}

export type SyncResult = 'pushed' | 'pulled' | 'in-sync' | 'skipped';

const LOCAL_KEY = 'yhl_read_progress';
// MOCK "server" — stands in for the backend until the sync API exists.
const MOCK_SERVER_KEY = 'yhl_read_progress_server';
const MOCK_SERVER_SUM_KEY = 'yhl_read_progress_server_sum';

@Injectable({ providedIn: 'root' })
export class ReadingProgressService {
  private readonly base = environment.readingProgressApi;

  constructor(private http: HttpClient, private prefs: UserPreferencesService) {}

  // ── Existing per-save API (kept for compatibility) ───────────────────────────
  save(progress: Partial<ReadingProgress>): Observable<any> {
    return this.http.post(`${this.base}/save`, progress);
  }

  get(userId: string, mangaId?: string): Observable<ReadingProgress[]> {
    const params: any = { userId };
    if (mangaId) params['mangaId'] = mangaId;
    return this.http.get<ReadingProgress[]>(`${this.base}/get`, { params });
  }

  getForManga(userId: string, mangaId: string): Observable<ReadingProgress | null> {
    return this.http.get<ReadingProgress | null>(`${this.base}/get/${userId}/${mangaId}`);
  }

  // ── Local storage (process 1: updated on every new image) ───────────────────
  /** Save/update the local position for a manga, then prune by user prefs. */
  saveLocal(mangaId: string, chapterId: string, imageIndex: number): void {
    if (this.prefs.current.readProgressMode === 'off') return;
    const map = this.readMap();
    map[mangaId] = { mangaId, chapterId, imageIndex, updatedAt: Date.now() };
    this.writeMap(this.prune(map));
  }

  getLocal(mangaId: string): LocalProgress | null {
    return this.readMap()[mangaId] ?? null;
  }

  /** Drop the saved position for one manga (e.g. finished = reached last image). */
  removeLocal(mangaId: string): void {
    const map = this.readMap();
    if (map[mangaId]) {
      delete map[mangaId];
      this.writeMap(map);
    }
  }

  getAllLocal(): LocalProgress[] {
    return Object.values(this.readMap()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  clearLocal(): void {
    localStorage.removeItem(LOCAL_KEY);
  }

  /** Stable checksum over the local snapshot, used to detect changes vs server. */
  checksum(map = this.readMap()): string {
    const snapshot = Object.values(map)
      .sort((a, b) => a.mangaId.localeCompare(b.mangaId))
      .map(p => `${p.mangaId}:${p.chapterId}:${p.imageIndex}:${p.updatedAt}`)
      .join('|');
    // djb2
    let hash = 5381;
    for (let i = 0; i < snapshot.length; i++) {
      hash = ((hash << 5) + hash + snapshot.charCodeAt(i)) >>> 0;
    }
    return hash.toString(16);
  }

  /**
   * Process 2: sync local progress with the server for a logged-in user.
   *
   * MOCK: there is no sync API yet, so the "server" is emulated in localStorage.
   * The real flow (preserved here) is:
   *   1. compute local checksum, send to API
   *   2. if server differs from local  → PUSH the whole local snapshot
   *   3. if server has nothing          → PULL is impossible, push
   *   4. if local is empty & server has → PULL server into local (cross-device)
   *   5. if equal                       → in-sync, skip
   * TODO: replace MOCK_SERVER_* reads/writes with real endpoints, e.g.
   *   POST `${base}/sync-check` { userId, checksum } and `${base}/sync-push|pull`.
   */
  sync(userId: string): Observable<SyncResult> {
    if (!userId || this.prefs.current.readProgressMode === 'off') return of('skipped');

    const local = this.prune(this.readMap());
    this.writeMap(local);
    const localSum = this.checksum(local);

    const serverSum = localStorage.getItem(MOCK_SERVER_SUM_KEY);
    const serverRaw = localStorage.getItem(MOCK_SERVER_KEY);
    const serverMap: Record<string, LocalProgress> = serverRaw ? JSON.parse(serverRaw) : {};
    const hasLocal = Object.keys(local).length > 0;
    const hasServer = Object.keys(serverMap).length > 0;

    if (!hasLocal && hasServer) {
      // Pull — e.g. fresh device.
      this.writeMap(this.prune(serverMap));
      return of('pulled');
    }
    if (localSum === serverSum) return of('in-sync');

    // Local changed → push the whole snapshot.
    localStorage.setItem(MOCK_SERVER_KEY, JSON.stringify(local));
    localStorage.setItem(MOCK_SERVER_SUM_KEY, localSum);
    return of('pushed');
  }

  // ── Pruning: retention window + max entries ──────────────────────────────────
  private prune(map: Record<string, LocalProgress>): Record<string, LocalProgress> {
    const { retentionDays, maxEntries } = this.prefs.current;
    let entries = Object.values(map);

    if (retentionDays > 0) {
      const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      entries = entries.filter(p => p.updatedAt >= cutoff);
    }
    // Keep the most-recently-updated within maxEntries.
    entries.sort((a, b) => b.updatedAt - a.updatedAt);
    if (maxEntries > 0 && entries.length > maxEntries) {
      entries = entries.slice(0, maxEntries);
    }

    const result: Record<string, LocalProgress> = {};
    for (const p of entries) result[p.mangaId] = p;
    return result;
  }

  private readMap(): Record<string, LocalProgress> {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  private writeMap(map: Record<string, LocalProgress>): void {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(map));
  }
}
