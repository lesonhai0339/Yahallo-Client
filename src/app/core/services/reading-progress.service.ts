import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
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
   * Process 2: reconcile local progress with the server for a logged-in user.
   *
   * Reading positions are written to localStorage on every page (cheap, offline)
   * and only reconciled here — on login / reader open / periodic flush — instead
   * of one API call per image:
   *   1. GET the server snapshot and map it into the local shape.
   *   2. Compare checksums — equal ⇒ nothing to do ('in-sync').
   *   3. Otherwise merge per-manga, newest `lastActionDate` wins (two-way), and
   *      write the merged result back to localStorage.
   *   4. PUSH only the entries that are newer locally (or missing on the server).
   */
  sync(userId: string): Observable<SyncResult> {
    if (!userId || this.prefs.current.readProgressMode === 'off') return of('skipped');

    return this.get(userId).pipe(
      switchMap(serverList => {
        const serverMap = this.fromServer(serverList || []);
        const local = this.prune(this.readMap());

        if (this.checksum(local) === this.checksum(serverMap)) return of('in-sync' as SyncResult);

        const merged = this.mergeByDate(local, serverMap);
        this.writeMap(this.prune(merged));

        // Entries the server doesn't have or that are stale there.
        const toPush = Object.values(merged).filter(m => {
          const s = serverMap[m.mangaId];
          return !s || m.updatedAt > s.updatedAt;
        });
        if (!toPush.length) return of('pulled' as SyncResult);

        const calls = toPush.map(p => this.save({
          userId, mangaId: p.mangaId, chapterId: p.chapterId, lastPage: p.imageIndex,
        }).pipe(catchError(() => of(null))));
        return forkJoin(calls).pipe(map(() => 'pushed' as SyncResult));
      }),
      catchError(() => of('skipped' as SyncResult)),
    );
  }

  /** Map the server's ReadingProgress[] into the keyed/timestamped local shape. */
  private fromServer(list: ReadingProgress[]): Record<string, LocalProgress> {
    const map: Record<string, LocalProgress> = {};
    for (const r of list) {
      if (!r?.mangaId) continue;
      map[r.mangaId] = {
        mangaId: r.mangaId,
        chapterId: r.chapterId,
        imageIndex: r.lastPage ?? 0,
        updatedAt: r.lastReadAt ? (Date.parse(r.lastReadAt) || 0) : 0,
      };
    }
    return map;
  }

  /** Per-manga two-way merge: the entry with the newer `updatedAt` wins. */
  private mergeByDate(
    a: Record<string, LocalProgress>,
    b: Record<string, LocalProgress>,
  ): Record<string, LocalProgress> {
    const out: Record<string, LocalProgress> = { ...b };
    for (const [id, p] of Object.entries(a)) {
      const other = out[id];
      if (!other || p.updatedAt >= other.updatedAt) out[id] = p;
    }
    return out;
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
