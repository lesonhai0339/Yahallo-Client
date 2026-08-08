import { Injectable } from '@angular/core';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import JSZip from 'jszip';
import { MangaService } from './manga.service';
import { ChapterImage } from '../models/chapter.interface';

/** Signature written into every package so the offline reader can recognise
 *  folders this site produced. Bump VERSION if the manifest shape changes. */
export const OFFLINE_APP = 'yahallo-offline';
export const OFFLINE_MANIFEST = 'manifest.json';
const OFFLINE_VERSION = 1;

/** manifest.json shape — also consumed by the offline reader on import. */
export interface OfflineManifestImage { index: number; file: string; }
export interface OfflineManifestChapter {
  id: string;       // identity hash(mangaName + title) — confirms our origin
  index: number;
  title: string;
  folder: string;   // '' for a single chapter, '<index>/' inside a collection
  images: OfflineManifestImage[];
}
export interface OfflineManifest {
  app: string;
  version: number;
  /** Manga id — lets the offline reader deep-link to /manga/:id to read online. */
  mangaId?: string;
  mangaName: string;
  /** Manga thumbnail URL (S3/CloudFront) — referenced, not bundled. Shown in the
   *  offline list when online; falls back to a placeholder when offline. */
  thumbnail?: string;
  type: 'chapter' | 'collection';
  chapters: OfflineManifestChapter[];
}

export type DownloadStatus = 'queued' | 'running' | 'zipping' | 'done' | 'error' | 'cancelled' | 'paused';

/** A single chapter inside a download job (a job may bundle a range of them). */
export interface DownloadChapterState {
  chapterId: string;
  index: number;
  title: string;
  total: number;   // image count (0 until fetched)
  loaded: number;  // images downloaded so far
}

export interface DownloadJob {
  id: string;
  mangaName: string;
  /** Display label, e.g. "Chapter 12" or "Chapter 3 – 8". */
  label: string;
  /** Final zip file name. */
  fileName: string;
  type: 'chapter' | 'collection';
  status: DownloadStatus;
  /** Overall 0–100. */
  percent: number;
  error?: string;
  /** Manga id — copied into the manifest so the offline reader can link online. */
  mangaId?: string;
  /** Manga thumbnail URL — copied into the manifest for the offline list. */
  thumbnail?: string;
  chapters: DownloadChapterState[];
}

interface ChapterRef { id: string; index: number; title: string; }

const IMAGE_CONCURRENCY = 4;   // parallel image fetches within a chapter
const ZIP_RESERVE = 4;         // % of the bar reserved for the zip-generation step

@Injectable({ providedIn: 'root' })
export class DownloadService {
  private jobsSubject = new BehaviorSubject<DownloadJob[]>([]);
  /** Live list of download jobs (newest first) — drives the profile manager UI. */
  downloads$ = this.jobsSubject.asObservable();

  /** Per-job abort controllers (not stored on the job to keep it serialisable). */
  private aborters = new Map<string, AbortController>();
  private processing = false;
  private queue: string[] = [];

  constructor(private manga: MangaService) {}

  get jobs(): DownloadJob[] { return this.jobsSubject.value; }

  // ── Public API ───────────────────────────────────────────────────────────────
  /** Queue a single chapter → `<slug>_<index>.zip`. */
  downloadChapter(mangaName: string, chapter: ChapterRef, thumbnail?: string, mangaId?: string): string {
    const slug = this.slugify(mangaName);
    return this.enqueue({
      mangaName,
      mangaId,
      thumbnail,
      label: `${this.t('chapter')} ${chapter.index}`,
      fileName: `${slug}_${chapter.index}.zip`,
      type: 'chapter',
      chapters: [chapter],
    });
  }

  /** Queue a range of chapters bundled into one `<slug>_<start>-<end>.zip`. */
  downloadRange(mangaName: string, chapters: ChapterRef[], thumbnail?: string, mangaId?: string): string {
    const slug = this.slugify(mangaName);
    const sorted = [...chapters].sort((a, b) => a.index - b.index);
    const first = sorted[0].index;
    const last = sorted[sorted.length - 1].index;
    return this.enqueue({
      mangaName,
      mangaId,
      thumbnail,
      label: `${this.t('chapter')} ${first} – ${last}`,
      fileName: `${slug}_${first}-${last}.zip`,
      type: 'collection',
      chapters: sorted,
    });
  }

  /** Abort an in-flight or queued job and free its resources. */
  cancel(jobId: string): void {
    this.aborters.get(jobId)?.abort();
    this.aborters.delete(jobId);
    this.queue = this.queue.filter(id => id !== jobId);
    this.patch(jobId, j => (j.status === 'done' ? j : { ...j, status: 'cancelled' }));
  }

  /**
   * Dừng một job đang chạy/chờ: ngắt mạng nhưng GIỮ job trong danh sách (status
   * 'paused') để người dùng có thể tải tiếp (resume) hoặc xóa hẳn (remove).
   */
  pause(jobId: string): void {
    this.aborters.get(jobId)?.abort();
    this.aborters.delete(jobId);
    this.queue = this.queue.filter(id => id !== jobId);
    this.patch(jobId, j => (j.status === 'done' ? j : { ...j, status: 'paused' }));
  }

  /**
   * Tải tiếp một job đã dừng: zip + blob đã tải bị bỏ khi abort nên ta tải lại
   * từ đầu — reset tiến trình rồi đưa lại vào hàng đợi.
   */
  resume(jobId: string): void {
    const job = this.jobs.find(j => j.id === jobId);
    if (!job || job.status === 'running' || job.status === 'queued' || job.status === 'done') return;
    this.patch(jobId, j => ({
      ...j,
      status: 'queued',
      percent: 0,
      error: undefined,
      chapters: j.chapters.map(c => ({ ...c, loaded: 0 })),
    }));
    if (!this.queue.includes(jobId)) this.queue.push(jobId);
    void this.pump();
  }

  /** Remove a finished/cancelled/errored job from the list. */
  remove(jobId: string): void {
    this.aborters.get(jobId)?.abort();
    this.aborters.delete(jobId);
    this.queue = this.queue.filter(id => id !== jobId);
    this.jobsSubject.next(this.jobs.filter(j => j.id !== jobId));
  }

  // ── Queue / processing ───────────────────────────────────────────────────────
  private enqueue(init: {
    mangaName: string;
    mangaId?: string;
    thumbnail?: string;
    label: string;
    fileName: string;
    type: 'chapter' | 'collection';
    chapters: ChapterRef[];
  }): string {
    const id = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const job: DownloadJob = {
      id,
      mangaName: init.mangaName,
      mangaId: init.mangaId,
      thumbnail: init.thumbnail,
      label: init.label,
      fileName: init.fileName,
      type: init.type,
      status: 'queued',
      percent: 0,
      chapters: init.chapters.map(c => ({
        chapterId: c.id, index: c.index, title: c.title, total: 0, loaded: 0,
      })),
    };
    this.jobsSubject.next([job, ...this.jobs]);
    this.queue.push(id);
    void this.pump();
    return id;
  }

  private async pump(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      while (this.queue.length) {
        const id = this.queue.shift()!;
        const job = this.jobs.find(j => j.id === id);
        if (!job || job.status === 'cancelled') continue;
        await this.runJob(id);
      }
    } finally {
      this.processing = false;
    }
  }

  private async runJob(jobId: string): Promise<void> {
    const aborter = new AbortController();
    this.aborters.set(jobId, aborter);
    this.patch(jobId, j => ({ ...j, status: 'running' }));

    const zip = new JSZip();
    try {
      const job = this.jobs.find(j => j.id === jobId)!;
      const isCollection = job.type === 'collection';

      // 1) Resolve image lists up-front so we know the grand total for the bar.
      const lists: ChapterImage[][] = [];
      for (let ci = 0; ci < job.chapters.length; ci++) {
        this.ensureAlive(aborter);
        const imgs = (await firstValueFrom(this.manga.getChapterImages(job.mangaId!, job.chapters[ci].chapterId))) || [];
        const sorted = [...imgs].sort((a, b) => a.index - b.index);
        lists.push(sorted);
        this.patchChapter(jobId, ci, c => ({ ...c, total: sorted.length }));
      }

      // 2) Fetch every image, add to the zip, build the manifest as we go.
      const manifestChapters: OfflineManifestChapter[] = [];
      for (let ci = 0; ci < job.chapters.length; ci++) {
        const imgs = lists[ci];
        const ch = job.chapters[ci];
        const folder = isCollection ? `${ch.index}/` : '';
        const entries: OfflineManifestImage[] = [];
        await this.fetchPool(imgs, aborter, async (img, i) => {
          const blob = await this.fetchImage(img.cloudUrl, aborter.signal);
          const file = `${this.pad(i + 1)}${this.ext(img.cloudUrl)}`;
          zip.file(`${folder}${file}`, blob);
          entries[i] = { index: img.index, file };
          this.patchChapter(jobId, ci, c => ({ ...c, loaded: c.loaded + 1 }));
          this.recomputePercent(jobId);
        });
        manifestChapters.push({
          id: this.hashId(job.mangaName, ch.title),
          index: ch.index,
          title: ch.title,
          folder,
          images: entries.filter(Boolean),
        });
      }

      // 3) Drop the manifest, generate the zip and trigger the download.
      const manifest: OfflineManifest = {
        app: OFFLINE_APP,
        version: OFFLINE_VERSION,
        mangaId: job.mangaId,
        mangaName: job.mangaName,
        thumbnail: job.thumbnail,
        type: job.type,
        chapters: manifestChapters,
      };
      zip.file(OFFLINE_MANIFEST, JSON.stringify(manifest, null, 2));

      this.ensureAlive(aborter);
      this.patch(jobId, j => ({ ...j, status: 'zipping' }));
      const out = await zip.generateAsync({ type: 'blob' }, (meta: { percent: number }) => {
        this.patch(jobId, j => ({ ...j, percent: Math.min(100, (100 - ZIP_RESERVE) + (meta.percent * ZIP_RESERVE) / 100) }));
      });
      this.ensureAlive(aborter);
      this.saveBlob(out, this.jobs.find(j => j.id === jobId)!.fileName);
      this.patch(jobId, j => ({ ...j, status: 'done', percent: 100 }));
    } catch (e: any) {
      if (aborter.signal.aborted) {
        this.patch(jobId, j => ({ ...j, status: 'cancelled' }));
      } else {
        this.patch(jobId, j => ({ ...j, status: 'error', error: e?.message || 'download failed' }));
      }
    } finally {
      this.aborters.delete(jobId);
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  /** Run `task` over items with a fixed concurrency, aborting cleanly. */
  private async fetchPool<T>(
    items: T[], aborter: AbortController, task: (item: T, index: number) => Promise<void>,
  ): Promise<void> {
    let cursor = 0;
    const worker = async () => {
      while (cursor < items.length) {
        this.ensureAlive(aborter);
        const i = cursor++;
        await task(items[i], i);
      }
    };
    const workers = Array.from({ length: Math.min(IMAGE_CONCURRENCY, items.length) }, () => worker());
    await Promise.all(workers);
  }

  private async fetchImage(url: string, signal: AbortSignal): Promise<Blob> {
    const res = await fetch(url, { signal, mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.blob();
  }

  private recomputePercent(jobId: string): void {
    this.patch(jobId, j => {
      const total = j.chapters.reduce((s, c) => s + c.total, 0);
      const loaded = j.chapters.reduce((s, c) => s + c.loaded, 0);
      if (!total) return j;
      // Cap the fetch phase at (100 - ZIP_RESERVE); the zip step fills the rest.
      const pct = Math.round(((loaded / total) * (100 - ZIP_RESERVE)) * 10) / 10;
      return { ...j, percent: Math.min(100 - ZIP_RESERVE, pct) };
    });
  }

  private ensureAlive(aborter: AbortController): void {
    if (aborter.signal.aborted) throw new DOMException('aborted', 'AbortError');
  }

  private saveBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /** Vietnamese-safe slug: strip diacritics → ascii, spaces → underscore. */
  private slugify(name: string): string {
    return (name || 'manga')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'manga';
  }

  private pad(n: number): string { return String(n).padStart(3, '0'); }

  /** Stable identity for a chapter package — djb2 over mangaName + title. */
  private hashId(mangaName: string, title: string): string {
    const s = `${mangaName}|${title}`;
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h.toString(16);
  }

  private ext(url: string): string {
    const m = /\.(jpe?g|png|webp|gif|avif|bmp)(?:$|\?)/i.exec(url);
    return m ? `.${m[1].toLowerCase()}` : '.jpg';
  }

  /** Minimal label — kept English to avoid a TranslationService dependency here. */
  private t(_key: string): string { return 'Chapter'; }

  // ── State mutation ───────────────────────────────────────────────────────────
  private patch(jobId: string, fn: (job: DownloadJob) => DownloadJob): void {
    this.jobsSubject.next(this.jobs.map(j => (j.id === jobId ? fn(j) : j)));
  }

  private patchChapter(jobId: string, ci: number, fn: (c: DownloadChapterState) => DownloadChapterState): void {
    this.patch(jobId, j => ({
      ...j,
      chapters: j.chapters.map((c, i) => (i === ci ? fn(c) : c)),
    }));
  }
}
