/**
 * Quy ước key localStorage theo TỪNG TÀI KHOẢN.
 *
 * Mọi thứ người dùng tự chỉnh (theme, font, nền, tuỳ chọn đọc, vị trí đọc…) phải
 * gắn với user-id, KHÔNG lưu chung một key global. Lưu global gây 2 lỗi:
 *   1. đăng xuất xong dữ liệu vẫn còn và vẫn được áp dụng;
 *   2. tài khoản khác đăng nhập trên cùng máy sẽ thừa hưởng — nặng nhất là
 *      tiến trình đọc bị `sync()` đẩy nhầm lên tài khoản người sau.
 *
 * Ngoại lệ DUY NHẤT là `visitorId` — nó định danh THIẾT BỊ cho khách vãng lai,
 * theo user thì mất luôn ý nghĩa.
 *
 * Pattern này đã có sẵn ở `avatar-frame.service.ts`; file này chỉ gom lại để mọi
 * service dùng chung một cách đặt tên.
 */

/** Scope dùng khi chưa đăng nhập. */
export const GUEST_SCOPE = 'guest';

/**
 * Chức năng: Ghép key localStorage có kèm scope tài khoản.
 * Yêu cầu: `prefix` là tiền tố cố định của service; `userId` lấy từ AuthService,
 *   rỗng/null nghĩa là khách.
 * Kết quả trả về: `"<prefix>:<userId>"`, hoặc `"<prefix>:guest"` khi chưa đăng nhập.
 * Exception: không ném.
 */
export function scopedKey(prefix: string, userId?: string | null): string {
  return `${prefix}:${userId || GUEST_SCOPE}`;
}

/**
 * Chức năng: Xoá key global của bản cũ (nếu còn sót). KHÔNG chuyển dữ liệu sang
 *   tài khoản hiện tại — không có cách nào biết nó vốn của ai, gán bừa là lặp
 *   lại đúng cái lỗi rò rỉ đang muốn sửa.
 * Yêu cầu: `key` là tên key global cũ.
 * Kết quả trả về: không.
 * Exception: không ném.
 */
export function dropLegacyKey(key: string): void {
  try {
    if (localStorage.getItem(key) !== null) localStorage.removeItem(key);
  } catch {
    /* localStorage bị chặn (private mode) → bỏ qua */
  }
}
