import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Manga, MangaDetail, PagedResult } from '../models/interfaces';

@Injectable({ providedIn: 'root' })
export class MangaService {
  private readonly base = environment.mangaApi;
  private readonly svc = environment.serviceApi;

  constructor(private http: HttpClient) {}

  getAll(page: number): Observable<Manga[]> {
    return this.http.get<Manga[]>(`${this.base}/GetAllManga/${page}`);
  }

  getPageCount(): Observable<number> {
    return this.http.get<number>(`${this.base}/GetPageNumber`);
  }

  getTopManga(): Observable<any> {
    return this.http.get(`${this.base}/Topmanga`);
  }

  getCategories(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/Category/Getall`);
  }

  getDetail(mangaId: string): Observable<Manga> {
    return this.http.get<Manga>(`${this.base}/Details/${mangaId}`);
  }

  getDetailAggregated(mangaId: string): Observable<MangaDetail> {
    return this.http.get<MangaDetail>(`${environment.mangaApi}/manga/detail/${mangaId}`);
  }

  getChapters(mangaId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/${mangaId}/GetChapter`);
  }

  getChapterImages(mangaId: string, chapterId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/${mangaId}/${chapterId}/getDsImage`);
  }

  search(query: string): Observable<Manga[]> {
    return this.http.get<Manga[]>(`${this.base}/SearchMangaV2/${query}`);
  }

  getByCategory(id: string, page: number, pageSize: number): Observable<Manga[]> {
    return this.http.get<Manga[]>(`${this.base}/GetmangabyCategory/${id}/${page}/${pageSize}`);
  }

  getByType(type: string, page: number, pageSize: number): Observable<Manga[]> {
    return this.http.get<Manga[]>(`${this.base}/topmanga_by_type/${type}/${page}/${pageSize}`);
  }

  getAllByType(type: string, page: number, pageSize: number): Observable<Manga[]> {
    return this.http.get<Manga[]>(`${this.base}/all_manga_by_type/${type}/${page}/${pageSize}`);
  }

  getByCategories(categoryIds: string[]): Observable<Manga[]> {
    let params = new HttpParams();
    categoryIds.forEach(id => { params = params.append('List', id); });
    return this.http.get<Manga[]>(`${this.base}/GetMangaByListCategories`, { params });
  }

  getTrending(take = 10): Observable<any[]> {
    return this.http.get<any[]>(`${environment.apiUrl}/manga/trending?take=${take}`);
  }

  getLatestUpdated(page = 1, pageSize = 20): Observable<any[]> {
    return this.http.get<any[]>(`${environment.apiUrl}/manga/latest-updated?page=${page}&pageSize=${pageSize}`);
  }

  getTotalCount(): Observable<number> {
    return this.http.get<number>(`${this.base}/number_all_manga`);
  }

  getComments(mangaId: string, pageSize: number, page: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.svc}/manga_comment_manga/${mangaId}/${pageSize}/${page}`);
  }
}
