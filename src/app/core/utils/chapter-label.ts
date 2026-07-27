/**
 * Tên hiển thị của một chương.
 *
 * Backend tách số chương thành 2 phần: `index` (chương chính) và `subIndex`
 * (chương chen giữa) — chương 10.5 được lưu là `index: 10`, `subIndex: 5`.
 * Còn `title` là **MÔ TẢ**, được phép rỗng/null, KHÔNG phải tên chương. Vì vậy
 * tên chương luôn phải dựng từ số, không lấy từ `title` (nếu lấy thì mọi chương
 * không có mô tả sẽ hiện ra một dòng trống).
 *
 * Không khai báo dạng pipe vì project không có SharedModule: `AppModule` và
 * `AdminModule` (lazy) là 2 module tách rời, một pipe chỉ được declare ở đúng
 * một module. Component nào cần thì gán `readonly chapterName = chapterName;`
 * rồi gọi trong template.
 */

/** Nguồn tối thiểu để dựng nhãn — hợp mọi kiểu chapter đang dùng trong app. */
export interface ChapterNumberLike {
  index?: number | null;
  subIndex?: number | null;
}

/**
 * Chức năng: Ghép số chương thành chuỗi hiển thị — "10" hoặc "10.5".
 * Yêu cầu: `index` là số chương chính; `subIndex` > 0 mới được ghép vào.
 * Kết quả trả về: chuỗi số chương; `index` không hợp lệ trả về ''.
 * Exception: không ném.
 */
export function chapterNumber(index?: number | null, subIndex?: number | null): string {
  if (index == null || Number.isNaN(Number(index))) return '';
  const sub = Number(subIndex ?? 0);
  return sub > 0 ? `${index}.${sub}` : `${index}`;
}

/**
 * Chức năng: Tên đầy đủ của chương để hiển thị, vd "Chương 10.5".
 * Yêu cầu: `ch` có `index` (và `subIndex` nếu là chương phụ).
 * Kết quả trả về: "Chương {số}"; không có số thì trả về 'Chương' rỗng-an-toàn.
 * Exception: không ném.
 */
export function chapterName(ch: ChapterNumberLike | null | undefined): string {
  const n = chapterNumber(ch?.index, ch?.subIndex);
  return n ? `Chương ${n}` : 'Chương';
}

/**
 * Chức năng: Tên chương kèm mô tả khi có — "Chương 10.5: Hồi kết".
 * Yêu cầu: `title` là mô tả, được phép rỗng/null.
 * Kết quả trả về: chuỗi ghép; không có mô tả thì chỉ còn tên chương.
 * Exception: không ném.
 */
export function chapterFullName(
  ch: (ChapterNumberLike & { title?: string | null }) | null | undefined,
): string {
  const name = chapterName(ch);
  const desc = ch?.title?.trim();
  return desc ? `${name}: ${desc}` : name;
}
