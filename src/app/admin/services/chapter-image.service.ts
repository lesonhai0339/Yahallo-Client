import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { from, Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { appendFileUploadInfo, buildChapterPageUploadInfo } from '../../core/utils/file-upload-info';

/**
 * ⚠️ MODULE MỚI THÊM — xem `docs/ADMIN_MODULES_ADDED.md`.
 *
 * Quản lý ảnh của một chương cho trang `/admin/chapter/:chapterId/images`.
 *
 * `getImages()` là API THẬT và chỉ lấy **URL + metadata** (không tải ảnh) — đúng
 * như giao diện đọc truyện; việc tải ảnh thật từ S3 do thẻ <img> làm khi trang
 * quyết định hiển thị (load theo lô 1 / 5 / all / số tuỳ ý).
 *
 * Ba thao tác ghi (xoá / đổi thứ tự / thay ảnh) hiện CHƯA CÓ ENDPOINT — xem chú
 * thích ở từng hàm.
 */

/** Một ảnh vừa được ĐĂNG KÝ ở server, kèm URL để client tự PUT file lên S3. */
export interface CreateChapterImageItem {
  id: string;
  /** Vị trí trang (decimal — server đánh theo thứ tự danh sách gửi lên). */
  index: number;
  uploadUrl: string;
  chapterId: string;
}

export interface ChapterImageMeta {
  id: string;
  index: number;
  /** URL đầy đủ (signed) để hiển thị. */
  url: string;
  resizeUrl?: string;
  width?: number;
  height?: number;
  resizeWidth?: number;
  resizeHeight?: number;
  contentType?: string;
}

@Injectable({ providedIn: 'root' })
export class ChapterImageService {
  private readonly chapterBase = environment.chapterApi;
  private readonly chapterImageBase = environment.chapterImageApi;
  private readonly serviceBase = environment.serviceApi;

  constructor(private http: HttpClient) {}

  /**
   * Chức năng: API THẬT `POST /chapter-image/create` — đăng ký MỘT LOẠT ảnh cho
   *   chương và nhận lại pre-signed URL để client tự PUT file lên S3. Client chỉ
   *   gửi METADATA (FileUploadInfo), không gửi bytes ảnh — giống luồng avatar.
   *   Server đánh `index` theo ĐÚNG THỨ TỰ phần tử trong danh sách gửi lên, nên
   *   `files` phải được sắp theo thứ tự trang trước khi gọi.
   * Yêu cầu: `chapterId` của chương đã tạo; `files` không rỗng, đã lọc hợp lệ.
   * Kết quả trả về: Observable emit mảng `CreateChapterImageItem` đã sắp theo
   *   `index` tăng dần, cùng số lượng và cùng thứ tự với `files`.
   * Exception: emit lỗi HTTP của server (không nuốt) — người gọi phải bắt để báo
   *   cho người dùng biết ảnh chưa được đăng ký.
   */
  createChapterImages(chapterId: string, files: File[]): Observable<CreateChapterImageItem[]> {
    // Đọc kích thước từng ảnh trước (async) rồi mới dựng form một lần.
    const infos$ = from(Promise.all(files.map(f => buildChapterPageUploadInfo(f))));

    return infos$.pipe(
      switchMap(infos => {
        const form = new FormData();
        form.append('ChapterId', chapterId);
        infos.forEach((info, i) => appendFileUploadInfo(form, `FileUploadInfo[${i}]`, info));
        return this.http.post<any>(`${this.chapterImageBase}/create`, form);
      }),
      map(res => {
        const v = res?.value ?? res;
        const raw: any[] = v?.data ?? (Array.isArray(v) ? v : []);
        return raw
          .map((it, i) => ({
            id: it.id,
            index: Number(it.index ?? i + 1),
            uploadUrl: it.uploadUrl ?? it.signedUrl ?? '',
            chapterId: it.chapterId ?? chapterId,
          } as CreateChapterImageItem))
          .sort((a, b) => a.index - b.index);
      }),
    );
  }

  /** API THẬT: `GET /chapter/get-image?ChapterId=` → chỉ URL + metadata. */
  getImages(chapterId: string): Observable<ChapterImageMeta[]> {
    const params = new HttpParams().set('ChapterId', chapterId);
    return this.http.get<any>(`${this.chapterBase}/get-image`, { params }).pipe(
      map(res => {
        const raw: any[] = res?.value ?? res ?? [];
        return raw
          .map((img, i) => ({
            id: img.id,
            index: img.index ?? i + 1,
            url: img.url ?? img.resizeUrl ?? img.cloudUrl ?? '',
            resizeUrl: img.resizeUrl,
            width: img.width,
            height: img.height,
            resizeWidth: img.resizeWidth,
            resizeHeight: img.resizeHeight,
            contentType: img.contentType,
          } as ChapterImageMeta))
          .sort((a, b) => a.index - b.index);
      }),
      catchError(() => of([])),
    );
  }

  /**
   * MOCK — chưa có endpoint xoá 1 ảnh khỏi chương.
   * Gọi thử `DELETE /chapter/delete-image`; nếu backend chưa có thì trả về
   * `{ mocked: true }` để UI báo "đã xoá local, cần API để lưu thật".
   */
  deleteImage(chapterId: string, imageId: string): Observable<{ mocked: boolean }> {
    return this.http.delete(`${this.chapterBase}/delete-image`, { body: { chapterId, imageId } }).pipe(
      map(() => ({ mocked: false })),
      catchError(() => of({ mocked: true })),
    );
  }

  /**
   * MOCK — chưa có endpoint đổi thứ tự.
   * Theo yêu cầu thì chỉ cần "đảo signed url"/đảo index, nên payload là danh sách
   * `{ imageId, index }` theo thứ tự mới. Thử `PUT /chapter/reorder-image`.
   */
  reorderImages(
    chapterId: string, order: { imageId: string; index: number }[],
  ): Observable<{ mocked: boolean }> {
    return this.http.put(`${this.chapterBase}/reorder-image`, { chapterId, order }).pipe(
      map(() => ({ mocked: false })),
      catchError(() => of({ mocked: true })),
    );
  }

  /**
   * Chức năng: BƯỚC 1 của luồng THÊM ảnh mới vào chương — xin signed URL để client
   *   tự PUT lên S3 (cùng cơ chế với thay ảnh, chỉ khác là không xoá ảnh cũ).
   *   `index` là số THẬP PHÂN (server dùng decimal, 2 chữ số sau dấu phẩy) nên có
   *   thể chèn giữa 2 trang mà không phải đánh số lại toàn bộ chương.
   * Yêu cầu: `chapterId` hợp lệ; `index` > 0, tối đa 2 chữ số thập phân;
   *   `fileName` / `contentType` / `fileSize` mô tả ảnh sắp upload.
   * Kết quả trả về: Observable emit `{ fileId, signedUrl, key?, mocked }` —
   *   `mocked: true` nghĩa là backend chưa có endpoint, đang mô phỏng.
   * Exception: không ném — lỗi được `catchError` chuyển thành kết quả mock.
   */
  requestAddUrl(payload: {
    chapterId: string;
    index: number;
    fileName: string;
    contentType: string;
    fileSize: number;
  }): Observable<{ fileId: string; signedUrl: string; key?: string; mocked: boolean }> {
    return this.http.post<any>(`${this.chapterBase}/add-image`, payload).pipe(
      map(res => {
        const v = res?.value ?? res;
        const item = Array.isArray(v) ? v[0] : v;
        if (!item?.signedUrl) throw new Error('Thiếu signedUrl trong response');
        return {
          fileId: item.fileId ?? '',
          signedUrl: item.signedUrl,
          key: item.key,
          mocked: false,
        };
      }),
      catchError(() => of({
        fileId: `mock-add-${payload.index}`,
        signedUrl: `mock-s3://${payload.chapterId}/${payload.fileName}`,
        mocked: true,
      })),
    );
  }

  /**
   * BƯỚC 1 của luồng thay ảnh: xin signed URL.
   *
   * Bản chất "cập nhật ảnh" = **xoá cũ + upload mới**, nên request này khiến
   * SERVER XOÁ ẢNH CŨ rồi trả về signed URL để client tự PUT ảnh mới lên S3.
   * Client KHÔNG gửi bytes ảnh cho server.
   *
   * Luồng đầy đủ (do component điều phối):
   *   requestReplaceUrl() → imageUpload.uploadToS3(signedUrl, file)
   *                       → imageUpload.confirmBatchUploads() | failUploads()
   *
   * ⚠️ Tên/shape endpoint cần xác nhận lại với backend. Hiện gọi
   * `POST /chapter/replace-image`; nếu 404/lỗi thì trả `mocked: true` kèm
   * `signedUrl` giả `mock-s3://` — `uploadToS3` nhận prefix đó và mô phỏng upload,
   * nên UI vẫn chạy trọn luồng để test được.
   */
  requestReplaceUrl(payload: {
    chapterId: string;
    imageId: string;
    fileName: string;
    contentType: string;
    fileSize: number;
  }): Observable<{ fileId: string; signedUrl: string; key?: string; mocked: boolean }> {
    return this.http.post<any>(`${this.chapterBase}/replace-image`, payload).pipe(
      map(res => {
        const v = res?.value ?? res;
        // Server có thể trả 1 object hoặc mảng 1 phần tử (giống presign-upload).
        const item = Array.isArray(v) ? v[0] : v;
        if (!item?.signedUrl) throw new Error('Thiếu signedUrl trong response');
        return {
          fileId: item.fileId ?? payload.imageId,
          signedUrl: item.signedUrl,
          key: item.key,
          mocked: false,
        };
      }),
      catchError(() => of({
        fileId: `mock-${payload.imageId}`,
        signedUrl: `mock-s3://${payload.chapterId}/${payload.fileName}`,
        mocked: true,
      })),
    );
  }
}
