import { Component, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { ChapterImage } from '../../core/models/chapter.interface';
import { TranslationService } from '../../core/services/translation.service';
import {
  OFFLINE_APP, OFFLINE_MANIFEST, OfflineManifest,
} from '../../core/services/download.service';

interface OfflineReaderSettings {
  direction: 'vertical' | 'horizontal';
  horizontalDir: 'rtl' | 'ltr';
  mode: 'normal' | 'focus';
  imageSize: number;
  preloadCount: number;
}

interface OfflineChapter {
  id: string;
  label: string;       // mangaName/title
  mangaId?: string;    // real manga GUID from the manifest → deep-link to read online
  mangaName: string;
  title: string;
  index: number;
  thumbnail?: string;  // manga thumbnail URL (loaded from S3 when online)
  images: ChapterImage[];
}

const SETTINGS_KEY = 'yhl_offline_reader';
const DEFAULT_SETTINGS: OfflineReaderSettings = {
  direction: 'vertical', horizontalDir: 'rtl', mode: 'normal', imageSize: 100, preloadCount: 3,
};

/**
 * Standalone offline reader. Imports a folder previously downloaded by this
 * site (recognised via the manifest's `app` signature), lists its chapters and
 * reads them locally — no API, no comments. Everything lives in memory for the
 * session; importing again is required after a reload.
 */
@Component({
  selector: 'app-offline-reader',
  templateUrl: './offline-reader.component.html',
  styleUrls: ['./offline-reader.component.scss'],
})
export class OfflineReaderComponent implements OnDestroy {
  chapters: OfflineChapter[] = [];
  activeId: string | null = null;
  activeImages: ChapterImage[] = [];
  listOpen = true;
  importing = false;

  settings: OfflineReaderSettings = this.loadSettings();
  pendingSettings: OfflineReaderSettings = { ...this.settings };
  isSidebarOpen = false;

  /** Floating controls hide while scrolling down, reappear on scroll up. */
  controlsVisible = true;
  private lastScrollTop = 0;

  /** All object URLs created from imported files — revoked on destroy. */
  private urls: string[] = [];

  constructor(private toastr: ToastrService, private i18n: TranslationService, private router: Router) {}

  private t(key: string, p?: Record<string, string>): string { return this.i18n.get(key, p); }

  get activeChapter(): OfflineChapter | null {
    return this.chapters.find(c => c.id === this.activeId) ?? null;
  }

  /** Manga to deep-link to for online reading — that of the active chapter (or,
   *  before any is picked, the first imported chapter). Only set when the
   *  manifest carried a real mangaId. */
  get onlineManga(): { id: string; name: string } | null {
    const ch = this.activeChapter ?? this.chapters[0] ?? null;
    return ch?.mangaId ? { id: ch.mangaId, name: ch.mangaName } : null;
  }

  /** Leave the offline reader and open the manga's detail page to read online. */
  goToOnline(): void {
    const m = this.onlineManga;
    if (m) this.router.navigate(['/manga', m.id]);
  }

  // ── Import ───────────────────────────────────────────────────────────────────
  async onPickFolder(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    input.value = '';
    if (!files.length) return;

    this.importing = true;
    try {
      const byPath = new Map<string, File>();
      for (const f of files) byPath.set(this.relPath(f), f);

      const manifests = files.filter(f => f.name === OFFLINE_MANIFEST);
      if (!manifests.length) { this.toastr.warning(this.t('OFFLINE.T_NO_MANIFEST')); return; }

      const added: OfflineChapter[] = [];
      for (const mf of manifests) {
        const rel = this.relPath(mf);
        const root = rel.slice(0, rel.length - OFFLINE_MANIFEST.length); // keeps trailing '/'
        let data: OfflineManifest;
        try { data = JSON.parse(await mf.text()); } catch { continue; }
        if (data?.app !== OFFLINE_APP || !Array.isArray(data.chapters)) continue;

        for (const ch of data.chapters) {
          const imgs: ChapterImage[] = [];
          for (const im of [...ch.images].sort((a, b) => a.index - b.index)) {
            const file = byPath.get(root + (ch.folder || '') + im.file);
            if (!file) continue;
            const url = URL.createObjectURL(file);
            this.urls.push(url);
            imgs.push({ id: String(im.index), index: im.index, cloudUrl: url });
          }
          if (!imgs.length) continue;
          added.push({
            id: ch.id || `${data.mangaName}|${ch.title}`,
            label: `${data.mangaName}/${ch.title}`,
            mangaId: data.mangaId,
            mangaName: data.mangaName, title: ch.title, index: ch.index,
            thumbnail: data.thumbnail, images: imgs,
          });
        }
      }

      if (!added.length) { this.toastr.warning(this.t('OFFLINE.T_INVALID')); return; }

      // Merge, replacing any chapter already imported with the same identity.
      const map = new Map(this.chapters.map(c => [c.id, c]));
      for (const c of added) map.set(c.id, c);
      this.chapters = Array.from(map.values()).sort((a, b) =>
        a.mangaName === b.mangaName ? a.index - b.index : a.mangaName.localeCompare(b.mangaName));

      this.toastr.success(this.t('OFFLINE.T_IMPORTED', { count: String(added.length) }));
      if (!this.activeId) this.selectChapter(this.chapters[0]);
    } finally {
      this.importing = false;
    }
  }

  private relPath(f: File): string {
    return (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
  }

  // ── Reading ──────────────────────────────────────────────────────────────────
  selectChapter(ch: OfflineChapter): void {
    this.activeId = ch.id;
    // New array reference so the viewer's ngOnChanges fires.
    this.activeImages = [...ch.images];
  }

  toggleList(): void { this.listOpen = !this.listOpen; }

  /** Hide the floating controls when scrolling down, show them when scrolling up. */
  onReaderScroll(ev: Event): void {
    const top = (ev.target as HTMLElement).scrollTop;
    const scrollingDown = top > this.lastScrollTop && top > 60;
    this.controlsVisible = !scrollingDown;
    this.lastScrollTop = top;
  }

  // ── Settings ─────────────────────────────────────────────────────────────────
  toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
    if (this.isSidebarOpen) this.pendingSettings = { ...this.settings };
  }
  closeSidebar(): void { this.isSidebarOpen = false; }
  applySettings(): void {
    this.settings = { ...this.pendingSettings };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    this.closeSidebar();
  }

  private loadSettings(): OfflineReaderSettings {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
    } catch { return { ...DEFAULT_SETTINGS }; }
  }

  ngOnDestroy(): void {
    for (const u of this.urls) URL.revokeObjectURL(u);
    this.urls = [];
  }
}
