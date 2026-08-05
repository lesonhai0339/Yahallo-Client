import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { Chapter, Manga, MangaDetailDto, MangaStatsDto, MangaPagination, PagedResult } from '../models/interfaces';
import { ChapterImage, ChapterSortBy } from '../models/chapter.interface';
import { HomepageDto, MangaSumaryDto, MangaSortBy } from '../models/manga.interface';
import { ReadVarExpr } from '@angular/compiler';
import { CacheService, CACHE_TTL } from './cache.service';

@Injectable({ providedIn: 'root' })
export class MangaService {
  private readonly base = environment.mangaApi;
  private readonly chapterBase = environment.chapterApi;
  private readonly tagBase = environment.tagApi;
  private readonly authorBase = environment.authorApi;
  private readonly artistBase = environment.artistApi;

  constructor(private http: HttpClient, private cache: CacheService) {}

  /**
   * Ghi 1 lượt xem manga. Luôn gửi visitorId (cho khách); nếu user đã login,
   * backend bỏ qua visitorId và dedup theo UserId từ JWT. Dedup trong cửa sổ ngắn (vài phút).
   */
  recordView(mangaId: string, chapterId?: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/manga-view/record`, {
      mangaId,
      chapterId: chapterId ?? null,
      visitorId: this.getVisitorId(),
    });
  }

  /** GUID định danh khách vãng lai, lưu localStorage 1 lần dùng mãi. */
  private getVisitorId(): string {
    let id = localStorage.getItem('visitorId');
    if (!id) {
      id = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'v-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      localStorage.setItem('visitorId', id);
    }
    return id;
  }

  getHomepage(): Observable<HomepageDto> {
    // Server cache homepage 2 phút → client cache khớp để tránh gọi lại khi quay về.
    return this.cache.get('homepage', CACHE_TTL.HOMEPAGE, () =>
      this.http.get<any>(`${this.base}/homepage`).pipe(
        map((res: any) => res?.value ?? res)
      )
    );
  }

  getPaginated(page: number, pageSize = 20): Observable<any> {
    const params = new HttpParams()
      .set('PageNo', page)
      .set('PageSize', pageSize);
    return this.http.get(`${this.base}/get-all-pagination`, { params });
  }
  getNewestUpdatePaginated(page: number, pageSize = 20): Observable<any> {
    const params = new HttpParams()
      .set('PageNo', page)
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
            name: t.displayName, 
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
          name: t.displayName,
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

  getTopMangaPaginated(page = 1, pageSize = 20, sortBy: MangaSortBy, reverseSort: boolean): Observable<{ data: Manga[]; totalPages: number; totalCount: number }> {
    const params = new HttpParams()
      .set('PageNo', page)  
      .set('PageSize', pageSize)
      .set('sortBy', sortBy)
      .set('reverseSort', reverseSort);
    return this.http.get(`${this.base}/filter-manga`, { params }).pipe(
      map((res: any) => {
        const raw = res?.value ?? res;
        const items = (raw?.data ?? []).map((t: any) => ({
          id: t.id,
          displayName: t.displayName,
          mangaThumbnail: t.thumbnail ?? t.mangaThumbnail,
          mangaBackground: t.mangaBackground,
          status: t.status,
          // Server (FilterManga/MangaDto) trả về viewCount/rating, KHÔNG phải totalViews/averageRating.
          totalViews: t.viewCount ?? t.totalViews ?? 0,
          averageRating: t.rating ?? t.averageRating ?? 0,
          totalChapters: t.totalChapters ?? 0,
          totalFollows: t.totalFollows ?? 0,
          tags: t.tags ?? [],
          comments: t.comments ?? [],
          updateDate: t.updateDate ?? '',
          lastestChapter: t.lastestChapter,
        } as Manga));
        const totalCount = raw?.totalCount ?? 0;
        const totalPages = totalCount ? Math.ceil(totalCount / pageSize) : (raw?.totalPages ?? 1);
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
      .set('PageNo', page)
      .set('PageSize', pageSize);
    return this.http.get(`${this.base}/filter-manga`, { params }).pipe(
      map((res: any) => {
        const raw = res?.value ?? res;
        const data = (raw?.data ?? []).map((t: any) => ({
          id: t.id,
          name: t.displayName,
          // Shared <app-manga-sumary-card> (grid view) reads `displayName`; the
          // list view reads `name`. Cấp cả hai để cả hai chế độ đều có tên.
          displayName: t.displayName,
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
        // Derive from the reliable totalCount + requested pageSize so the page
        // count always matches this template's items-per-page.
        const totalPages = totalCount ? Math.ceil(totalCount / pageSize) : (raw?.totalPages ?? 1);
        return { data, totalPages, totalCount };
      })
    );
  }

  /**
   * Paginated manga list backed by `filter-manga` with server-side sorting.
   * Replaces the removed `lastest-updated` endpoint — use SortBy.LastUpdate
   * for "newest" and SortBy.ViewCount for "popular".
   *
   * NOTE: reverseSort = true → OrderByDescending on the backend, i.e. newest
   * date / highest views first — which is what both "latest" and "popular"
   * want. Pass false for ascending (oldest / lowest first).
   */
  getSortedPaginated(
    page = 1,
    pageSize = 20,
    sortBy: MangaSortBy = MangaSortBy.LastUpdate,
    reverseSort = true,
    filters?: { authorId?: string; artistId?: string; tagIds?: string[] },
  ): Observable<{ data: MangaSumaryDto[]; totalPages: number; totalCount: number }> {
    let params = new HttpParams()
      .set('PageNo', page)
      .set('PageSize', pageSize)
      .set('SortBy', sortBy)
      .set('ReverseSort', reverseSort);
    // Lọc theo tác giả / hoạ sĩ / thể loại — dùng cho trang "xem tất cả truyện
    // của <đối tượng>", vốn chỉ khác /latest ở bộ lọc này.
    if (filters?.authorId) params = params.set('authorId', filters.authorId);
    if (filters?.artistId) params = params.set('artistId', filters.artistId);
    if (filters?.tagIds?.length) params = params.set('tagIds', filters.tagIds.join(','));
    return this.http.get(`${this.base}/filter-manga`, { params }).pipe(
      map((res: any) => {
        const raw = res?.value ?? res;
        const data = (raw?.data ?? []).map((t: any) => ({
          id: t.id,
          name: t.displayName,
          // Shared <app-manga-sumary-card> (grid view) reads `displayName`; the
          // list view reads `name`. Cấp cả hai để cả hai chế độ đều có tên.
          displayName: t.displayName,
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
        // Derive from the reliable totalCount + requested pageSize so the page
        // count always matches this template's items-per-page.
        const totalPages = totalCount ? Math.ceil(totalCount / pageSize) : (raw?.totalPages ?? 1);
        return { data, totalPages, totalCount };
      })
    );
  }

  getRecommended(page = 1, pageSize = 12): Observable<Manga[]> {
    return this.getPaginated(page, pageSize).pipe(
      map((res: any) => {
        return res?.value?.data?.map((t: any) => ({
          id: t.id,
          displayName: t.displayName,
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
      .set('PageNo', page)
      .set('PageSize', pageSize);
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

  /** All authors — { id, name } — from `author/get-all` (GetAllAuthorResult). */
  getAllAuthors(): Observable<{ id: string; name: string }[]> {
    return this.http.get<any>(`${this.authorBase}/get-all`).pipe(
      map((res: any) => {
        const list: any[] = res?.value ?? res ?? [];
        return list.map((a: any) => ({ id: a.id, name: a.name }));
      })
    );
  }

  /** All artists — { id, name } — from `artist/get-all` (GetAllArtistResult). */
  getAllArtists(): Observable<{ id: string; name: string }[]> {
    return this.http.get<any>(`${this.artistBase}/get-all`).pipe(
      map((res: any) => {
        const list: any[] = res?.value ?? res ?? [];
        return list.map((a: any) => ({ id: a.id, name: a.name }));
      })
    );
  }

  getDetail(mangaId: string): Observable<any> {
    const params = new HttpParams()
    .set('Id', mangaId)
    return this.http.get(`${this.base}/detail`, {params});
  }

  /**
   * Tag info (name / description) for the tag-target result header. The manga
   * grid + its total count are fetched separately via filterPaginated so paging
   * is independent of this call.
   */
  getTagInfo(tagId: string): Observable<{ id: string; name: string; description?: string }> {
    const params = new HttpParams().set('Id', tagId);
    return this.http.get<any>(`${this.tagBase}/get-by-id`, { params }).pipe(
      map((res: any) => {
        const v = res?.value ?? res;
        return { id: v.id, name: v.name, description: v.description };
      })
    );
  }

  /**
   * Aggregated manga detail — STATIC fields only.
   * Backend no longer returns dynamic counters (views/rating/follows/chapters)
   * here; load those with getMangaStats() and getChapters().
   */
  getDetailAggregated(mangaId: string): Observable<MangaDetailDto> {
    // Chỉ chứa field tĩnh → cache 10 phút (khớp server). Counter động lấy ở getMangaStats.
    return this.cache.get(`manga-detail:${mangaId}`, CACHE_TTL.MANGA_DETAIL, () => {
      const params = new HttpParams().set('Id', mangaId);
      return this.http.get(`${this.base}/detail`, { params })
        .pipe(map((res: any) => {
          const t = res?.value ?? res;
          return {
              id: t.id,
              name: t.displayName,
              description: t.description,
              level: t.level,
              status: t.status,
              type: t.type,
              countries: t.countries,
              season: t.season,
              mangaThumbnail: t.mangaThumbnail,
              mangaBackground: t.mangaBackground,
              userId: t.userId,
              tags: t.tags ?? [],
              authors: t.authors ?? [],
              artists: t.artists ?? [],
            } as MangaDetailDto;
          }));
    });
  }

  getMangaStats(mangaId: string): Observable<MangaStatsDto> {
    const params = new HttpParams()
    .set('MangaId', mangaId)
    return this.http.get(`${this.base}/status`, { params }).pipe(
       map((res: any) => res?.value ?? res)
    );

  }

  getChapters(
    mangaId: string,
    sortBy: ChapterSortBy = ChapterSortBy.Index,
    reverseSort = true,
  ): Observable<Chapter[]> {
    return this.cache.get(`chapters:${mangaId}:${sortBy}:${reverseSort}`, CACHE_TTL.CHAPTERS, () => {
      const params = new HttpParams()
      .set('PageNo', 1)
      .set('PageSize', 1000)
      .set('MangaId', mangaId)
      .set('SortBy', sortBy)
      .set('ReverseSort', reverseSort);
      return this.http.get(`${this.chapterBase}/filter-chapter`, { params }).pipe(
        map((res: any) => {
          const t = res?.value ?? res;
          return t?.data?.map((chapter : any) =>
            (
              {
                 id: chapter.id,
                 index : chapter.index,
                 // Chương phụ (chương 10.5 → index 10, subIndex 5). Server có thể
                 // trả null cho chương thường.
                 subIndex: chapter.subIndex ?? 0,
                 title: chapter.title,
                 mangaId: chapter.mangaId,
                 mangaName: chapter.mangaName,
                 chapterDate: chapter.createDate
              }
            )
          ) ?? []
        }),
        // Sắp xếp lại ở CLIENT khi lấy theo số chương. Trước đây hoàn toàn tin
        // vào thứ tự server trả, nên chỉ cần đổi `ReverseSort` (hoặc server đổi
        // mặc định) là danh sách chương và các nút "đọc từ đầu/mới nhất" lặng lẽ
        // đảo chiều mà không có lỗi nào báo ra. Chương 10.5 xếp ngay sau 10.
        map((list: Chapter[]) => {
          if (sortBy !== ChapterSortBy.Index) return list;
          const dir = reverseSort ? -1 : 1;
          return [...list].sort((a, b) =>
            dir * ((a.index - b.index) || ((a.subIndex ?? 0) - (b.subIndex ?? 0))));
        }),
      );
    });
  }

  getChapterImages(mangaId: string, chapterId: string): Observable<ChapterImage[]> {
    const params = new HttpParams()
      .set('MangaId', mangaId)
      .set('ChapterId', chapterId);

    return this.http.get(`${this.chapterBase}/get-image`, { params }).pipe(
      map((res: any) => {
        const raw: any[] = res?.value ?? res ?? [];
        const images: ChapterImage[] = raw.map((img: any) => ({
          id: img.id,
          index: img.index ?? 0,
          // Ưu tiên url, fallback resizeUrl
          cloudUrl: img.url ?? img.resizeUrl ?? img.cloudUrl ?? '',
          url: img.url,
          resizeUrl: img.resizeUrl,
          width: img.width,
          height: img.height,
          resizeWidth: img.resizeWidth,
          resizeHeight: img.resizeHeight,
          contentType: img.contentType,
        }));
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
    httpParams = httpParams.set('PageNo', params.page ?? 1);
    httpParams = httpParams.set('PageSize', params.pageSize ?? 20);
    return this.http.get(`${this.base}/filter-manga`, { params: httpParams })
    .pipe(map((res: any) =>{
        const tags: MangaPagination = res?.value ?? null;
        return tags?.data?.map((t: any) => ({ mangaId: t.id, mangaName: t.displayName, mangaImage: t.thumbnail, status: t.status,  })) ?? [];
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
    httpParams = httpParams.set('PageNo', params.page ?? 1);
    httpParams = httpParams.set('PageSize', params.pageSize ?? 50);
    return this.http.get(`${this.base}/filter-manga-by-tags`, { params: httpParams })
    .pipe(map((res: any) =>{
        const tags: MangaPagination = res?.value ?? null;
        return tags?.data?.map((t: any) => ({ mangaId: t.id, mangaName: t.displayName, mangaImage: t.thumbnail, status: t.status,  })) ?? [];
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
    season?: number;
    sortBy?: MangaSortBy;
    reverseSort?: boolean;
  }): Observable<{ data: Manga[]; totalPages: number; totalCount: number }> {
    let httpParams = new HttpParams();
    if (params.id) httpParams = httpParams.set('id', params.id);
    if (params.name) httpParams = httpParams.set('name', params.name);
    if (params.status != null) httpParams = httpParams.set('Status', params.status);
    if (params.type != null) httpParams = httpParams.set('Type', params.type);
    if (params.countries != null) httpParams = httpParams.set('Countries', params.countries);
    if (params.level != null) httpParams = httpParams.set('Level', params.level);
    if (params.season != null) httpParams = httpParams.set('Season', params.season);
    if (params.tagIds) httpParams = httpParams.set('tagIds', params.tagIds.join(','));
    if (params.authorId) httpParams = httpParams.set('authorId', params.authorId);
    if (params.artistId) httpParams = httpParams.set('artistId', params.artistId);
    if (params.sortBy) httpParams =  httpParams.set('SortBy', params.sortBy);
    if (params.reverseSort) httpParams = httpParams.set('ReverseSort', params.reverseSort);

    httpParams = httpParams.set('PageNo', params.pageNo ?? 1);
    httpParams = httpParams.set('PageSize', params.pageSize ?? 20);
    return this.http.get(`${this.base}/filter-manga`, { params: httpParams }).pipe(
      map((res: any) => {
        const raw = res?.value ?? res;
        const items = (raw?.data ?? []).map((t: any) => ({
          id: t.id,
          displayName: t.displayName,
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
        // Ưu tiên tính từ totalCount + pageSize để số trang khớp đúng số mục mỗi
        // trang của template. Backend trả tên field là `pageCount` — nhánh dự
        // phòng cũ chỉ đọc `totalPages` nên không bao giờ khớp, luôn rơi về 1
        // và làm tầng trên tưởng "có 1 trang" ngay cả khi không có kết quả nào.
        const totalPages = totalCount
          ? Math.ceil(totalCount / pageSize)
          : (raw?.totalPages ?? raw?.pageCount ?? (items.length ? 1 : 0));
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
    httpParams = httpParams.set('PageNo', params.page ?? 1);
    httpParams = httpParams.set('PageSize', params.pageSize ?? 20);
    return this.http.get(`${this.base}/filter-manga-by-tags`, { params: httpParams }).pipe(
      map((res: any) => {
        const raw = res?.value ?? res;
        const items = (raw?.data ?? []).map((t: any) => ({
          id: t.id,
          displayName: t.displayName,
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
        // Ưu tiên tính từ totalCount + pageSize để số trang khớp đúng số mục mỗi
        // trang của template. Backend trả tên field là `pageCount` — nhánh dự
        // phòng cũ chỉ đọc `totalPages` nên không bao giờ khớp, luôn rơi về 1
        // và làm tầng trên tưởng "có 1 trang" ngay cả khi không có kết quả nào.
        const totalPages = totalCount
          ? Math.ceil(totalCount / pageSize)
          : (raw?.totalPages ?? raw?.pageCount ?? (items.length ? 1 : 0));
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
      .set('PageNo', page)
      .set('PageSize', pageSize);
    return this.http.get(`${environment.commentApi}/filter-comment`, { params });
  }
}
