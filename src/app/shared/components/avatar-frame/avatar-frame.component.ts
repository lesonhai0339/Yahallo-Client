import { Component, Input, OnDestroy } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { AvatarFrameService } from '../../../core/services/avatar-frame.service';

/**
 * Avatar wrapped in a decorative frame. Pass an explicit `frameId` for a fixed
 * frame (e.g. the settings picker previews), or omit it to follow the user's
 * currently selected frame reactively (e.g. the profile header).
 */
@Component({
  selector: 'app-avatar-frame',
  templateUrl: './avatar-frame.component.html',
  styleUrls: ['./avatar-frame.component.scss'],
})
export class AvatarFrameComponent implements OnDestroy {
  @Input() src: string | null | undefined;
  @Input() alt = '';
  /** Outer diameter in px. */
  @Input() size = 116;
  @Input() fallback = '/assets/user.jpg';

  resolvedFrame = 'default';
  emojis: string[] = [];
  artHtml: SafeHtml | null = null;
  frameImage: string | null = null;
  private frameHoleFrac = 0.5;

  private explicit: string | null = null;
  private artCache = new Map<string, SafeHtml>();
  private sub: Subscription;

  constructor(private frameService: AvatarFrameService, private sanitizer: DomSanitizer) {
    this.sub = this.frameService.frame$.subscribe(() => this.update());
  }

  @Input() set frameId(value: string | null | undefined) {
    this.explicit = value ?? null;
    this.update();
  }

  /** Gap (px) between the photo and the ring; scales gently with size. */
  get gap(): number { return Math.max(2, Math.round(this.size * 0.026)); }
  get avatarSize(): number {
    // For image frames the PNG fills the whole box (no overflow); the photo is
    // sized to the frame's inner hole so the ring hugs it (×1.03 = slight
    // overlap so there's no seam between photo and ring).
    if (this.frameImage) return Math.round(this.size * this.frameHoleFrac * 1.03);
    return this.size - this.gap * 2 - this.ringWidth * 2;
  }

  /** Visible ring thickness. */
  get ringWidth(): number { return Math.max(3, Math.round(this.size * 0.05)); }

  emojiTransform(i: number): string {
    const angle = (360 / this.emojis.length) * i;
    const radius = this.size / 2 - this.size * 0.1;
    // Orbit each emoji onto the ring, then counter-rotate so it stays upright.
    return `translate(-50%, -50%) rotate(${angle}deg) translateY(${-radius}px) rotate(${-angle}deg)`;
  }

  private update(): void {
    this.resolvedFrame = this.explicit ?? this.frameService.currentFrame;
    const meta = this.frameService.meta(this.resolvedFrame);
    this.emojis = meta?.emojis ?? [];
    this.artHtml = meta?.art ? this.safeArt(this.resolvedFrame, meta.art) : null;
    this.frameImage = meta?.image ?? null;
    this.frameHoleFrac = meta?.holeFrac ?? 0.5;
  }

  private safeArt(id: string, svg: string): SafeHtml {
    let html = this.artCache.get(id);
    if (!html) {
      html = this.sanitizer.bypassSecurityTrustHtml(svg);
      this.artCache.set(id, html);
    }
    return html;
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }
}
