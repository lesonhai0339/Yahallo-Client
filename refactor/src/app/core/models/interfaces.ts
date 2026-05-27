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
  username: string;
  password: string;
}

export interface RegisterRequest {
  UserName: string;
  Password: string;
  Email: string;
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
