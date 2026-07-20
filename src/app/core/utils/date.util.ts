/**
 * Chuyển một thời điểm sang chuỗi ISO-8601 kèm OFFSET múi giờ local — hợp lệ với
 * `DateTimeOffset` bên server (vd `2026-07-20T17:00:00+07:00`).
 *
 * Khác với `Date.toISOString()` (luôn quy về UTC `...Z`), hàm này giữ nguyên
 * giờ theo múi giờ của người dùng và gắn offset tương ứng, nên server không cần
 * nhận thêm tham số TimeZoneOffset riêng.
 *
 * Dùng cho các field DATETIME gửi lên server. KHÔNG dùng cho field date-only
 * (vd ngày sinh) — những field đó vẫn gửi dạng `yyyy-MM-dd`.
 *
 * @returns chuỗi DateTimeOffset, hoặc `null` nếu đầu vào rỗng/không hợp lệ.
 */
export function toDateTimeOffset(
  value: Date | string | number | null | undefined,
): string | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return null;

  const pad = (n: number) => String(n).padStart(2, '0');

  // getTimezoneOffset(): phút, dấu ngược (phía đông UTC là âm) → đảo dấu.
  const tzMinutes = -d.getTimezoneOffset();
  const sign = tzMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(tzMinutes);
  const offset =
    tzMinutes === 0 ? 'Z' : `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;

  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${offset}`
  );
}

/**
 * Alias IANA đã deprecated → tên canonical.
 *
 * Một số bản ICU (đặc biệt trên Windows / V8 build ICU cũ) resolve ra tên legacy
 * trong file `backward` của tz-database (vd `Asia/Saigon` thay vì
 * `Asia/Ho_Chi_Minh`). Nếu server validate theo danh sách IANA canonical thì tên
 * legacy sẽ bị từ chối, nên chuẩn hoá trước khi gửi. Bổ sung thêm khi cần.
 */
const TIMEZONE_ALIASES: Record<string, string> = {
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Europe/Kiev': 'Europe/Kyiv',
};

/**
 * Tên múi giờ IANA **canonical** của trình duyệt (vd `Asia/Ho_Chi_Minh`) — gửi
 * kèm mọi request có khoảng thời gian From/To để server quy đổi/nhóm theo đúng
 * múi giờ người dùng. Fallback về `UTC` nếu môi trường không hỗ trợ.
 */
export function getTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    return TIMEZONE_ALIASES[tz] ?? tz;
  } catch {
    return 'UTC';
  }
}
