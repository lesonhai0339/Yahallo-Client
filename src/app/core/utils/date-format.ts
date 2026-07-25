/**
 * Format mốc thời gian để GỬI LÊN server.
 *
 * Backend validate strict ISO 8601 **kèm offset** ở CẢ HAI đường vào:
 *  - `StrictDateTimeOffsetConverter` → JSON body
 *  - `StrictDateTimeOffsetBinderProvider` (insert ở index 0) → **query / route / form**
 *
 * Nghĩa là mọi datetime gửi lên — kể cả query param — đều phải có offset, nếu
 * không sẽ bị từ chối. Regex server (sau khi sửa) nhận `Z` hoặc offset số:
 *   `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,7})?(Z|[+-]\d{2}:?\d{2})$`
 *
 * Hàm này trả về dạng offset SỐ, ví dụ: `2026-07-20T00:00:00.000+07:00`
 * (giữ được offset thực của người dùng; `Z` cũng hợp lệ nhưng mất thông tin đó).
 *
 * ⚠️ Chuỗi thiếu offset (`2026-07-20`, `2026-07-20T09:30:00`) và chữ `z` thường
 * đều KHÔNG hợp lệ — đừng đưa thẳng giá trị `<input type="date">` lên server.
 */
export function toIsoWithOffset(value: Date | string | null | undefined): string | null {
  if (!value) return null;

  let d: Date;
  if (value instanceof Date) {
    d = value;
  } else {
    const s = String(value).trim();
    // `<input type="date">` trả "yyyy-MM-dd"; `new Date("yyyy-MM-dd")` bị hiểu là
    // UTC midnight → lệch ngày ở múi giờ dương. Dựng midnight LOCAL để giữ đúng
    // ngày người dùng chọn.
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    d = dateOnly
      ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
      : new Date(s);
  }
  if (Number.isNaN(d.getTime())) return null;

  const pad = (n: number, len = 2) => String(Math.abs(n)).padStart(len, '0');
  // getTimezoneOffset() trả số phút CẦN CỘNG để về UTC → đảo dấu mới ra offset thật.
  const offsetMinutes = -d.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const offH = pad(Math.floor(Math.abs(offsetMinutes) / 60));
  const offM = pad(Math.abs(offsetMinutes) % 60);

  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
       + `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
       + `.${pad(d.getMilliseconds(), 3)}${sign}${offH}:${offM}`;
}

/** Mốc thời gian hiện tại, đúng định dạng server yêu cầu. */
export function nowIsoWithOffset(): string {
  return toIsoWithOffset(new Date())!;
}

/**
 * Chuẩn hoá mốc thời gian NHẬN VỀ trước khi hiển thị (chiều ngược lại của
 * `toIsoWithOffset`). Thêm 'Z' nếu chuỗi thiếu offset, để `new Date()` / pipe
 * `date` hiểu là UTC rồi tự đổi sang giờ máy thay vì coi là giờ local.
 *
 * Với DateTimeOffset thì server đã ghi kèm 'Z' nên đây là no-op — giữ lại để
 * dữ liệu cũ (lưu thời `DateTime` Kind=Unspecified) vẫn hiển thị đúng.
 *
 * Dùng ở nơi KHÔNG gọi được `UtcDatePipe` (pipe khai báo trong AppModule nên
 * AdminModule lazy-load không thấy).
 */
export function ensureUtcMarker(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = String(value);
  return /[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z';
}
