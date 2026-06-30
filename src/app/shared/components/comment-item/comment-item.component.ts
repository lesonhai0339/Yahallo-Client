import {
  Component, Input, Output, EventEmitter,
  OnInit, ViewChild
} from '@angular/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { CommentData, ReplyData, ThreadedReply, DELETED_MARKER } from '../../../core/models/comment.interfaces';
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
  replyingToId: string | null = null;   // id của reply đang được trả lời (Model A: phẳng)
  threadedReplies: ThreadedReply[] = []; // replies gom theo replyToCommentId (lồng 1 cấp)

  get isOwner(): boolean {
    return !!this.currentUser && this.currentUser.id === this.comment.idUser;
  }

  get isDeleted(): boolean {
    return this.comment.isDeleted || this.comment.commentData === DELETED_MARKER;
  }

  // ── Author role / level badges ───────────────────────────────────────────────
  /** Roles ranked high → low; the highest one the author has is shown. */
  private readonly roleRank = ['Admin', 'Mod', 'Trans', 'User'];

  topRole(roles?: string[]): string | null {
    if (!roles?.length) return null;
    return this.roleRank.find(r => roles.includes(r)) ?? roles[0];
  }

  /** Roles for an author — fall back to the logged-in user's own roles. */
  authorRoles(item: { idUser: string; roles?: string[] }): string[] | undefined {
    if (item.roles?.length) return item.roles;
    if (this.currentUser && item.idUser === this.currentUser.id) return this.currentUser.roles;
    return undefined;
  }

  /** Level for an author — fall back to the logged-in user's own level. */
  authorLevel(item: { idUser: string; level?: number }): number | undefined {
    if (item.level != null) return item.level;
    if (this.currentUser && item.idUser === this.currentUser.id) return this.currentUser.level ?? undefined;
    return undefined;
  }

  roleClass(role: string | null): string {
    return role ? 'role-badge--' + role.toLowerCase() : '';
  }

  /** Bucket a 1–9 level into a colour tier. */
  levelClass(level?: number): string {
    if (!level) return '';
    if (level >= 9) return 'level-badge--max';
    if (level >= 7) return 'level-badge--high';
    if (level >= 4) return 'level-badge--mid';
    return 'level-badge--low';
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
      this.rebuildThread();
    });
  }

  /**
   * Gom replies (phẳng dưới root) thành cây 1 cấp theo replyToCommentId.
   * Reply trả lời thẳng root → top-level. Reply trả lời một reply khác →
   * con của reply đó. Reply lồng sâu hơn được gom về top-level gần nhất (cap 1 cấp).
   */
  private rebuildThread(): void {
    const replies = this.comment.replies ?? [];
    const rootId = this.comment.id;
    const byId = new Map(replies.map(r => [r.id, r]));

    const isTop = (r: ReplyData): boolean =>
      !r.replyToCommentId || r.replyToCommentId === rootId || !byId.has(r.replyToCommentId);

    const topAncestor = (r: ReplyData): ReplyData => {
      let cur = r;
      const seen = new Set<string>();
      while (!isTop(cur) && !seen.has(cur.id)) {
        seen.add(cur.id);
        cur = byId.get(cur.replyToCommentId!)!;
      }
      return cur;
    };

    const nodes: ThreadedReply[] = [];
    const index = new Map<string, ThreadedReply>();

    for (const r of replies) {
      if (isTop(r)) {
        const node: ThreadedReply = { reply: r, children: [] };
        nodes.push(node);
        index.set(r.id, node);
      }
    }
    for (const r of replies) {
      if (!isTop(r)) {
        const node = index.get(topAncestor(r).id);
        if (node) node.children.push(r);
        else nodes.push({ reply: r, children: [] }); // fallback an toàn
      }
    }

    // Reply: cũ nhất trước (xa nhất) — đọc theo thứ tự hội thoại; áp cho cả top-level lẫn con
    const byDateAsc = (a: ReplyData, b: ReplyData) =>
      this.parseUtc(a.date).getTime() - this.parseUtc(b.date).getTime();
    nodes.sort((x, y) => byDateAsc(x.reply, y.reply));
    nodes.forEach(n => n.children.sort(byDateAsc));

    this.threadedReplies = nodes;
  }

  /** Map a raw API reply to the ReplyData shape used by the UI. */
  private mapApiReply(r: any): ReplyData {
    // userCommentTo = người ĐƯỢC trả lời (mention), KHÔNG phải tác giả reply.
    const commentTo = r.userCommentTo ?? {};
    return {
      id: r.id,
      idUser: r.userId ?? '',
      name: r.displayName ?? r.name ?? '',          // tác giả reply
      avatar: r.avatar ?? '',                        // avatar tác giả reply
      data: r.message ?? r.data ?? '',
      date: r.dateTime ?? r.date ?? '',
      namereply: commentTo.displayName ?? '',        // tên người được @mention
      replyToUserId: commentTo.id ?? r.commentToUserId ?? r.replyToUserId,
      replyToCommentId: r.replyToCommentId,
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

  submitReply(text: string): void {
    if (!this.currentUser || !text.trim()) return;
    const prefixed = text.startsWith('@') ? text : `@${this.comment.displayName} ${text}`;
    // trả lời trực tiếp comment gốc: ParentId = root, ReplyCommentId = root
    this.commentService.createReply(this.comment.id, this.currentUser.id, prefixed, 1, this.comment.idUser, this.comment.id, this.mangaId).subscribe({
      next: (res: any) => {
        // id thật ở res.value.id (JsonResponse<ResponseResult<string>>).
        const newReply: ReplyData = {
          id: res?.value?.id ?? res?.id ?? String(Date.now()),
          idUser: this.currentUser!.id,
          name: this.currentUser!.name,
          avatar: this.currentUser!.avatar,
          data: prefixed,
          date: new Date().toISOString(),
          namereply: this.comment.displayName,
          replyToCommentId: this.comment.id,
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
        this.rebuildThread();
        this.toastr.success('Đã gửi trả lời');
      },
      error: () => this.toastr.error('Không thể gửi trả lời')
    });
  }

  // ── Reply to a reply (Model A: ParentId vẫn là root, chỉ đổi CommentToUserId) ─

  startReplyToChild(reply: ReplyData): void {
    if (!this.currentUser) { this.router.navigate(['/auth/login']); return; }
    this.replyingToId = reply.id;
  }

  submitChildReply(reply: ReplyData, text: string): void {
    if (!this.currentUser || !text.trim()) return;
    const prefixed = text.startsWith('@') ? text : `@${reply.name} ${text}`;
    // ParentId = root (giữ thread phẳng); ReplyCommentId = đúng reply được trả lời; CommentToUserId = tác giả reply
    this.commentService.createReply(this.comment.id, this.currentUser.id, prefixed, 1, reply.idUser, reply.id, this.mangaId).subscribe({
      next: (res: any) => {
        // id thật ở res.value.id (JsonResponse<ResponseResult<string>>).
        const newReply: ReplyData = {
          id: res?.value?.id ?? res?.id ?? String(Date.now()),
          idUser: this.currentUser!.id,
          name: this.currentUser!.name,
          avatar: this.currentUser!.avatar,
          data: prefixed,
          date: new Date().toISOString(),
          namereply: reply.name,
          replyToCommentId: reply.id,
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
        this.replyingToId = null;
        this.rebuildThread();
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
    const d = this.parseUtc(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Vừa xong';            // diff âm do lệch giờ nhỏ cũng rơi vào đây
    if (mins < 60) return `${mins} phút trước`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} giờ trước`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days} ngày trước`;
    return d.toLocaleDateString('vi-VN');
  }

  /**
   * Backend lưu DateTime.UtcNow nhưng chuỗi JSON thiếu 'Z' (EF trả Kind=Unspecified).
   * Tự thêm 'Z' để Date hiểu là UTC, sau đó Date tự quy đổi sang giờ khu vực của máy.
   */
  private parseUtc(dateStr: string): Date {
    const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(dateStr);
    return new Date(hasTz ? dateStr : dateStr + 'Z');
  }

  /** Thời gian đầy đủ theo giờ khu vực — dùng cho tooltip. */
  formatLocal(dateStr: string): string {
    if (!dateStr) return '';
    return this.parseUtc(dateStr).toLocaleString('vi-VN');
  }
}
