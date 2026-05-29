export interface User {
  id: string;
  avatar: string;
  name: string;
  email: string;
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
  UserName: string;
  Password: string;
  Avatar: File | null ;  
}

export interface MangaPagination{
  totalCount: number;
  pageSize: number;
  pageNumber: number;
  totalPages: number;
  data: Manga[];
}

export interface Manga {
  id: string;
  name: string;
  description: string;
  level: string;
  status: string;
  type: string;
  countries: string;
  season: number;
  thumbnail: string;
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
