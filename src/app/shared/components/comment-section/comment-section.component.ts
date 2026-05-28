import {
  Component, Input, OnInit, ViewChild
} from '@angular/core';
import { CommentService } from '../../../core/services/comment.service';
import { AuthService } from '../../../core/services/auth.service';
import { User } from '../../../core/models/interfaces';
import { CommentData, DELETED_MARKER } from '../../../core/models/comment.interfaces';
import { CommentEditorComponent } from '../comment-editor/comment-editor.component';
import { ToastrService } from 'ngx-toastr';
import { Router } from '@angular/router';

const PAGE_SIZE = 20;
const MAX_INITIAL = 50;

@Component({
  selector: 'app-comment-section',
  templateUrl: './comment-section.component.html',
  styleUrls: ['./comment-section.component.scss']
})
export class CommentSectionComponent implements OnInit {
  @Input() mangaId!: string;
  @Input() chapterId?: string;

  @ViewChild('topEditor') topEditorRef?: CommentEditorComponent;

  currentUser: User | null = null;
  comments: CommentData[] = [];
  loading = false;
  totalCount = 0;

  // Pagination (used when totalCount > MAX_INITIAL)
  currentPage = 1;
  pageSize = PAGE_SIZE;
  usePagination = false;

  // Show-more (first load up to MAX_INITIAL)
  shownCount = PAGE_SIZE;

  // Quote pre-fill for top editor
  quotedAuthor = '';
  quotedText = '';

  get displayedComments(): CommentData[] {
    return this.usePagination ? this.comments : this.comments.slice(0, this.shownCount);
  }

  get canShowMore(): boolean {
    return !this.usePagination && this.shownCount < this.comments.length && this.comments.length <= MAX_INITIAL;
  }

  get totalPages(): number {
    return Math.ceil(this.totalCount / this.pageSize);
  }

  constructor(
    private commentService: CommentService,
    private auth: AuthService,
    private router: Router,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    this.currentUser = this.auth.currentUser;
    this.loadComments();
  }

  // ── Load ──────────────────────────────────────────────────────────────────

  loadComments(page = 1): void {
    this.loading = true;
    const load$ = this.chapterId
      ? this.commentService.getChapterComments(this.mangaId, this.chapterId)
      : this.commentService.getAllMangaComments(this.mangaId, MAX_INITIAL, page);

    load$.subscribe({
      next: (res: any) => {
        const raw: CommentData[] = Array.isArray(res) ? res : (res?.items ?? res?.data ?? []);
        this.comments = raw.map(c => ({
          ...c,
          likeCount: c.likeCount ?? 0,
          dislikeCount: c.dislikeCount ?? 0,
          isDeleted: c.isDeleted ?? false,
          isEdited: c.isEdited ?? false,
          replyCount: c.replyCount ?? 0,
          repliesLoaded: false,
          showReplies: false,
        }));
        this.totalCount = res?.totalCount ?? this.comments.length;
        this.currentPage = page;
        this.usePagination = this.totalCount > MAX_INITIAL;
        this.shownCount = PAGE_SIZE;
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  // ── Post new comment ──────────────────────────────────────────────────────

  submitComment(text: string): void {
    if (!this.currentUser) { this.router.navigate(['/auth/login']); return; }
    if (!text.trim()) return;

    const uid = this.currentUser!.id;
    const create$ = this.chapterId
      ? this.commentService.createChapterComment(uid, this.mangaId, this.chapterId, text)
      : this.commentService.createComment(uid, this.mangaId, text);

    create$.subscribe({
      next: (res: any) => {
        const newComment: CommentData = {
          id: res?.id ?? String(Date.now()),
          idUser: this.currentUser!.id,
          name: this.currentUser!.name,
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
        };
        this.comments.unshift(newComment);
        this.totalCount++;
        this.quotedAuthor = '';
        this.quotedText = '';
        this.toastr.success('Đã đăng bình luận');
      },
      error: () => this.toastr.error('Không thể đăng bình luận')
    });
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
    if (page < 1 || page > this.totalPages) return;
    this.loadComments(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  showMore(): void {
    this.shownCount = Math.min(this.shownCount + PAGE_SIZE, MAX_INITIAL);
  }
}
