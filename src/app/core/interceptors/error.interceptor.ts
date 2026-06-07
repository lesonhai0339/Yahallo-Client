import { Injectable } from '@angular/core';
import {
  HttpInterceptor, HttpRequest, HttpHandler,
  HttpEvent, HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { Router } from '@angular/router';
import { HealthService } from '../services/health.service';

@Injectable()
export class ErrorInterceptor implements HttpInterceptor {
  private checking = false;

  constructor(
    private router: Router,
    private health: HealthService
  ) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (req.url.includes('/hc')) {
      return next.handle(req);
    }

    return next.handle(req).pipe(
      catchError((err: HttpErrorResponse) => {
        if ((err.status === 0 || err.status >= 500) && !this.checking) {
          this.checking = true;
          return this.health.check().pipe(
            switchMap(alive => {
              this.checking = false;
              if (!alive) {
                this.router.navigate(['/server-error']);
              }
              return throwError(() => err);
            })
          );
        }
        return throwError(() => err);
      })
    );
  }
}
