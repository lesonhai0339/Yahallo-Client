import { LastestChapter } from "./chapter.interface";

export interface MangaSumaryDto
{
    id: string,
    name: string,
    /** Alias của `name` cho <app-manga-sumary-card> (grid) dùng chung toàn app. */
    displayName?: string,
    mangaThumbnail: string,
    mangaBackground: string,
    totalViews: number,
    averageRating: number,
    tags: TagDto[],
    lastChapterId: string,
    lastChapterIndex: string,
    lastChapterUpdate: string
}
export interface TagDto{
    id: string,
    name: string,
    description: string,
}

/** Mirrors backend MangaSortBy enum (filter-manga) */
export enum MangaSortBy {
    CreateDate = 'CreateDate',
    LastUpdate = 'LastUpdate',
    /** Backend viết là `Deletedate` (chữ d thường) — gửi sai tên là bind hỏng. */
    DeleteDate = 'Deletedate',
    ViewCount = 'ViewCount',
    Rating = 'Rating',
    CommentCount = 'CommentCount',
    ChapterCount = 'ChapterCount',
}

/** Mirrors backend RatingEnum (rating target type) */
export enum RatingTarget {
    Manga = 0,
    Chapter = 1,
    User = 2,
}

export interface TopMangaDto {
    id: string;
    displayName: string;
    mangaThumbnail: string;
    view: number;
}

export interface HomepageDto {
    /** 6 truyện mới thêm gần đây — server trả sẵn, không phải gọi API riêng. */
    newManga: MangaSumaryDto[];
    lastUpdate: MangaSumaryDto[];
    popular: MangaSumaryDto[];
    tags: TagDto[];
    authors: { id: string; name: string; depscription: string; countries: number }[];
    artists: { id: string; name: string; depscription: string; countries: number }[];
    topMangaByDate: TopMangaDto[];
    topMangaByMonth: TopMangaDto[];
    topMangaByYear: TopMangaDto[];
}
