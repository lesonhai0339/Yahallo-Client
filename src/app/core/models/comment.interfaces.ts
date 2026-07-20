export type Reaction = 'like' | 'dislike' | null;

export interface CommentData {
  id: string;
  idUser: string;
  displayName: string;
  avatar: string;
  /** Author's selected avatar frame id (optional; backend may not send it). */
  avatarFrame?: string;
  /** Author role names (Admin | Mod | Trans | User), highest first. */
  roles?: string[];
  /** Author level 1–9. */
  level?: number;
  commentData: string;
  dateComment: string;
  chapterId?: string;
  chapterName?: string;
  likeCount: number;
  dislikeCount: number;
  isDeleted: boolean;
  isEdited: boolean;
  replyCount: number;
  replyToCommentId?: string;

  // runtime UI state (not persisted)
  replies?: ReplyData[];
  repliesLoaded?: boolean;
  showReplies?: boolean;
  /** Trang reply đã load gần nhất (paginate qua filter-comment, 0 = chưa load). */
  replyPage?: number;
  /** Tổng số trang reply (từ PagedResult.pageCount) — dùng để biết còn trang sau. */
  replyPageCount?: number;
  userReaction?: Reaction;
  pendingReaction?: Reaction;
  /** True khi đang chờ server trả id — UI hiển thị mờ và khoá tương tác. */
  pending?: boolean;
}

export interface ReplyData {
  id: string;
  idUser: string;
  name: string;
  avatar: string;
  /** Author's selected avatar frame id (optional; backend may not send it). */
  avatarFrame?: string;
  /** Author role names (Admin | Mod | Trans | User), highest first. */
  roles?: string[];
  /** Author level 1–9. */
  level?: number;
  data: string;
  date: string;
  namereply: string;
  replyToUserId?: string;
  replyToCommentId?: string;
  likeCount: number;
  dislikeCount: number;
  isDeleted: boolean;
  isEdited: boolean;
  userReaction?: Reaction;
  /** True khi đang chờ server trả id — UI hiển thị mờ và khoá tương tác. */
  pending?: boolean;
}

/** Reply top-level kèm các reply con (lồng tối đa 1 cấp theo replyToCommentId). */
export interface ThreadedReply {
  reply: ReplyData;
  children: ReplyData[];
}

export const DELETED_MARKER = '__DELETED__';
