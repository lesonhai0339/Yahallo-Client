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

export interface TopMangaDto {
    id: string;
    name: string;
    mangaThumbnail: string;
    view: number;
}

export interface HomepageDto {
    lastUpdate: MangaSumaryDto[];
    popular: MangaSumaryDto[];
    tags: TagDto[];
    authors: { id: string; name: string; depscription: string; countries: number }[];
    artists: { id: string; name: string; depscription: string; countries: number }[];
    topMangaByDate: TopMangaDto[];
    topMangaByMonth: TopMangaDto[];
    topMangaByYear: TopMangaDto[];
}
