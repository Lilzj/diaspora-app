// ─────────────────────────────────────────────────────────────────────────────
// Community Knowledge — Comment Types
// ─────────────────────────────────────────────────────────────────────────────

export type CommentContentType = 'Guide' | 'CommunityUpdate';

export type CommentStatus = 'Active' | 'Hidden' | 'Removed' | 'Reported';

export interface Comment {
  commentId: string;
  contentType: CommentContentType;
  contentId: string;
  authorId: string;
  authorName: string;
  authorReputationLevel: string;
  parentCommentId: string | null;
  body: string;
  mentions: string[];

  likeCount: number;
  isLikedByUser: boolean;
  isPinned: boolean;
  isEdited: boolean;

  status: CommentStatus;

  replies: Comment[];
  replyCount: number;

  createdAt: string;
  updatedAt: string | null;
}

export interface CommentCreateRequest {
  contentType: CommentContentType;
  contentId: string;
  parentCommentId?: string;
  body: string;
  mentions?: string[];
}

export interface CommentUpdateRequest {
  body: string;
}
