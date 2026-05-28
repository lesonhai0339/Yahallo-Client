export interface User {
  id: string;
  avatar: string;
  name: string;
  email: string;
}

export interface AuthCookie {
  status: boolean;
  isLogout: boolean;
  token: string;
  user: string;
}

export interface LoginRequest {
  userName: string;
  password: string;
}

export interface RegisterRequest {
  firstName: string;
  lastName: string;
  email: string;
  userName: string;
  password: string;
  phoneNumber?: string;
}

export interface MangaPagination{
  totalCount: number;
  pageSize: number;
  pageNumber: number;
  totalPages: number;
  data: Manga[];
}

export interface Manga {
  mangaId: string;
  mangaName: string;
  mangaImage: string;
  mangaDetails: string;
  dateupdate: string;
  status: boolean;
  view: number;
  rating: number;
  listcategory: Category[];
  listauthor: Author[];
  listartist: Artist[];
  listChaper: Chapter[];
}

export interface MangaDetail extends Manga {
  averageRating: number;
  totalFollows: number;
  totalViews: number;
  totalChapters: number;
  tags: Tag[];
}

export interface Category {
  genreId: string;
  genresIdName: string;
}

export interface Author {
  name: string;
}

export interface Artist {
  name: string;
}

export interface Chapter {
  chapterId: string;
  chapterName: string;
  chapterTitle: string;
  chapterDate: string;
}

export interface Tag {
  id: string;
  name: string;
  description?: string;
}

export interface ReadingProgress {
  userId: string;
  mangaId: string;
  chapterId: string;
  lastPage: number;
  lastReadAt: string;
}

export interface Notification {
  id: string;
  type: string;
  message: string;
  targetImage: string;
  idTarget: string;
  target: string;
  date: string;
  isRead: boolean;
}

export interface Comment {
  id: string;
  idUser: string;
  name: string;
  avatar: string;
  commentData: string;
  dateComment: string;
  chapterId?: string;
  curChapter?: string;
}

export interface PagedResult<T> {
  data: T[];
  totalCount: number;
  pageNumber: number;
  pageSize: number;
  pageCount: number;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

// ── New API DTOs ────────────────────────────────────────────────────────────

export interface ArtistDto {
  id: string;
  name: string;
  countries?: string;
  lifeStatus?: string;
}

export interface AuthorDto {
  id: string;
  name: string;
  countries?: string;
  birth?: string;
  lifeStatus?: string;
}

export interface ChapterDto {
  id: string;
  title: string;
  index: number;
  mangaId: string;
  mangaName?: string;
  images?: string[];
  imageUrls?: string[];
  createdAt?: string;
}

export interface FollowMangaDto {
  id?: string;
  userId: string;
  userName?: string;
  mangaId: string;
  mangaName?: string;
  mangaThumbnail?: string;
  followedAt?: string;
}

export interface MangaDto {
  id: string;
  name: string;
  description?: string;
  level?: string;
  status?: string;
  type?: string;
  countries?: string;
  season?: number;
  thumbnail?: string;
  mangaSeasonId?: string;
  tags?: Tag[];
  authors?: ArtistDto[];
  artists?: ArtistDto[];
  chapters?: ChapterDto[];
  totalFollows?: number;
  totalViews?: number;
  averageRating?: number;
  dateUpdate?: string;
}

export interface UserDto {
  id: string;
  displayName: string;
  email: string;
  phoneNumber?: string;
  avatar?: string;
  roleCode?: number;
  roleName?: string;
  createdAt?: string;
}

export interface RoleDto {
  id: string;
  roleCode: number;
  roleName: string;
}

export interface CommentDto {
  id: string;
  userId: string;
  mangaId: string;
  chapterId?: string;
  parentId?: string;
  type?: string;
  message: string;
  likes?: number;
  dislikes?: number;
  childrenCount?: number;
  canComment?: boolean;
  canRemove?: boolean;
  canHide?: boolean;
  canLike?: boolean;
  canReply?: boolean;
  createdAt?: string;
  userName?: string;
  userAvatar?: string;
}

export interface TagDto {
  id: string;
  name: string;
  description?: string;
}

export interface MangaFilterParams {
  PageNumber?: number;
  PageSize?: number;
  Id?: string;
  Name?: string;
  Level?: string;
  Status?: string;
  Type?: string;
  Countries?: string;
  Season?: number;
  UserId?: string;
  DateUpdate?: string;
}

export interface ArtistFilterParams {
  PageNumber?: number;
  PageSize?: number;
  Id?: string;
  Name?: string;
  Countries?: string;
  LifeStatus?: string;
}

export interface AuthorFilterParams {
  PageNumber?: number;
  PageSize?: number;
  Id?: string;
  Name?: string;
  Countries?: string;
  Birth?: string;
  LifeStatus?: string;
}

export interface UserFilterParams {
  PageNumber?: number;
  PageSize?: number;
  Id?: string;
  Name?: string;
  Email?: string;
  Phone?: string;
}
