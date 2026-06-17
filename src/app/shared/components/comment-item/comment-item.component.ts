import {
  Component, Input, Output, EventEmitter,
  OnInit, ViewChild
} from '@angular/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { CommentData, ReplyData, DELETED_MARKER } from '../../../core/models/comment.interfaces';
import { CommentService } from '../../../core/services/comment.service';
import { AuthService } from '../../../core/services/auth.service';
import { User } from '../../../core/models/interfaces';
import { CommentEditorComponent } from '../comment-editor/comment-editor.component';

@Component({
  selector: 'app-comment-item',
  templateUrl: './comment-item.component.html',
  styleUrls: ['./comment-item.component.scss']
})
export class CommentItemComponent implements OnInit {
  @Input() comment!: CommentData;
  @Input() isReply = false;
  @Input() showChapterLabel = false;
  @Input() mangaId = '';
  @Input() chapterId? = '';
  @Output() deleted = new EventEmitter<string>();
  @Output() quoteRequest = new EventEmitter<{ author: string; text: string }>();

  @ViewChild('replyEditor') replyEditorRef?: CommentEditorComponent;

  currentUser: User | null = null;
  isReplying = false;
  isEditing = false;
  repliesLoading = false;
  showConfirmDelete = false;

  get isOwner(): boolean {
    return !!this.currentUser && this.currentUser.id === this.comment.idUser;
  }

  get isDeleted(): boolean {
    return this.comment.isDeleted || this.comment.commentData === DELETED_MARKER;
  }

  constructor(
    private commentService: CommentService,
    private auth: AuthService,
    private router: Router,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    this.currentUser = this.auth.currentUser;
  }

  // ── Reactions ──────────────────────────────────────────────────────────────

  react(type: 'like' | 'dislike'): void {
    if (!this.currentUser) { this.router.navigate(['/auth/login']); return; }
    const current = this.comment.userReaction;
    if (current === type) {
      // undo
      (type === 'like' ? this.commentService.unlikeComment(this.comment.id) : this.commentService.undislikeComment(this.comment.id))
        .subscribe();
      this.comment.userReaction = null;
      type === 'like' ? this.comment.likeCount-- : this.comment.dislikeCount--;
    } else {
      // switch or new
      if (current === 'like') { this.comment.likeCount--; this.commentService.unlikeComment(this.comment.id).subscribe(); }
      if (current === 'dislike') { this.comment.dislikeCount--; this.commentService.undislikeComment(this.comment.id).subscribe(); }
      (type === 'like' ? this.commentService.likeComment(this.comment.id) : this.commentService.dislikeComment(this.comment.id))
        .subscribe();
      this.comment.userReaction = type;
      type === 'like' ? this.comment.likeCount++ : this.comment.dislikeCount++;
    }
  }

  // ── Replies ────────────────────────────────────────────────────────────────

  toggleReplies(): void {
    if (!this.comment.repliesLoaded) {
      this.loadReplies();
    } else {
      this.comment.showReplies = !this.comment.showReplies;
    }
  }

  loadReplies(): void {
    this.repliesLoading = true;
    this.commentService.getReplies(this.comment.id).subscribe((res: any) => {
      // API wraps the page in `value`: { value: { data: [...] } }
      const payload = res?.value ?? res;
      const raw: any[] = Array.isArray(payload)
        ? payload
        : (payload?.items ?? payload?.data ?? []);
      this.comment.replies = raw.map(r => this.mapApiReply(r));
      this.comment.repliesLoaded = true;
      this.comment.showReplies = true;
      this.repliesLoading = false;
    });
  }

  /** Map a raw API reply to the ReplyData shape used by the UI. */
  private mapApiReply(r: any): ReplyData {
    const author = r.userCommentTo ?? {};
    return {
      id: r.id,
      idUser: r.userId ?? author.id ?? '',
      name: author.displayName ?? r.name ?? '',
      avatar: author.avatar ?? r.avatar ?? '',
      data: r.message ?? r.data ?? '',
      date: r.dateTime ?? r.date ?? '',
      namereply: r.namereply ?? this.comment.displayName ?? '',
      replyToUserId: r.commentToUserId ?? r.replyToUserId,
      likeCount: r.like ?? r.likeCount ?? 0,
      dislikeCount: r.dislike ?? r.dislikeCount ?? 0,
      isDeleted: r.isDeleted ?? false,
      isEdited: r.isEdited ?? false,
      userReaction: null,
    };
  }

  // ── Reply submit ───────────────────────────────────────────────────────────

  startReply(): void {
    if (!this.currentUser) { this.router.navigate(['/auth/login']); return; }
    this.isReplying = true;
    this.isEditing = false;
  }

  submitReply(commentToUserId: string, text: string): void {
    if (!this.currentUser || !text.trim()) return;
    const prefixed = text.startsWith('@') ? text : `@${this.comment.displayName} ${text}`;
    this.commentService.createReply(this.comment.id, this.currentUser.id, prefixed, 1, commentToUserId, this.mangaId).subscribe({
      next: (res: any) => {
        const newReply: ReplyData = {
          id: res?.id ?? String(Date.now()),
          idUser: this.currentUser!.id,
          name: this.currentUser!.name,
          avatar: this.currentUser!.avatar,
          data: prefixed,
          date: new Date().toISOString(),
          namereply: this.comment.displayName,
          likeCount: 0,
          dislikeCount: 0,
          isDeleted: false,
          isEdited: false,
          userReaction: null,
        };
        if (!this.comment.replies) this.comment.replies = [];
        this.comment.replies.push(newReply);
        this.comment.repliesLoaded = true;
        this.comment.showReplies = true;
        this.comment.replyCount = (this.comment.replyCount ?? 0) + 1;
        this.isReplying = false;
        this.toastr.success('Đã gửi trả lời');
      },
      error: () => this.toastr.error('Không thể gửi trả lời')
    });
  }

  // ── Quote ─────────────────────────────────────────────────────────────────

  quoteComment(): void {
    if (!this.currentUser) { this.router.navigate(['/auth/login']); return; }
    this.quoteRequest.emit({ author: this.comment.displayName, text: this.comment.commentData });
  }

  // ── Edit ──────────────────────────────────────────────────────────────────

  startEdit(): void {
    this.isEditing = true;
    this.isReplying = false;
  }

  submitEdit(text: string): void {
    this.commentService.editComment(this.comment.id, text).subscribe({
      next: () => {
        this.comment.commentData = text;
        this.comment.isEdited = true;
        this.isEditing = false;
        this.toastr.success('Đã cập nhật bình luận');
      },
      error: () => this.toastr.error('Không thể chỉnh sửa')
    });
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  confirmDelete(): void { this.showConfirmDelete = true; }
  cancelDelete(): void { this.showConfirmDelete = false; }

  executeDelete(): void {
    this.commentService.deleteComment(this.comment.id).subscribe({
      next: () => {
        this.comment.isDeleted = true;
        this.comment.commentData = DELETED_MARKER;
        this.showConfirmDelete = false;
        this.toastr.info('Đã xóa bình luận');
      },
      error: () => this.toastr.error('Không thể xóa bình luận')
    });
  }

  // ── Reply reactions ────────────────────────────────────────────────────────

  reactToReply(reply: ReplyData, type: 'like' | 'dislike'): void {
    if (!this.currentUser) { this.router.navigate(['/auth/login']); return; }
    const current = reply.userReaction;
    if (current === type) {
      (type === 'like' ? this.commentService.unlikeComment(reply.id) : this.commentService.undislikeComment(reply.id)).subscribe();
      reply.userReaction = null;
      type === 'like' ? reply.likeCount-- : reply.dislikeCount--;
    } else {
      if (current === 'like') { reply.likeCount--; this.commentService.unlikeComment(reply.id).subscribe(); }
      if (current === 'dislike') { reply.dislikeCount--; this.commentService.undislikeComment(reply.id).subscribe(); }
      (type === 'like' ? this.commentService.likeComment(reply.id) : this.commentService.dislikeComment(reply.id)).subscribe();
      reply.userReaction = type;
      type === 'like' ? reply.likeCount++ : reply.dislikeCount++;
    }
  }

  deleteReply(reply: ReplyData): void {
    this.commentService.deleteReply(reply.id).subscribe(() => {
      reply.isDeleted = true;
      reply.data = DELETED_MARKER;
    });
  }

  formatRelativeTime(dateStr: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Vừa xong';
    if (mins < 60) return `${mins} phút trước`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} giờ trước`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days} ngày trước`;
    return d.toLocaleDateString('vi-VN');
  }
}
