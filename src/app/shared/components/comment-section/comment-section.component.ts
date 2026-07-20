import {
  Component, Input, OnInit, ViewChild
} from '@angular/core';
import { CommentService } from '../../../core/services/comment.service';
import { AuthService } from '../../../core/services/auth.service';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';
import { User } from '../../../core/models/interfaces';
import { CommentData, DELETED_MARKER } from '../../../core/models/comment.interfaces';
import { CommentEditorComponent } from '../comment-editor/comment-editor.component';
import { ToastrService } from 'ngx-toastr';
import { Router } from '@angular/router';

const DEFAULT_PAGE_SIZE = 10;

@Component({
  selector: 'app-comment-section',
  templateUrl: './comment-section.component.html',
  styleUrls: ['./comment-section.component.scss']
})
export class CommentSectionComponent implements OnInit {
  @Input() mangaId!: string;
  @Input() chapterId?: string;
  /** Deep-link (mention từ notification): comment + root của nó cần nhảy tới. */
  @Input() focusCommentId?: string;
  @Input() focusRootCommentId?: string;

  @ViewChild('topEditor') topEditorRef?: CommentEditorComponent;

  currentUser: User | null = null;
  comments: CommentData[] = [];
  loading = false;
  totalCount = 0;

  currentPage = 1;
  pageSize = DEFAULT_PAGE_SIZE;
  pageSizeOptions = [10, 20, 50];

  quotedAuthor = '';
  quotedText = '';

  get totalPages(): number {
    return Math.ceil(this.totalCount / this.pageSize);
  }

  get paginationPages(): number[] {
    const pages: number[] = [];
    const delta = 2;
    const from = Math.max(1, this.currentPage - delta);
    const to = Math.min(this.totalPages, this.currentPage + delta);
    for (let i = from; i <= to; i++) pages.push(i);
    return pages;
  }

  constructor(
    private commentService: CommentService,
    private auth: AuthService,
    private router: Router,
    private toastr: ToastrService,
    private prefs: UserPreferencesService
  ) {}

  ngOnInit(): void {
    this.currentUser = this.auth.currentUser;
    // Đã login → dùng page-size trong cấu hình user; chưa login → default.
    this.pageSize = this.currentUser ? this.prefs.current.defaultPageSize : DEFAULT_PAGE_SIZE;
    // Deep-link mention: nhảy thẳng tới trang chứa root comment (BE tự tính page).
    // Cần đăng nhập (UserId bắt buộc) và không ở ngữ cảnh đọc chương.
    if (this.focusRootCommentId && this.currentUser && !this.chapterId) {
      this.deepLinkLoad();
    } else {
      this.loadComments();
    }
  }

  // ── Deep-link (mention) ─────────────────────────────────────────────────────

  /** Load trang root chứa comment được mention; comment-item lo phần child + highlight. */
  private deepLinkLoad(): void {
    this.loading = true;
    this.commentService.loadRootPage({
      userId: this.currentUser!.id,
      mangaId: this.mangaId,
      rootCommentId: this.focusRootCommentId,
      commentId: this.focusCommentId,
      pageSize: this.pageSize,
    }).subscribe({
      next: (res: any) => {
        const payload = res?.value ?? res;
        const raw: any[] = Array.isArray(payload)
          ? payload
          : (payload?.items ?? payload?.data ?? []);
        this.comments = raw
          .map(c => this.mapApiComment(c))
          .sort((a, b) => new Date(b.dateComment).getTime() - new Date(a.dateComment).getTime());
        this.totalCount = payload?.totalCount ?? this.comments.length;
        this.currentPage = payload?.pageNumber ?? 1;
        this.loading = false;
      },
      // BE lỗi / không có comment → fallback về load thường trang 1.
      error: () => { this.loading = false; this.loadComments(); }
    });
  }

  // ── Load ──────────────────────────────────────────────────────────────────

  loadComments(page = 1): void {
    this.loading = true;
    const load$ = this.chapterId
      ? this.commentService.getChapterComments(this.mangaId, this.chapterId)
      : this.commentService.getAllMangaComments(this.mangaId, this.pageSize, page);

    load$.subscribe({
      next: (res: any) => {
        // API wraps the page in `value`: { value: { totalCount, data: [...] } }
        const payload = res?.value ?? res;
        const raw: any[] = Array.isArray(payload)
          ? payload
          : (payload?.items ?? payload?.data ?? []);
        // Root comment: mới nhất trước (gần nhất)
        this.comments = raw
          .map(c => this.mapApiComment(c))
          .sort((a, b) => new Date(b.dateComment).getTime() - new Date(a.dateComment).getTime());
        this.totalCount = payload?.totalCount ?? this.comments.length;
        this.currentPage = page;
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  /** Map a raw API comment to the CommentData shape used by the UI. */
  private mapApiComment(c: any): CommentData {
    // Tác giả comment là c.displayName/c.avatar/c.userId.
    // c.userCommentTo là người được @mention (chỉ dùng khi cần), KHÔNG phải tác giả.
    return {
      id: c.id,
      idUser: c.userId ?? '',
      displayName: c.displayName ?? '',
      avatar: c.avatar ?? '',
      commentData: c.message ?? c.commentData ?? '',
      dateComment: c.dateTime ?? c.dateComment ?? '',
      chapterId: c.chapterId,
      chapterName: c.chapterName,
      likeCount: c.like ?? c.likeCount ?? 0,
      dislikeCount: c.dislike ?? c.dislikeCount ?? 0,
      isDeleted: c.isDeleted ?? false,
      isEdited: c.isEdited ?? false,
      replyCount: c.replyCount ?? c.childCount ?? 0,
      repliesLoaded: false,
      showReplies: false,
      userReaction: null,
    };
  }

  // ── Post new comment ──────────────────────────────────────────────────────

  submitComment(text: string): void {
    if (!this.currentUser) { this.router.navigate(['/auth/login']); return; }
    if (!text.trim()) return;

    // Optimistic: hiện ngay comment ở trạng thái pending (mờ, khoá tương tác) với
    // id tạm. Chỉ khi server trả commentId thật mới gán id + mở khoá; lỗi thì gỡ.
    const newComment: CommentData = {
      id: '',
      idUser: this.currentUser!.id,
      displayName: this.currentUser!.name,
      avatar: this.currentUser!.avatar,
      commentData: text,
      dateComment: new Date().toISOString(),
      chapterId: this.chapterId,
      chapterName: undefined,
      likeCount: 0,
      dislikeCount: 0,
      isDeleted: false,
      isEdited: false,
      replyCount: 0,
      replies: [],
      repliesLoaded: true,
      showReplies: false,
      userReaction: null,
      pending: true,
    };
    this.comments.unshift(newComment);
    this.totalCount++;
    this.quotedAuthor = '';
    this.quotedText = '';

    const create$ = this.chapterId
      ? this.commentService.createChapterComment(this.mangaId, this.chapterId, text)
      : this.commentService.createComment(this.mangaId, text, 1);

    create$.subscribe({
      next: (newId: string) => {
        if (!newId) { this.rollbackComment(newComment); return; }
        // Gán id thật để reply ngay sau đó dùng làm ParentId/ReplyCommentId.
        newComment.id = newId;
        newComment.pending = false;
        this.toastr.success('Đã đăng bình luận');
      },
      error: () => {
        this.rollbackComment(newComment);
        this.toastr.error('Không thể đăng bình luận');
      }
    });
  }

  /** Gỡ comment optimistic khi tạo thất bại / server không trả id. */
  private rollbackComment(c: CommentData): void {
    const i = this.comments.indexOf(c);
    if (i > -1) {
      this.comments.splice(i, 1);
      this.totalCount = Math.max(0, this.totalCount - 1);
    }
  }

  // ── Quote ────────────────────────────────────────────────────────────────

  onQuoteRequest(event: { author: string; text: string }): void {
    this.quotedAuthor = event.author;
    this.quotedText = event.text;
    if (this.topEditorRef) {
      this.topEditorRef.prependQuote(event.author, event.text);
    }
    // scroll to editor
    const el = document.querySelector('.top-editor-wrap');
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  }

  // ── Pagination ────────────────────────────────────────────────────────────

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages || page === this.currentPage) return;
    this.loadComments(page);
  }

  setPageSize(size: number): void {
    if (size === this.pageSize) return;
    this.pageSize = size;
    this.currentPage = 1;
    this.loadComments(1);
  }
}
