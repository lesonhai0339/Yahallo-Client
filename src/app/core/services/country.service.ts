import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { Country } from '../models/country.interface';

// TODO: đổi thành false khi backend có API GET /country (Yahallo-API CountryController).
const USE_MOCK = true;

@Injectable({ providedIn: 'root' })
export class CountryService {
  private readonly base = environment.countryApi;
  private cache$?: Observable<Country[]>;

  constructor(private http: HttpClient) {}

  getCountries(): Observable<Country[]> {
    if (this.cache$) return this.cache$;

    const source = this.http.get<any>(`${this.base}/get-all`).pipe(
          map(res => this.sort(this.mapResponse(res))),
          catchError(() => [])
        );

    this.cache$ = source.pipe(shareReplay(1));
    return this.cache$;
  }

  /** Chuẩn hóa response từ API (hỗ trợ cả PascalCase lẫn camelCase, có/không bọc trong `value`). */
  private mapResponse(res: any): Country[] {
    const arr: any[] = res?.value ?? res ?? [];
    return arr.map(x => ({
      id : x.id ??  x.id,
      code: x.code ?? x.Code,
      name: x.name ?? x.Name,
      fullName: x.fullName ?? x.FullName,
      vietnameseName: x.vietnameseName ?? x.VietnameseName,
      phoneCode: x.phoneCode ?? x.PhoneCode,
    } as Country));
  }

  private sort(list: Country[]): Country[] {
    return list.sort((a, b) => a.vietnameseName.localeCompare(b.vietnameseName, 'vi'));
  }
}
