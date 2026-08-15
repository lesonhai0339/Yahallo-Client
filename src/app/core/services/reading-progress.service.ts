import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { ReadingProgress, ReadingHistoryItem, ReadingHistoryChapter } from '../models/interfaces';
import { UserPreferencesService } from './user-preferences.service';
import { AuthService } from './auth.service';

/** A single manga's local read position. */
export interface LocalProgress {
  mangaId: string;
  chapterId: string;
  imageIndex: number;
  updatedAt: number; // epoch ms
}

export type SyncResult = 'pushed' | 'pulled' | 'in-sync' | 'skipped';

/**
 * Khoá của một entry tiến trình đọc: MỖI CHƯƠNG một vị trí riêng.
 *
 * Trước đây map chỉ khoá theo `mangaId` nên mỗi bộ truyện chỉ giữ được đúng một
 * vị trí — đọc chương 114 xong quay lại chương 20 là mất vị trí của 114. Backend
 * lưu theo chương (`GET /reading-progress/get` nhận `MangaId` và trả về một
 * LIST), nên khoá phía client phải khớp: manga + chương.
 */
function entryKey(mangaId: string, chapterId: string): string {
  return `${mangaId}|${chapterId}`;
}

/**
 * Tiền tố key localStorage — key THẬT luôn kèm userId (`yhl_read_progress:<id>`).
 *
 * Trước đây chỉ có đúng một key global cho mọi tài khoản, dẫn tới: đăng xuất
 * xong vị trí đọc vẫn còn, và tài khoản KHÁC đăng nhập trên cùng máy sẽ đọc
 * được lịch sử của người trước — tệ hơn nữa là `sync()` sẽ đẩy tiến trình của
 * người trước lên tài khoản người sau.
 */
const LOCAL_KEY_PREFIX = 'yhl_read_progress';

/** Key global cũ — xoá khi gặp, KHÔNG gán cho ai (không thể biết của tài khoản nào). */
const LEGACY_LOCAL_KEY = 'yhl_read_progress';

@Injectable({ providedIn: 'root' })
export class ReadingProgressService {
  private readonly base = environment.readingProgressApi;

  constructor(
    private http: HttpClient,
    private prefs: UserPreferencesService,
    private auth: AuthService,
  ) {}

  // ── Existing per-save API (kept for compatibility) ───────────────────────────
  // Client dùng page 0-based (page 0 = ảnh đầu). Server `LastPage` là 1-based và
  // validator yêu cầu > 0, nên quy đổi tại ranh giới: gửi lên +1, đọc về -1.
  save(progress: Partial<ReadingProgress>): Observable<any> {
    const payload = { ...progress, lastPage: (progress.lastPage ?? 0) + 1 };
    return this.http.post(`${this.base}/save`, payload);
  }

  /**
   * Chức năng: Lấy tiến trình đọc của user cho MỘT bộ truyện — server trả về một
   *   LIST, mỗi chương đã đọc một dòng.
   * Yêu cầu: `mangaId` BẮT BUỘC (query `GetReadingProgressByUserQuery.MangaId`
   *   không nhận null) — không có endpoint lấy toàn bộ progress của user ở đây,
   *   muốn kéo tất cả thì dùng `getPaginated`.
   * Kết quả trả về: Observable emit mảng ReadingProgress (rỗng nếu chưa đọc).
   * Exception: không ném — lỗi mạng trả về mảng rỗng.
   */
  get(mangaId: string): Observable<ReadingProgress[]> {
    const params = new HttpParams().set('MangaId', mangaId);
    return this.http.get<any>(`${this.base}/get`, { params }).pipe(
      // Server bọc trong JsonResponse → phải bóc `value`. Thiếu bước này thì
      // chỗ gọi nhận về object thay vì mảng và `for...of` sẽ ném TypeError.
      map(res => {
        const v = res?.value ?? res;
        return Array.isArray(v) ? v as ReadingProgress[] : [];
      }),
      catchError(() => of([] as ReadingProgress[])),
    );
  }

  /**
   * Server-paginated reading history for a user (GET /reading-progress/get-pagination).
   * Maps the `{ value: PagedResult<ReadingProgressDto> }` envelope into a flat shape.
   */
  getPaginated(
    userId: string, pageNumber: number, pageSize: number, mangaId?: string,
  ): Observable<{ data: ReadingHistoryItem[]; totalCount: number; pageCount: number; pageNumber: number; pageSize: number }> {
    const params: any = { PageNo: pageNumber, PageSize: pageSize, UserId: userId };
    if (mangaId) params['MangaId'] = mangaId;
    return this.http.get<any>(`${this.base}/get-pagination`, { params }).pipe(
      map(res => {
        const v = res?.value ?? res ?? {};
        return {
          data: (v.data ?? []).map((r: any) => this.normalizeHistoryRow(r)) as ReadingHistoryItem[],
          totalCount: v.totalCount ?? 0,
          pageCount: v.pageCount ?? 0,
          pageNumber: v.pageNumber ?? pageNumber,
          pageSize: v.pageSize ?? pageSize,
        };
      }),
      catchError(() => of({ data: [], totalCount: 0, pageCount: 0, pageNumber, pageSize })),
    );
  }

  /**
   * Chức năng: lịch sử đọc gom theo TRUYỆN cho tab lịch sử (GET
   *   `reading-progress/get-by-user`). Khác `getPaginated()` ở chỗ mỗi dòng là một
   *   truyện kèm list chương, và `totalCount` đếm theo truyện chứ không theo bản ghi.
   *
   *   Không gửi `UserId`: endpoint này lấy người dùng từ token phía server, truyền
   *   lên cũng bị bỏ qua.
   * Yêu cầu: `pageNumber` đếm từ 1; `pageSize` số truyện mỗi trang.
   * Kết quả trả về: Observable emit một trang đã chuẩn hoá rồi complete.
   * Exception: không ném — lỗi mạng/API trả trang rỗng để tab hiện empty-state.
   */
  getUserHistory(
    pageNumber: number, pageSize: number,
  ): Observable<{ data: ReadingHistoryItem[]; totalCount: number; pageCount: number; pageNumber: number; pageSize: number }> {
    const params: any = { PageNo: pageNumber, PageSize: pageSize };
    return this.http.get<any>(`${this.base}/get-by-user`, { params }).pipe(
      map(res => {
        const v = res?.value ?? res ?? {};
        return {
          data: (v.data ?? []).map((r: any) => this.normalizeHistoryRow(r)) as ReadingHistoryItem[],
          totalCount: v.totalCount ?? 0,
          pageCount: v.pageCount ?? 0,
          pageNumber: v.pageNumber ?? pageNumber,
          pageSize: v.pageSize ?? pageSize,
        };
      }),
      catchError(() => of({ data: [], totalCount: 0, pageCount: 0, pageNumber, pageSize })),
    );
  }

  // ── Local storage (process 1: updated on every new image) ───────────────────
  /** Save/update the local position for a manga, then prune by user prefs. */
  saveLocal(mangaId: string, chapterId: string, imageIndex: number): void {
    // Chỉ lưu khi đã đăng nhập (khách không cần tiến trình đọc). isLoggedIn phản
    // ánh trạng thái từ /getme. Mode chỉ quyết định resume/jump, không chặn lưu.
    if (!this.auth.isLoggedIn) return;
    const map = this.readMap();
    map[entryKey(mangaId, chapterId)] = { mangaId, chapterId, imageIndex, updatedAt: Date.now() };
    this.writeMap(this.prune(map));
  }

  /**
   * Chức năng: Vị trí đã đọc của ĐÚNG một chương.
   * Yêu cầu: mangaId + chapterId của chương đang mở.
   * Kết quả trả về: LocalProgress của chương đó, hoặc null nếu chưa đọc.
   * Exception: không ném.
   */
  getLocal(mangaId: string, chapterId: string): LocalProgress | null {
    return this.readMap()[entryKey(mangaId, chapterId)] ?? null;
  }

  /**
   * Chức năng: Chương ĐỌC GẦN NHẤT của một manga — dùng cho nút "Đọc tiếp" ở
   *   trang chi tiết. Reader KHÔNG dùng hàm này: vào chương nào thì đọc chương
   *   đó, không được tự nhảy sang chương khác.
   * Yêu cầu: mangaId của bộ truyện.
   * Kết quả trả về: entry mới nhất theo updatedAt, hoặc null nếu chưa đọc bộ này.
   * Exception: không ném.
   */
  getLatestLocal(mangaId: string): LocalProgress | null {
    return Object.values(this.readMap())
      .filter(p => p.mangaId === mangaId)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
  }

  /** Drop the saved position for one chapter (e.g. finished = reached last image). */
  removeLocal(mangaId: string, chapterId: string): void {
    const map = this.readMap();
    const key = entryKey(mangaId, chapterId);
    if (map[key]) {
      delete map[key];
      this.writeMap(map);
    }
  }

  getAllLocal(): LocalProgress[] {
    return Object.values(this.readMap()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** Xoá vị trí đọc local CỦA TÀI KHOẢN ĐANG ĐĂNG NHẬP (không đụng tài khoản khác). */
  clearLocal(): void {
    const key = this.storageKey();
    if (key) localStorage.removeItem(key);
  }

  /** Stable checksum over the local snapshot, used to detect changes vs server. */
  checksum(map = this.readMap()): string {
    const snapshot = Object.values(map)
      .sort((a, b) => entryKey(a.mangaId, a.chapterId).localeCompare(entryKey(b.mangaId, b.chapterId)))
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
   *   3. Otherwise merge per-chapter, newest `lastReadAt` wins (two-way), and
   *      write the merged result back to localStorage.
   *   4. PUSH only the entries that are newer locally (or missing on the server).
   *
   * Nguồn kéo về là `get-pagination` chứ KHÔNG phải `get`: `get` bắt buộc có
   * `MangaId` nên chỉ lấy được tiến trình của đúng một bộ, không dùng để đồng bộ
   * toàn bộ tài khoản được.
   */
  sync(userId: string): Observable<SyncResult> {
    if (!userId || this.prefs.current.readProgressMode === 'off') return of('skipped');

    // Kéo tối đa bằng hạn mức lưu local — nhiều hơn cũng sẽ bị prune bỏ đi.
    const pageSize = Math.max(50, this.prefs.current.maxEntries || 100);

    return this.getPaginated(userId, 1, pageSize).pipe(
      switchMap(page => {
        const serverMap = this.fromHistory(page.data || []);
        const local = this.prune(this.readMap());

        if (this.checksum(local) === this.checksum(serverMap)) return of('in-sync' as SyncResult);

        const merged = this.mergeByDate(local, serverMap);
        this.writeMap(this.prune(merged));

        // Entries the server doesn't have or that are stale there.
        const toPush = Object.values(merged).filter(m => {
          const s = serverMap[entryKey(m.mangaId, m.chapterId)];
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

  /**
   * Chức năng: chuẩn hoá MỘT dòng lịch sử về `ReadingHistoryItem`, chịu được cả
   *   shape cũ (một dòng = một chương) lẫn shape mới (một dòng = một truyện kèm
   *   list chương).
   *
   *   Nhận nhiều tên field khác nhau là CỐ Ý: shape mới đang được chốt ở backend,
   *   và project vốn đã có tiền lệ tên field lệch (vd `depscription`). Gom hết
   *   khác biệt vào đúng một chỗ này thì component không phải biết gì cả — khi
   *   backend chốt xong, sửa ở đây là đủ.
   * Yêu cầu: `raw` — object thô từ API (có thể thiếu field, có thể `null`).
   * Kết quả trả về: `ReadingHistoryItem` với `chapters` LUÔN là mảng (sắp mới
   *   nhất trước), rỗng nếu không suy ra được chương nào.
   * Exception: không ném — field thiếu quy về `''` / `0` / mảng rỗng.
   */
  private normalizeHistoryRow(raw: any): ReadingHistoryItem {
    const r = raw ?? {};
    // Shape mới đặt list chương ở một trong các tên dưới đây; shape cũ không có
    // list nào cả nên tự dựng một phần tử từ chính các field phẳng của dòng đó.
    const rawChapters: any[] =
      r.progresses ?? r.chapters ?? r.chapterProgress ?? r.chapterProgresses
      ?? r.readingProgresses
      ?? (r.chapterId ? [r] : []);

    const chapters = (Array.isArray(rawChapters) ? rawChapters : [])
      .map(c => this.normalizeHistoryChapter(c))
      .filter(c => !!c.chapterId)
      .sort((a, b) => (Date.parse(b.readAt) || 0) - (Date.parse(a.readAt) || 0));

    return {
      mangaId: r.mangaId ?? '',
      mangaName: r.mangaName ?? r.displayName ?? r.name,
      mangaThumbnail: r.mangaThumbnail ?? r.thumbnail,
      chapters,
      // Giữ lại field phẳng của shape cũ cho `fromHistory()` và code cũ khác.
      chapterId: r.chapterId,
      chapterTitle: r.chapterTitle,
      chapterIndex: r.chapterIndex,
      lastPage: r.lastPage,
      lastReadAt: r.lastReadAt,
    };
  }

  /**
   * Chức năng: chuẩn hoá tiến trình đọc của một chương về `ReadingHistoryChapter`.
   * Yêu cầu: `raw` — object thô; vị trí đọc nhận `readIndex`/`lastPage`/`imageIndex`,
   *   tổng ảnh nhận `totalPage`/`totalImage`/`totalImages`/`totalPages`.
   * Kết quả trả về: `ReadingHistoryChapter`; `totalPage = 0` khi backend không trả
   *   tổng ảnh (template sẽ ẩn thanh phần trăm thay vì hiện 0%).
   * Exception: không ném.
   */
  private normalizeHistoryChapter(raw: any): ReadingHistoryChapter {
    const c = raw ?? {};
    return {
      chapterId: c.chapterId ?? c.id ?? '',
      index: c.index ?? c.chapterIndex ?? null,
      subIndex: c.subIndex ?? null,
      readIndex: Number(c.lastReadPage ?? c.readIndex ?? c.lastPage ?? c.imageIndex ?? 0) || 0,
      totalPage: Number(c.totalPage ?? c.totalImage ?? c.totalImages ?? c.totalPages ?? 0) || 0,
      readAt: c.readAt ?? c.lastReadAt ?? c.updateDate ?? '',
    };
  }

  /**
   * Chức năng: Đổi các dòng lịch sử đọc từ server (`get-pagination`) sang shape
   *   local, khoá theo manga+chương. Trải phẳng `chapters` của shape mới; shape cũ
   *   đã được `normalizeHistoryRow()` gói thành list 1 phần tử nên đi chung một
   *   nhánh, không cần rẽ đôi.
   * Yêu cầu: `list` là `data` ĐÃ chuẩn hoá của trang lịch sử; `readIndex` 1-based.
   * Kết quả trả về: map khoá `mangaId|chapterId`.
   * Exception: không ném — dòng thiếu mangaId/chapterId bị bỏ qua.
   */
  private fromHistory(list: ReadingHistoryItem[]): Record<string, LocalProgress> {
    const map: Record<string, LocalProgress> = {};
    for (const r of list) {
      if (!r?.mangaId) continue;
      for (const c of r.chapters ?? []) {
        if (!c.chapterId) continue;
        map[entryKey(r.mangaId, c.chapterId)] = {
          mangaId: r.mangaId,
          chapterId: c.chapterId,
          // Server 1-based → client 0-based.
          imageIndex: Math.max(0, c.readIndex - 1),
          updatedAt: c.readAt ? (Date.parse(c.readAt) || 0) : 0,
        };
      }
    }
    return map;
  }

  /** Map the server's ReadingProgress[] into the keyed/timestamped local shape. */
  private fromServer(list: ReadingProgress[]): Record<string, LocalProgress> {
    const map: Record<string, LocalProgress> = {};
    for (const r of list) {
      if (!r?.mangaId) continue;
      map[entryKey(r.mangaId, r.chapterId)] = {
        mangaId: r.mangaId,
        chapterId: r.chapterId,
        // Server 1-based → client 0-based.
        imageIndex: Math.max(0, (r.lastPage ?? 1) - 1),
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
    for (const p of entries) result[entryKey(p.mangaId, p.chapterId)] = p;
    return result;
  }

  /**
   * Chức năng: Key localStorage của tài khoản đang đăng nhập.
   * Yêu cầu: không.
   * Kết quả trả về: `yhl_read_progress:<userId>`, hoặc **null khi chưa đăng nhập**
   *   — khách không có vị trí đọc, và cũng không được đọc của người khác.
   * Exception: không ném.
   */
  private storageKey(): string | null {
    const id = this.auth.currentUser?.id;
    return id ? `${LOCAL_KEY_PREFIX}:${id}` : null;
  }

  private readMap(): Record<string, LocalProgress> {
    // Dọn dữ liệu của bản cũ (key global). Không migrate sang tài khoản hiện tại
    // vì không có cách nào biết nó là của ai — người đăng nhập sau sẽ thừa hưởng
    // nhầm lịch sử của người trước. Người dùng đã đăng nhập lấy lại được vị trí
    // từ server qua sync().
    if (localStorage.getItem(LEGACY_LOCAL_KEY) !== null) {
      localStorage.removeItem(LEGACY_LOCAL_KEY);
    }

    const key = this.storageKey();
    if (!key) return {};
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  private writeMap(map: Record<string, LocalProgress>): void {
    const key = this.storageKey();
    if (!key) return;   // chưa đăng nhập → không ghi gì
    localStorage.setItem(key, JSON.stringify(map));
  }
}
