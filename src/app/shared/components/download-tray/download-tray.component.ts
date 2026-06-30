import { Component } from '@angular/core';
import { map } from 'rxjs/operators';
import { DownloadService, DownloadJob } from '../../../core/services/download.service';

/**
 * Floating bottom-right tray showing in-progress downloads (zip name + percent),
 * replacing the old "added to queue" toast. Collapsed by default it shows a
 * single item with a "show all (N)" toggle; expanded it lists every active job
 * with a collapse button. The full history still lives in profile › downloads.
 */
@Component({
  selector: 'app-download-tray',
  templateUrl: './download-tray.component.html',
  styleUrls: ['./download-tray.component.scss'],
})
export class DownloadTrayComponent {
  expanded = false;

  /** Jobs still in the tray — in-flight plus paused (so resume/remove stay
   *  reachable). Finished/cancelled ones drop out. */
  readonly active$ = this.download.downloads$.pipe(
    map(jobs => jobs.filter(j =>
      j.status === 'queued' || j.status === 'running' ||
      j.status === 'zipping' || j.status === 'paused')),
  );

  constructor(public download: DownloadService) {}

  /** Collapsed = newest job only; expanded = all of them. */
  visible(jobs: DownloadJob[]): DownloadJob[] {
    return this.expanded ? jobs : jobs.slice(0, 1);
  }

  /** Dừng → status 'paused', lúc đó item hiện 2 lựa chọn tiếp tục / xóa. */
  pause(id: string, ev: Event): void {
    ev.stopPropagation();
    this.download.pause(id);
  }

  resume(id: string, ev: Event): void {
    ev.stopPropagation();
    this.download.resume(id);
  }

  /** Xóa hoàn toàn job khỏi danh sách. */
  remove(id: string, ev: Event): void {
    ev.stopPropagation();
    this.download.remove(id);
  }

  trackById(_: number, j: DownloadJob): string { return j.id; }
}
