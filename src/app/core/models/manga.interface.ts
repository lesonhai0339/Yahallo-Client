import { LastestChapter } from "./chapter.interface";

export interface MangaSumaryDto
{
    id: string,
    name: string,
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
