import { Component } from '@angular/core';
import { AvatarFrameService, AvatarFrameMeta } from '../../../core/services/avatar-frame.service';
import { AuthService } from '../../../core/services/auth.service';

/**
 * Profile sub-page: pick the decorative frame shown around the user's avatar.
 * A standalone feature (separate from theme/background) reachable from the
 * profile sidebar. Future avatar-frame templates plug in via AvatarFrameService.
 */
@Component({
  selector: 'app-avatar-frames',
  templateUrl: './avatar-frames.component.html',
  styleUrls: ['./avatar-frames.component.scss'],
})
export class AvatarFramesComponent {
  currentFrame = this.frameService.currentFrame;

  readonly basicFrames: AvatarFrameMeta[] =
    this.frameService.frames.filter(f => f.tier === 'basic');
  readonly premiumFrames: AvatarFrameMeta[] =
    this.frameService.frames.filter(f => f.tier === 'premium');

  constructor(private frameService: AvatarFrameService, private auth: AuthService) {}

  get avatarUrl(): string {
    return this.auth.currentUser?.avatar || '/assets/user.jpg';
  }

  select(id: string): void {
    this.currentFrame = id;
    this.frameService.setFrame(id);
  }
}
