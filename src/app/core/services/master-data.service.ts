import { Injectable } from '@angular/core';
import { Observable, ReplaySubject } from 'rxjs';
import { map } from 'rxjs/operators';
import { MangaService } from './manga.service';
import { TagService } from './tag.service';
import { AuthorService } from './author.service';
import { ArtistService } from './artist.service';
import { Tag } from '../models/interfaces';

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
  private loaded = false;

  categories$ = this._categories$.asObservable();
  tags$ = this._tags$.asObservable();
  authors$ = this._authors$.asObservable();
  artists$ = this._artists$.asObservable();

  constructor(
    private mangaService: MangaService,
    private tagService: TagService,
    private authorService: AuthorService,
    private artistService: ArtistService
  ) {}

  load(): void {
    if (this.loaded) return;
    this.loaded = true;

    this.mangaService.getCategories().subscribe(c => {
      this._categories$.next((c || []).sort((a: any, b: any) => a.genresIdName.localeCompare(b.genresIdName)));
    });

    this.tagService.getAll().subscribe((res: any) => {
      const tags: Tag[] = ((res?.value ?? res?.data ?? res) || []).sort((a: Tag, b: Tag) => a.name.localeCompare(b.name));
      this._tags$.next(tags);
    });

    this.authorService.getAll().subscribe((res: any) => {
      const raw = res?.value ?? res?.data ?? res ?? [];
      this._authors$.next(
        raw.map((a: any) => ({ id: a.id, name: a.name } as SimpleItem)).sort((a: SimpleItem, b: SimpleItem) => a.name.localeCompare(b.name))
      );
    });

    this.artistService.getAll().subscribe((res: any) => {
      const raw = res?.value ?? res?.data ?? res ?? [];
      this._artists$.next(
        raw.map((a: any) => ({ id: a.id, name: a.name } as SimpleItem)).sort((a: SimpleItem, b: SimpleItem) => a.name.localeCompare(b.name))
      );
    });
  }
}
