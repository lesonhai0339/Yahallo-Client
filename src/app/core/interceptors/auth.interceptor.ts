import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Auth dùng cookie httpOnly (server đặt). Gửi kèm cookie với mọi request tới
    // API qua withCredentials thay cho header Authorization. (Upload S3 đi qua
    // HttpBackend riêng nên không bị ảnh hưởng.)
    return next.handle(req.clone({ withCredentials: true }));
  }
}
