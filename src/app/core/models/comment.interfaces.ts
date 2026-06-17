export type Reaction = 'like' | 'dislike' | null;

export interface CommentData {
  id: string;
  idUser: string;
  displayName: string;
  avatar: string;
  commentData: string;
  dateComment: string;
  chapterId?: string;
  chapterName?: string;
  likeCount: number;
  dislikeCount: number;
  isDeleted: boolean;
  isEdited: boolean;
  replyCount: number;

  // runtime UI state (not persisted)
  replies?: ReplyData[];
  repliesLoaded?: boolean;
  showReplies?: boolean;
  userReaction?: Reaction;
  pendingReaction?: Reaction;
}

export interface ReplyData {
  id: string;
  idUser: string;
  name: string;
  avatar: string;
  data: string;
  date: string;
  namereply: string;
  replyToUserId?: string;
  likeCount: number;
  dislikeCount: number;
  isDeleted: boolean;
  isEdited: boolean;
  userReaction?: Reaction;
}

export const DELETED_MARKER = '__DELETED__';
