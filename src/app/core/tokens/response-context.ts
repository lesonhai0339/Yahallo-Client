import { InjectionToken } from '@angular/core';

/**
 * Kênh để component báo ngược mã HTTP cho tầng Express khi render ở server.
 *
 * Phải là **object** chứ không phải số: `useValue` chia sẻ nguyên tham chiếu,
 * nên component ghi `ctx.status = 404` là `server.ts` đọc lại thấy ngay. Nếu
 * dùng giá trị nguyên thuỷ thì component chỉ gán lại biến cục bộ của nó, không
 * có đường nào về tới Express.
 *
 * ⚠️ Phải tạo object MỚI cho từng request trong `server.ts`. Dùng chung một
 * object cho cả tiến trình Node sẽ rò status từ request này sang request khác.
 *
 * Phía trình duyệt token này không được cung cấp — chỗ nào inject phải để
 * `@Optional()`.
 */
export interface ResponseContext {
  status: number;
}

export const RESPONSE_CONTEXT = new InjectionToken<ResponseContext>('RESPONSE_CONTEXT');
