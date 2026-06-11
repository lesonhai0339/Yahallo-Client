export interface LastestChapter{
    id: string,
    title: string,
    index: number,
    createDate: string
}

/** Mirrors backend ChapterSortBy enum (filter-chapter) */
export enum ChapterSortBy {
    LastUpdate = 'LastUpdate',
    Index = 'Index',
    ViewCount = 'ViewCount',
    Rating = 'Rating',
    CommentCount = 'CommentCount',
}
export interface ChapterImage{
    id: string,
    index: number,
    cloudUrl: string
}