import { Injectable } from '@angular/core';
import { ReplaySubject } from 'rxjs';
import { MangaService } from './manga.service';
import { Tag } from '../models/interfaces';
import { HomepageDto, MangaSumaryDto, TopMangaDto } from '../models/manga.interface';

export interface SimpleItem {
  id: string;
  name: string;
}

@Injectable({ providedIn: 'root' })
export class MasterDataService {
  private _categories$ = new ReplaySubject<any[]>(1);
  private _tags$ = new ReplaySubject<Tag[]>(1);
  private _authors$ = new ReplaySubject<SimpleItem[]>(1);
  private _artists$ = new ReplaySubject<SimpleItem[]>(1);
  private _homepage$ = new ReplaySubject<HomepageDto>(1);
  private loaded = false;

  categories$ = this._categories$.asObservable();
  tags$ = this._tags$.asObservable();
  authors$ = this._authors$.asObservable();
  artists$ = this._artists$.asObservable();
  homepage$ = this._homepage$.asObservable();

  constructor(private mangaService: MangaService) {}

  load(): void {
    if (this.loaded) return;
    this.loaded = true;

    this.mangaService.getHomepage().subscribe(homepage => {
      this._homepage$.next(homepage);

      const tags = (homepage.tags || []).sort((a, b) => a.name.localeCompare(b.name));
      this._tags$.next(tags);

      this._categories$.next(
        tags.map(t => ({ genreId: t.id, genresIdName: t.name }))
      );

      this._authors$.next(
        (homepage.authors || [])
          .map(a => ({ id: a.id, name: a.name } as SimpleItem))
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      this._artists$.next(
        (homepage.artists || [])
          .map(a => ({ id: a.id, name: a.name } as SimpleItem))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    });
  }
}
