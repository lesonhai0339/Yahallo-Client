import { LastestChapter } from "./chapter.interface";

export interface NewestManga
{
    Id: string,
    Name: string,
    Thumbnail: string,
    Description: string,
    Status: string,
    Countries: string,
    Season: number,
    Type: string,
    LastestChapter: LastestChapter
}
