import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, catchError, map, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class HealthService {
  private readonly hcUrl = environment.apiUrl + '/hc';

  constructor(private http: HttpClient) {}

  check(): Observable<boolean> {
    return this.http.get(this.hcUrl, { responseType: 'text' }).pipe(
      timeout(5000),
      map(() => true),
      catchError(() => of(false))
    );
  }
}
