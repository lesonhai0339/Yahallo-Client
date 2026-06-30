import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from './auth.service';

export type AvatarFrameTier = 'basic' | 'premium';

export interface AvatarFrameMeta {
  /** Stable id; also the `.avatar-frame--<id>` CSS modifier. */
  id: string;
  /** i18n key for the display name (translated at the view layer). */
  label: string;
  /** Unlock tier — basic frames are free, premium are gated/decorative+. */
  tier: AvatarFrameTier;
  /** Frame has motion — used to surface a badge / respect reduced-motion. */
  animated?: boolean;
  /** Decorative emoji distributed around the ring (for "template" frames). */
  emojis?: string[];
  /** Raw inline SVG art rendered around the avatar (for illustrated frames). */
  art?: string;
  /** PNG overlay (transparent-centre ring) rendered on top of the avatar. */
  image?: string;
  /**
   * For image frames: the ring's inner-hole diameter as a fraction of the PNG
   * width. The component scales the overlay so the hole hugs the avatar, i.e.
   * overlay width = avatarDiameter / holeFrac.
   */
  holeFrac?: number;
}

const FRAME_IMG = 'assets/avatar-frames';

// Frame được lưu riêng theo user-id: `yhl_avatar_frame:<userId>`.
// Khách chưa đăng nhập dùng key `:guest` để không lẫn với user nào.
const STORAGE_PREFIX = 'yhl_avatar_frame';
const GUEST_KEY = `${STORAGE_PREFIX}:guest`;
const DEFAULT_FRAME = 'gradient';

// The built-in frame catalogue. Add a frame with an entry here plus matching
// `.avatar-frame--<id>` styles — the picker (grouped by tier) and the avatar
// component pick it up automatically. Ready to be extended with backend
// templates unlocked per user.

// The built-in frame catalogue. New frames just need an entry here plus the
// matching `.avatar-frame--<id>` styles in styles.scss — the picker and the
// avatar component pick them up automatically. Later these can be replaced /
// extended by templates fetched from the backend and unlocked per user.
export const AVATAR_FRAMES: AvatarFrameMeta[] = [
  // ── Basic ────────────────────────────────────────────────────────────────
  { id: 'default',  label: 'SETTINGS.FRAME_DEFAULT',  tier: 'basic' },
  { id: 'gradient', label: 'SETTINGS.FRAME_GRADIENT', tier: 'basic' },
  { id: 'rainbow',  label: 'SETTINGS.FRAME_RAINBOW',  tier: 'basic' },
  { id: 'wreath',   label: 'SETTINGS.FRAME_WREATH',   tier: 'basic', emojis: ['🌸', '🌷', '🌼', '🌺', '🌻', '🌹'] },
  { id: 'heart',    label: 'SETTINGS.FRAME_HEART',    tier: 'basic', image: `${FRAME_IMG}/heart.png`,  holeFrac: 0.712 },
  { id: 'flower',   label: 'SETTINGS.FRAME_FLOWER',   tier: 'basic', image: `${FRAME_IMG}/flower.png`, holeFrac: 0.537 },
  // ── Premium ──────────────────────────────────────────────────────────────
  { id: 'glow',      label: 'SETTINGS.FRAME_GLOW',      tier: 'premium', animated: true },
  { id: 'neon',      label: 'SETTINGS.FRAME_NEON',      tier: 'premium', animated: true },
  { id: 'sakura',    label: 'SETTINGS.FRAME_SAKURA',    tier: 'premium', image: `${FRAME_IMG}/sakura.png`,    holeFrac: 0.721 },
  { id: 'unicorn',   label: 'SETTINGS.FRAME_UNICORN',   tier: 'premium', image: `${FRAME_IMG}/unicorn.png`,   holeFrac: 0.459 },
  { id: 'crown',     label: 'SETTINGS.FRAME_CROWN',     tier: 'premium', image: `${FRAME_IMG}/crown.png`,     holeFrac: 0.482 },
  { id: 'starbow',   label: 'SETTINGS.FRAME_STARBOW',   tier: 'premium', image: `${FRAME_IMG}/starbow.png`,   holeFrac: 0.596 },
  { id: 'wizard',    label: 'SETTINGS.FRAME_WIZARD',    tier: 'premium', image: `${FRAME_IMG}/wizard.png`,    holeFrac: 0.395 },
  { id: 'butterfly', label: 'SETTINGS.FRAME_BUTTERFLY', tier: 'premium', image: `${FRAME_IMG}/butterfly.png`, holeFrac: 0.436 },
];

@Injectable({ providedIn: 'root' })
export class AvatarFrameService {
  readonly frames = AVATAR_FRAMES;

  private frameSubject = new BehaviorSubject<string>(DEFAULT_FRAME);
  frame$ = this.frameSubject.asObservable();

  constructor(private auth: AuthService) {
    // Reload frame của user hiện tại mỗi khi auth thay đổi (login / logout /
    // đổi tài khoản). auth$ là BehaviorSubject nên phát ngay state hiện tại
    // lúc subscribe → frame đúng được nạp ngay khi service khởi tạo.
    this.auth.auth$.subscribe(() => this.frameSubject.next(this.getSaved()));
  }

  get currentFrame(): string { return this.frameSubject.value; }

  meta(id: string): AvatarFrameMeta | undefined {
    return AVATAR_FRAMES.find(f => f.id === id);
  }

  /** Storage key gắn với user-id hiện tại; khách dùng key `:guest`. */
  private storageKey(): string {
    const id = this.auth.currentUser?.id;
    return id ? `${STORAGE_PREFIX}:${id}` : GUEST_KEY;
  }

  private getSaved(): string {
    const saved = localStorage.getItem(this.storageKey()) || '';
    return AVATAR_FRAMES.some(f => f.id === saved) ? saved : DEFAULT_FRAME;
  }

  setFrame(id: string): void {
    if (!AVATAR_FRAMES.some(f => f.id === id)) return;
    localStorage.setItem(this.storageKey(), id);
    this.frameSubject.next(id);
  }
}
