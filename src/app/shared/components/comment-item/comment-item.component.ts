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
  /** Deep-link (mention): id comment cần nhảy tới. Nếu = comment.id thì highlight
   *  chính root này; nếu là 1 child thì load trang child chứa nó rồi highlight. */
  @Input() deepLinkCommentId?: string;

  /** Id đang được highlight (root hoặc reply) khi deep-link tới. */
  highlightId?: string;
  @Output() deleted = new EventEmitter<string>();
  @Output() quoteRequest = new EventEmitter<{ author: string; text: string }>();

  @ViewChild('replyEditor') replyEditorRef?: CommentEditorComponent;

  /** Số reply load mỗi lần (paginate qua filter-comment). */
  private static readonly REPLY_PAGE_SIZE = 10;

  currentUser: User | null = null;
  isReplying = false;
  isEditing = false;
  repliesLoading = false;   // load trang đầu (toggle)
  loadingMore = false;      // load "xem thêm" (giữ toggle ổn định)
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
    if (this.deepLinkCommentId && !this.isReply) this.handleDeepLink(this.deepLinkCommentId);
  }

  // ── Deep-link (mention) ─────────────────────────────────────────────────────

  /** Nhảy tới comment được mention: highlight root, hoặc load trang child chứa nó. */
  private handleDeepLink(targetId: string): void {
    if (targetId === this.comment.id) {
      this.flashHighlight(targetId);   // mention chính là root comment này
      return;
    }
    // Mention là 1 reply → load đúng trang child chứa nó (anchor API) rồi highlight.
    this.repliesLoading = true;
    this.commentService.loadChildPage({
      parentCommentId: this.comment.id,
      commentId: targetId,
      pageSize: CommentItemComponent.REPLY_PAGE_SIZE,
    }).subscribe({
      next: (res: any) => {
        const payload = res?.value ?? res;
        const raw: any[] = Array.isArray(payload)
          ? payload
          : (payload?.items ?? payload?.data ?? []);
        this.comment.replies = raw.map(r => this.mapApiReply(r));
        if (payload?.totalCount != null) this.comment.replyCount = payload.totalCount;
        this.comment.replyPage = payload?.pageNumber ?? 1;
        this.comment.replyPageCount = payload?.pageCount ?? this.comment.replyPage;
        this.comment.repliesLoaded = true;
        this.comment.showReplies = true;
        this.repliesLoading = false;
        this.rebuildThread();
        this.flashHighlight(targetId);
      },
      error: () => { this.repliesLoading = false; }
    });
  }

  /** Scroll tới phần tử + nháy highlight tạm thời (tự tắt sau vài giây). */
  private flashHighlight(id: string): void {
    this.highlightId = id;
    setTimeout(() => {
      document.getElementById('c-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
    setTimeout(() => { this.highlightId = undefined; }, 3500);
  }

  // ── Reactions ──────────────────────────────────────────────────────────────

  react(type: 'like' | 'dislike'): void {
    if (this.comment.pending) return;
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

  /** Trang đầu (hoặc mở lại lần đầu): thay toàn bộ danh sách reply. */
  loadReplies(): void {
    this.fetchReplies(1, false);
  }

  /** "Xem thêm N trả lời": load trang kế tiếp và nối vào cuối. */
  loadMoreReplies(): void {
    if (this.repliesLoading || this.loadingMore) return;
    this.fetchReplies((this.comment.replyPage ?? 0) + 1, true);
  }

  /**
   * Còn reply chưa load. Ưu tiên so trang (replyPage < pageCount) khi có pageCount
   * — chuẩn cả khi deep-link nhảy vào trang giữa; nếu API không trả pageCount thì
   * fallback so số lượng (đúng cho luồng tuần tự từ trang 1).
   */
  get hasMoreReplies(): boolean {
    const pageCount = this.comment.replyPageCount ?? 0;
    if (pageCount > 0) return (this.comment.replyPage ?? 0) < pageCount;
    return (this.comment.replies?.length ?? 0) < (this.comment.replyCount ?? 0);
  }

  /** Số reply sẽ hiện ở lần "xem thêm" kế tiếp (tối đa 1 trang). */
  get nextReplyBatch(): number {
    const remaining = (this.comment.replyCount ?? 0) - (this.comment.replies?.length ?? 0);
    return Math.max(0, Math.min(CommentItemComponent.REPLY_PAGE_SIZE, remaining));
  }

  private fetchReplies(page: number, append: boolean): void {
    if (append) this.loadingMore = true; else this.repliesLoading = true;
    this.commentService.getReplies(this.comment.id, page, CommentItemComponent.REPLY_PAGE_SIZE)
      .subscribe({
        next: (res: any) => {
          // API wraps the page in `value`: { value: { totalCount, data: [...] } }
          const payload = res?.value ?? res;
          const raw: any[] = Array.isArray(payload)
            ? payload
            : (payload?.items ?? payload?.data ?? []);
          const mapped = raw.map(r => this.mapApiReply(r));
          // Nối (loại trùng id — phòng reply optimistic đã có sẵn) hoặc thay mới.
          const base = append ? (this.comment.replies ?? []) : [];
          const seen = new Set(base.map(r => r.id));
          this.comment.replies = [...base, ...mapped.filter(r => r.id && !seen.has(r.id))];
          // totalCount từ server là nguồn chuẩn để biết còn nữa không.
          if (payload?.totalCount != null) this.comment.replyCount = payload.totalCount;
          if (payload?.pageCount != null) this.comment.replyPageCount = payload.pageCount;
          this.comment.replyPage = page;
          this.comment.repliesLoaded = true;
          this.comment.showReplies = true;
          this.repliesLoading = false;
          this.loadingMore = false;
          this.rebuildThread();
        },
        error: () => { this.repliesLoading = false; this.loadingMore = false; }
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
    if (this.comment.pending) return;
    if (!this.currentUser) { this.router.navigate(['/auth/login']); return; }
    this.isReplying = true;
    this.isEditing = false;
  }

  submitReply(text: string): void {
    if (!this.currentUser || !text.trim() || this.comment.pending) return;
    const prefixed = text.startsWith('@') ? text : `@${this.comment.displayName} ${text}`;
    // trả lời trực tiếp comment gốc: ParentId = root, ReplyCommentId = root
    const newReply = this.pushPendingReply(prefixed, this.comment.displayName, this.comment.id);
    this.isReplying = false;
    this.commentService.createReply(prefixed, this.chapterId ? 2 : 1, this.comment.id, this.mangaId, this.chapterId).subscribe({
      next: (newId: string) => this.confirmReply(newReply, newId),
      error: () => this.rollbackReply(newReply, 'Không thể gửi trả lời'),
    });
  }

  /** Dựng reply optimistic (pending) và chèn vào cây, trả về reference để confirm/rollback. */
  private pushPendingReply(data: string, namereply: string, replyToCommentId: string): ReplyData {
    const newReply: ReplyData = {
      id: '',
      idUser: this.currentUser!.id,
      name: this.currentUser!.name,
      avatar: this.currentUser!.avatar,
      data,
      date: new Date().toISOString(),
      namereply,
      replyToCommentId,
      likeCount: 0,
      dislikeCount: 0,
      isDeleted: false,
      isEdited: false,
      userReaction: null,
      pending: true,
    };
    if (!this.comment.replies) this.comment.replies = [];
    this.comment.replies.push(newReply);
    this.comment.repliesLoaded = true;
    this.comment.showReplies = true;
    this.comment.replyCount = (this.comment.replyCount ?? 0) + 1;
    this.rebuildThread();
    return newReply;
  }

  /** Server đã trả id → gán id thật + mở khoá tương tác; không có id thì gỡ. */
  private confirmReply(reply: ReplyData, newId: string): void {
    if (!newId) { this.rollbackReply(reply, 'Không thể gửi trả lời'); return; }
    reply.id = newId;
    reply.pending = false;
    this.toastr.success('Đã gửi trả lời');
  }

  /** Gỡ reply optimistic khi tạo thất bại / server không trả id. */
  private rollbackReply(reply: ReplyData, message: string): void {
    const list = this.comment.replies ?? [];
    const i = list.indexOf(reply);
    if (i > -1) {
      list.splice(i, 1);
      this.comment.replyCount = Math.max(0, (this.comment.replyCount ?? 1) - 1);
      this.rebuildThread();
    }
    this.toastr.error(message);
  }

  // ── Reply to a reply (Model A: ParentId vẫn là root, chỉ đổi CommentToUserId) ─

  startReplyToChild(reply: ReplyData): void {
    if (reply.pending) return;
    if (!this.currentUser) { this.router.navigate(['/auth/login']); return; }
    this.replyingToId = reply.id;
  }

  submitChildReply(reply: ReplyData, text: string): void {
    if (!this.currentUser || !text.trim() || reply.pending) return;
    const prefixed = text.startsWith('@') ? text : `@${reply.name} ${text}`;
    // ParentId = root (giữ thread phẳng); ReplyCommentId = đúng reply được trả lời; CommentToUserId = tác giả reply
    const newReply = this.pushPendingReply(prefixed, reply.name, reply.id);
    this.replyingToId = null;
    this.commentService.createReply(prefixed, this.chapterId ? 2 : 1, reply.id, this.mangaId, this.chapterId).subscribe({
      next: (newId: string) => this.confirmReply(newReply, newId),
      error: () => this.rollbackReply(newReply, 'Không thể gửi trả lời'),
    });
  }

  // ── Quote ─────────────────────────────────────────────────────────────────

  quoteComment(): void {
    if (!this.currentUser) { this.router.navigate(['/auth/login']); return; }
    this.quoteRequest.emit({ author: this.comment.displayName, text: this.comment.commentData });
  }

  // ── Edit ──────────────────────────────────────────────────────────────────

  startEdit(): void {
    if (this.comment.pending) return;
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

  confirmDelete(): void { if (this.comment.pending) return; this.showConfirmDelete = true; }
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
    if (reply.pending) return;
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
    if (reply.pending) return;
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
