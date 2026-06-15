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

const DEFAULT_PAGE_SIZE = 10;

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
      : this.commentService.getAllMangaComments(this.mangaId, this.pageSize, page);

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
      : this.commentService.createComment(uid, this.mangaId, text, 1);

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
