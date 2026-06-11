import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { Chapter, Manga, MangaPagination, PagedResult } from '../models/interfaces';
import { ChapterImage } from '../models/chapter.interface';
import { HomepageDto, MangaSumaryDto } from '../models/manga.interface';

@Injectable({ providedIn: 'root' })
export class MangaService {
  private readonly base = environment.mangaApi;
  private readonly chapterBase = environment.chapterApi;
  private readonly tagBase = environment.tagApi;

  constructor(private http: HttpClient) {}

  getHomepage(): Observable<HomepageDto> {
    return this.http.get<any>(`${this.base}/homepage`).pipe(
      map((res: any) => res?.value ?? res)
    );
  }

  getPaginated(page: number, pageSize = 20): Observable<any> {
    const params = new HttpParams()
      .set('PageNumber', page)
      .set('PageSize', pageSize);
    return this.http.get(`${this.base}/get-all-pagination`, { params });
  }
  getNewestUpdatePaginated(page: number, pageSize = 20): Observable<any> {
    const params = new HttpParams()
      .set('PageNumber', page)
      .set('PageSize', pageSize);
    return this.http.get(`${this.base}/lastest-updated`, { params });
  }


  /** @deprecated Use getPaginated() instead */
  getAll(page: number): Observable<any[]> {
    return this.getPaginated(page, 20).pipe(
      map((res: any) => {
        const tags: MangaPagination = res?.value ?? null;
        return tags?.data?.map((t: any) => (
          { 
            id: t.id, 
            name: t.name, 
            mangaThumbnail: t.mangaThumbnail, 
            mangaBackground: t.mangaBackground,
            status: t.status, 
            countries: t.countries,
            description: t.description,
            type: t.type
          })) ?? [];
      })
    );
  }

 getNewestManga(page: number, pageSize = 20): Observable<MangaSumaryDto[]> {
    return this.getNewestUpdatePaginated(page, pageSize).pipe(
      map((res: any) => (res?.value?.data as MangaSumaryDto[]) ?? [])
    );
  }

  getNewestMangaPaginated(page: number, pageSize = 20): Observable<{ data: MangaSumaryDto[]; totalPages: number; totalCount: number }> {
    return this.getNewestUpdatePaginated(page, pageSize).pipe(
      map((res: any) => {
        const raw = res?.value ?? res;
        const data = (raw?.data ?? []).map((t: any) => ({
          id: t.id,
          name: t.name,
          mangaThumbnail: t.mangaThumbnail,
          mangaBackground: t.mangaBackground,
          totalViews: t.totalViews ?? 0,
          averageRating: t.averageRating ?? 0,
          tags: t.tags ?? [],
          lastChapterId: t.lastestChapter?.id ?? t.lastChapterId,
          lastChapterIndex: t.lastestChapter?.index ?? t.lastChapterIndex,
          lastChapterUpdate: t.lastestChapter?.createDate ?? t.lastChapterUpdate ?? t.updateDate,
        } as MangaSumaryDto));
        const totalCount = raw?.totalCount ?? raw?.total ?? 0;
        const totalPages = raw?.totalPages ?? raw?.pageCount
          ?? (totalCount ? Math.ceil(totalCount / pageSize) : 1);
        return { data, totalPages, totalCount };
      })
    );
  }

  /** @deprecated Pagination metadata comes from getPaginated() */
  getPageCount(): Observable<number> {
    return this.getPaginated(1, 1).pipe(
      map((res: any) => res?.data?.totalPages ?? res?.totalPages ?? 1)
    );
  }

  getTopManga(): Observable<any> {
    return this.http.get(`${this.base}/trending`);
  }

  getTopMangaPaginated(page = 1, pageSize = 20): Observable<{ data: Manga[]; totalPages: number; totalCount: number }> {
    const params = new HttpParams()
      .set('pageNumber', page)
      .set('pageSize', pageSize);
    return this.http.get(`${this.base}/filter-manga`, { params }).pipe(
      map((res: any) => {
        const raw = res?.value ?? res;
        const items = (raw?.data ?? []).map((t: any) => ({
          id: t.id,
          name: t.name,
          mangaThumbnail: t.thumbnail ?? t.mangaThumbnail,
          mangaBackground: t.mangaBackground,
          status: t.status,
          totalViews: t.totalViews ?? 0,
          averageRating: t.averageRating ?? 0,
          totalChapters: t.totalChapters ?? 0,
          totalFollows: t.totalFollows ?? 0,
          tags: t.tags ?? [],
          comments: t.comments ?? [],
          updateDate: t.updateDate ?? '',
          lastestChapter: t.lastestChapter,
        } as Manga));
        const totalCount = raw?.totalCount ?? 0;
        const totalPages = raw?.totalPages
          ?? (totalCount ? Math.ceil(totalCount / pageSize) : 1);
        return { data: items, totalPages, totalCount };
      })
    );
  }

  getTrending(take = 10): Observable<any> {
    return this.http.get(`${this.base}/trending`, { params: { take } })
    .pipe(map((res: any) => res?.data?.items ?? res?.items ?? []));
  }

  // TODO: replace with dedicated popular API when available
  getPopular(page = 1, pageSize = 12): Observable<MangaSumaryDto[]> {
    return this.getNewestManga(page, pageSize);
  }

  getPopularPaginated(page = 1, pageSize = 20): Observable<{ data: MangaSumaryDto[]; totalPages: number; totalCount: number }> {
    const params = new HttpParams()
      .set('pageNumber', page)
      .set('pageSize', pageSize);
    return this.http.get(`${this.base}/filter-manga`, { params }).pipe(
      map((res: any) => {
        const raw = res?.value ?? res;
        const data = (raw?.data ?? []).map((t: any) => ({
          id: t.id,
          name: t.name,
          mangaThumbnail: t.thumbnail ?? t.mangaThumbnail,
          mangaBackground: t.mangaBackground,
          totalViews: t.totalViews ?? 0,
          averageRating: t.averageRating ?? 0,
          tags: t.tags ?? [],
          lastChapterId: t.lastestChapter?.id ?? t.lastChapterId,
          lastChapterIndex: t.lastestChapter?.index ?? t.lastChapterIndex,
          lastChapterUpdate: t.lastestChapter?.createDate ?? t.lastChapterUpdate ?? t.updateDate,
        } as MangaSumaryDto));
        const totalCount = raw?.totalCount ?? 0;
        const totalPages = raw?.totalPages ?? (totalCount ? Math.ceil(totalCount / pageSize) : 1);
        return { data, totalPages, totalCount };
      })
    );
  }

  getRecommended(page = 1, pageSize = 12): Observable<Manga[]> {
    return this.getPaginated(page, pageSize).pipe(
      map((res: any) => {
        return res?.value?.data?.map((t: any) => ({
          id: t.id,
          name: t.name,
          mangaThumbnail: t.mangaThumbnail,
          mangaBackground: t.mangaBackground,
          status: t.status,
          totalViews: t.totalViews ?? 0,
          averageRating: t.averageRating ?? 0,
          lastestChapter: t.lastestChapter,
          tags: t.tags ?? [],
        } as Manga)) ?? [];
      })
    );
  }

  getLatestUpdated(page = 1, pageSize = 20): Observable<any> {
    const params = new HttpParams()
      .set('page', page)
      .set('pageSize', pageSize);
    return this.http.get(`${this.base}/latest-updated`, { params });
  }

  /** Returns tags mapped to old { genreId, genresIdName } shape so header dropdown works */
  getCategories(): Observable<any[]> {
    return this.http.get<any>(`${this.tagBase}/get-all`).pipe(
      map((res: any) => {  
        const tags: any[] = res?.value ?? [];
        return tags.map((t: any) => ({ genreId: t.id, genresIdName: t.name }));
      })
    );
  }

  getDetail(mangaId: string): Observable<any> {
    return this.http.get(`${this.base}/detail/${mangaId}`);
  }

  /** Same as getDetail — both now hit the aggregated detail endpoint */
  getDetailAggregated(mangaId: string): Observable<Manga> {
    return this.http.get(`${this.base}/detail/${mangaId}`)
    .pipe(map((res: any) => {
      const t = res?.value ?? res;
      return {
          id: t.id,
          name: t.name,
          description: t.description,
          level: t.level,
          status: t.status,
          type: t.type,
          countries: t.countries,
          season: t.season,
          mangaThumbnail: t.mangaThumbnail,
          mangaBackground: t.mangaBackground,
          userId: t.userId,
          averageRating: t.averageRating,
          totalFollows: t.totalFollows,
          totalViews: t.totalViews,
          totalChapters: t.totalChapters,
          tags: t.tags ?? [],
          authors: t.authors ?? [],
          artists: t.artists ?? [],
          chapters: t.chapters ?? [],
          comments: t.comments ?? [],
          updateDate: t.updateDate ?? "", 
        } as Manga;
      }));
  }

  getChapters(mangaId: string): Observable<any[]> {
    const params = new HttpParams()
    .set('PageNumber', 1)
    .set('PageSize', 1000)
    .set('MangaId', mangaId);
    return this.http.get(`${this.chapterBase}/filter-chapter`, { params }).pipe(
      map((res: any) => {
        const t = res?.value ?? res;
        return t?.data?.map((chapter : any) => 
          (
            {
               id: chapter.id,
               index : chapter.index,
               title: chapter.title,
               mangaId: chapter.mangaId,
               chapterDate: chapter.chapterDate ?? new Date().toString()
            }
          )
        ) ?? []
      })
    );
  }

  getChapterImages(chapterId: string): Observable<ChapterImage[]> {
    const params = new HttpParams().set('ChapterId', chapterId);
    return this.http.get(`${this.chapterBase}/get-image`, { params }).pipe(
      map((res: any) => {
        const images: ChapterImage[] = res?.value ?? res;
        return images;
      })
    );
  }

  filter(params: {
    name?: string;
    tagId?: string;
    status?: number;
    type?: number;
    countries?: number;
    level?: number;
    page?: number;
    pageSize?: number;
  }): Observable<any> {
    let httpParams = new HttpParams();
    if (params.name) httpParams = httpParams.set('name', params.name);
    if (params.tagId) httpParams = httpParams.set('tagId', params.tagId);
    if (params.status != null) httpParams = httpParams.set('Status', params.status);
    if (params.type != null) httpParams = httpParams.set('Type', params.type);
    if (params.countries != null) httpParams = httpParams.set('Countries', params.countries);
    if (params.level != null) httpParams = httpParams.set('Level', params.level);
    httpParams = httpParams.set('pageNumber', params.page ?? 1);
    httpParams = httpParams.set('pageSize', params.pageSize ?? 20);
    return this.http.get(`${this.base}/filter-manga`, { params: httpParams })
    .pipe(map((res: any) =>{
        const tags: MangaPagination = res?.value ?? null;
        return tags?.data?.map((t: any) => ({ mangaId: t.id, mangaName: t.name, mangaImage: t.thumbnail, status: t.status,  })) ?? [];
    }));
  }

   filterByTags(params: {
    tagIds?: string[];
    page?: number;
    pageSize?: number;
  }): Observable<any> {
    let httpParams = new HttpParams();
    if (params.tagIds && params.tagIds.length > 0) {
      httpParams = httpParams.set('tagIds', params.tagIds.join(','));
    }
    httpParams = httpParams.set('pageNumber', params.page ?? 1);
    httpParams = httpParams.set('pageSize', params.pageSize ?? 50);
    return this.http.get(`${this.base}/filter-manga-by-tags`, { params: httpParams })
    .pipe(map((res: any) =>{
        const tags: MangaPagination = res?.value ?? null;
        return tags?.data?.map((t: any) => ({ mangaId: t.id, mangaName: t.name, mangaImage: t.thumbnail, status: t.status,  })) ?? [];
    }));
  }

  search(query: string): Observable<any[]> {
    return this.filterPaginated({ name: query, pageNo: 1, pageSize: 10 }).pipe(
      map((res: any) => res?.data?.items ?? res?.items ?? [])
    );
    // return this.filter({ name: query, page: 1, pageSize: 10 }).pipe(
    //   map((res: any) => res?.data?.items ?? res?.items ?? [])
    // );
  }

  getByCategory(tagId: string, page: number, size: number): Observable<any> {
    //return this.filter({ tagId, page, pageSize });
    return this.filterPaginated({ tagIds: [tagId], pageNo: page, pageSize: size });
  }

  /** @deprecated Use getByCategory() with a tag ID instead */
  getByType(type: string, page: number, size: number): Observable<any[]> {
     return this.filterPaginated({ pageNo: page, pageSize: size }).pipe(
      map((res: any) => res?.data?.items ?? res?.items ?? [])
    );
    // return this.filter({ page, pageSize }).pipe(
    //   map((res: any) => res?.data?.items ?? res?.items ?? [])
    // );
  }

  /** @deprecated Use filter() with combined params instead */
  getAllByType(type: string, page: number, size: number): Observable<any[]> {
    return this.filterPaginated({ pageNo: page, pageSize: size }).pipe(
      map((res: any) => res?.data?.items ?? res?.items ?? [])
    );
    // return this.filter({ page, pageSize }).pipe(
    //   map((res: any) => res?.data?.items ?? res?.items ?? [])
    // );
  }

  getByCategories(tags: string[]): Observable<any> {
    return this.filterPaginated({ pageNo: 1, pageSize: 50 ,  tagIds: tags});
    //return this.filterByTags({ tagIds: tagIds, pageSize: 50 });
  }

  filterPaginated(params: {
    pageNo?: number;
    pageSize?: number;
    id?: string;
    name?: string;
    tagIds?: string[],
    authorId?: string,
    artistId?: string,
    level?: number;
    status?: number;
    type?: number;
    countries?: number;
  }): Observable<{ data: Manga[]; totalPages: number; totalCount: number }> {
    let httpParams = new HttpParams();
    if (params.id) httpParams = httpParams.set('id', params.id);
    if (params.name) httpParams = httpParams.set('name', params.name);
    if (params.status != null) httpParams = httpParams.set('Status', params.status);
    if (params.type != null) httpParams = httpParams.set('Type', params.type);
    if (params.countries != null) httpParams = httpParams.set('Countries', params.countries);
    if (params.level != null) httpParams = httpParams.set('Level', params.level);
    if (params.tagIds) httpParams = httpParams.set('tagIds', params.tagIds.join(','));
    if (params.authorId) httpParams = httpParams.set('authorId', params.authorId);
    if (params.artistId) httpParams = httpParams.set('artistId', params.artistId);

    httpParams = httpParams.set('pageNumber', params.pageNo ?? 1);
    httpParams = httpParams.set('pageSize', params.pageSize ?? 20);
    return this.http.get(`${this.base}/filter-manga`, { params: httpParams }).pipe(
      map((res: any) => {
        const raw = res?.value ?? res;
        const items = (raw?.data ?? []).map((t: any) => ({
          id: t.id,
          name: t.name,
          mangaThumbnail: t.thumbnail ?? t.mangaThumbnail,
          mangaBackground: t.mangaBackground,
          status: t.status,
          totalViews: t.totalViews ?? 0,
          averageRating: t.averageRating ?? 0,
          totalChapters: t.totalChapters ?? 0,
          tags: t.tags ?? [],
          updateDate: t.updateDate ?? '',
          lastestChapter: t.lastestChapter,
        } as Manga));
        const totalCount = raw?.totalCount ?? 0;
        const pageSize = params.pageSize ?? 20;
        const totalPages = raw?.totalPages ?? (totalCount ? Math.ceil(totalCount / pageSize) : 1);
        return { data: items, totalPages, totalCount };
      })
    );
  }

  filterByTagsPaginated(params: {
    tagIds?: string[];
    page?: number;
    pageSize?: number;
  }): Observable<{ data: Manga[]; totalPages: number; totalCount: number }> {
    let httpParams = new HttpParams();
    if (params.tagIds && params.tagIds.length > 0) {
      httpParams = httpParams.set('tagIds', params.tagIds.join(','));
    }
    httpParams = httpParams.set('pageNumber', params.page ?? 1);
    httpParams = httpParams.set('pageSize', params.pageSize ?? 20);
    return this.http.get(`${this.base}/filter-manga-by-tags`, { params: httpParams }).pipe(
      map((res: any) => {
        const raw = res?.value ?? res;
        const items = (raw?.data ?? []).map((t: any) => ({
          id: t.id,
          name: t.name,
          mangaThumbnail: t.thumbnail ?? t.mangaThumbnail,
          mangaBackground: t.mangaBackground,
          status: t.status,
          totalViews: t.totalViews ?? 0,
          averageRating: t.averageRating ?? 0,
          totalChapters: t.totalChapters ?? 0,
          tags: t.tags ?? [],
          updateDate: t.updateDate ?? '',
          lastestChapter: t.lastestChapter,
        } as Manga));
        const totalCount = raw?.totalCount ?? 0;
        const pageSize = params.pageSize ?? 20;
        const totalPages = raw?.totalPages ?? (totalCount ? Math.ceil(totalCount / pageSize) : 1);
        return { data: items, totalPages, totalCount };
      })
    );
  }

  getTotalCount(): Observable<number> {
    return this.getPaginated(1, 1).pipe(
      map((res: any) => res?.data?.totalCount ?? res?.totalCount ?? 0)
    );
  }

  getComments(mangaId: string, pageSize: number, page: number): Observable<any> {
    const params = new HttpParams()
      .set('MangaId', mangaId)
      .set('PageNumber', page)
      .set('PageSize', pageSize);
    return this.http.get(`${environment.commentApi}/filter-comment`, { params });
  }
}
