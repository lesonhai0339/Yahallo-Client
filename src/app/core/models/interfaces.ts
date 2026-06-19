import { LastestChapter } from "./chapter.interface";

export interface User {
  id: string;
  avatar: string;
  name: string;
  email: string;
}

export interface UserRolePagination{
  pageCount: number;
  pageNumber: number;
  pageSize: number;
  totalCount: number;
  data: UserRole[];
}
export interface UserRole{
  roleId: string;
  roleName: string;
  userId: string;
  userName: string;
}


export interface AuthCookie {
  status: boolean;
  isLogout: boolean;
  accessToken: string;
  refreshToken:string;
  user: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  FirstName: string;
  LastName: string;
  Email: string;
  PhoneNumber: string;
  CountryId: string;
  UserName: string;
  Password: string;
  Avatar: File | null ;
  Background: File | null ;
}

/**
 * Response của POST /create. Server không upload file lên S3 nữa mà trả về
 * pre-signed PUT URL để client tự upload trực tiếp lên S3.
 * (camelCase do System.Text.Json default policy.)
 */
export interface CreateUserResponseDto {
  message: string;
  avatarUrl: string | null;
  backgroundUrl: string | null;
  /**
   * Chỉ dùng ở client: true khi tài khoản đã tạo thành công nhưng upload
   * ảnh lên S3 thất bại (lỗi không nghiêm trọng — user có thể cập nhật sau).
   */
  uploadFailed?: boolean;
}

export interface MangaPagination{
  totalCount: number;
  pageSize: number;
  pageNumber: number;
  totalPages: number;
  data: Manga[];
}
export interface UserRating{
  id: string;
  rating: number;
}

export interface Manga {
  id: string;
  displayName: string;
  description: string;
  level: string;
  status: string;
  type: string;
  countries: string;
  season: number;
  mangaThumbnail: string;
  mangaBackground: string;
  userId: string;
  averageRating: number;
  totalFollows: number;
  totalViews: number;
  totalChapters: number;
  tags: Tag[];
  authors: Author[];
  artists: Artist[];
  chapters: Chapter[];
  comments: any[];
  updateDate: string; 
  lastestChapter: LastestChapter
}
export interface Author {
  id: string;
  name: string;
  countries: number;
  depscription: string | null;
  birth: string;
  lifeStatus: number;
}
export interface Artist {
  id: string;
  name: string;
  countries: number;
  depscription: string | null;
  birth: string;
  lifeStatus: number;
}

export interface Chapter {
  id: string;
  title: string;
  index: number;
  mangaId: string;
  chapterDate: string;
}

export interface MangaDetail extends Manga {
  averageRating: number;
  totalFollows: number;
  totalViews: number;
  totalChapters: number;
  tags: Tag[];
}

/**
 * Static part of a manga's detail (getDetailAggregated).
 * Dynamic counters (views/rating/follows/chapters) are NOT here — fetch them
 * separately via MangaService.getMangaStats() and getChapters().
 */
export interface MangaDetailDto {
  id: string;
  name: string;
  description: string;
  level: string;
  status: string;
  type: string;
  countries: string;
  season: number;
  mangaThumbnail: string;
  mangaBackground: string;
  userId: string;
  tags: Tag[];
  authors: Author[];
  artists: Artist[];
}

/** Dynamic stats for a manga, loaded on demand (separate from detail). */
export interface MangaStatsDto {
  totalViews: number;
  averageRating: number;
  totalFollows: number;
  totalChapters: number;
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
  items: T[];
  totalCount: number;
  pageNumber: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}
