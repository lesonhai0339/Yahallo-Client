import { Injectable, Injector } from '@angular/core';
import {
  HttpInterceptor, HttpRequest, HttpHandler,
  HttpEvent, HttpErrorResponse
} from '@angular/common/http';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { catchError, filter, switchMap, take } from 'rxjs/operators';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../services/auth.service';
import { SessionExpiredDialogComponent } from '../../shared/components/session-expired-dialog/session-expired-dialog.component';

/**
 * Middleware auth tập trung cho MỌI request (thay vì check `if (!user)` ở từng
 * method). Bắt 401 và xử lý theo trạng thái phiên:
 *
 *  A. Đang có phiên (đăng nhập nhưng access token hết hạn):
 *     1. Gọi /check-token-expired.
 *     2. Refresh OK → cập nhật sessionId mới → retry request gốc.
 *     3. Refresh vẫn 401 → logout (gửi sessionId) → xóa sessionId → hiện thông báo
 *        "phiên hết hạn, đăng nhập lại?" (Đăng nhập / Hủy).
 *
 *  B. Chưa đăng nhập (không có phiên) mà gọi endpoint cần quyền:
 *     - Request ghi (POST/PUT/DELETE/PATCH) → điều hướng sang /auth/login.
 *     - Request GET (getme lúc bootstrap, đọc dữ liệu) → im lặng, trả lỗi cho caller
 *       (tránh đá khách ra trang login khi họ chỉ đang xem).
 *
 * Chống lặp vô hạn: bỏ qua chính các endpoint auth; refresh chạy một lần cho nhiều
 * request 401 đồng thời (queue qua refreshResult$).
 *
 * Dùng Injector để lấy AuthService lazy → tránh vòng phụ thuộc
 * HttpClient → HTTP_INTERCEPTORS → AuthService → HttpClient.
 */
const AUTH_SKIP = ['/user/login', '/user/check-token-expired', '/user/logout'];

@Injectable()
export class RefreshInterceptor implements HttpInterceptor {
  private isRefreshing = false;
  /** null = đang refresh chưa xong; true = thành công; false = thất bại. */
  private refreshResult$ = new BehaviorSubject<boolean | null>(null);
  private dialogOpen = false;
  private redirecting = false;

  constructor(private injector: Injector) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(req).pipe(
      catchError((err: HttpErrorResponse) => {
        const isAuthCall = AUTH_SKIP.some(u => req.url.includes(u));
        if (err.status !== 401 || isAuthCall) {
          return throwError(() => err);
        }
        const auth = this.injector.get(AuthService);
        // A. Có phiên → refresh access token rồi retry (hoặc hiện dialog nếu refresh fail).
        if (auth.hasSession) {
          return this.handle401(req, next);
        }
        // B. Chưa đăng nhập: chỉ điều hướng login với request ghi; GET để im lặng.
        if (req.method !== 'GET') {
          this.redirectToLogin();
        }
        return throwError(() => err);
      })
    );
  }

  private handle401(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const auth = this.injector.get(AuthService);

    // Đã có một luồng refresh đang chạy → chờ kết quả rồi retry (hoặc bỏ).
    if (this.isRefreshing) {
      return this.refreshResult$.pipe(
        filter(v => v !== null),
        take(1),
        switchMap(ok => ok
          ? next.handle(req.clone({ withCredentials: true }))
          : throwError(() => new HttpErrorResponse({ status: 401, url: req.url }))),
      );
    }

    this.isRefreshing = true;
    this.refreshResult$.next(null);

    return auth.refreshSession().pipe(
      switchMap(() => {
        this.isRefreshing = false;
        this.refreshResult$.next(true);
        return next.handle(req.clone({ withCredentials: true }));
      }),
      catchError((refreshErr: HttpErrorResponse) => {
        this.isRefreshing = false;
        this.refreshResult$.next(false);
        this.onSessionExpired();
        return throwError(() => refreshErr);
      }),
    );
  }

  /** Refresh thất bại: logout best-effort (gửi sessionId) + thông báo đăng nhập lại. */
  private onSessionExpired(): void {
    const auth = this.injector.get(AuthService);
    // logout() tự xóa sessionId + dọn state qua finalize, kể cả khi server trả 401.
    auth.logout().subscribe({ next: () => {}, error: () => {} });

    if (this.dialogOpen) return;
    this.dialogOpen = true;
    const dialog = this.injector.get(MatDialog);
    const router = this.injector.get(Router);

    // setTimeout → tránh mở dialog khi Angular chưa bootstrap xong (401 lúc app init).
    setTimeout(() => {
      dialog.open(SessionExpiredDialogComponent, { disableClose: true, width: '360px' })
        .afterClosed()
        .subscribe(login => {
          this.dialogOpen = false;
          if (login) router.navigate(['/auth/login']);
        });
    });
  }

  /** Khách thao tác cần đăng nhập → nhắc + đưa sang trang login (một lần). */
  private redirectToLogin(): void {
    const router = this.injector.get(Router);
    if (this.redirecting || router.url.startsWith('/auth/login')) return;
    this.redirecting = true;
    this.injector.get(ToastrService).info('Vui lòng đăng nhập để tiếp tục');
    router.navigate(['/auth/login']).finally(() => { this.redirecting = false; });
  }
}
