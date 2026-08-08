/**
 * Phản chiếu các enum manga của backend (`YAHALLO.Domain/Enums/MangaEnums`,
 * `CountryEnums/CountriesEnum`).
 *
 * ⚠️ Trước đây admin `manga-form` tự chế danh sách lựa chọn không khớp enum thật
 * (Status gửi 'Ongoing', Type gửi 'Manhwa', Level gửi '0', Countries gửi '0'…).
 * Command của backend bind vào enum có kiểu nên những giá trị đó KHÔNG parse
 * được — lưu xong là mất. Mọi nơi cần các trường này phải lấy hằng ở file này,
 * đừng khai báo lại tại chỗ.
 *
 * Sửa enum ở backend thì phải sửa file này cho khớp.
 */

/** `MangaStatus` — tình trạng ra chương. */
export enum MangaStatus {
  Active = 1,
  Paused = 2,
  Finished = 3,
}

/**
 * `MangaType` — hình thức phát hành, KHÔNG phải xuất xứ.
 * Manhwa/Manhua là quốc gia (xem `Countries`), không thuộc enum này.
 */
export enum MangaType {
  Oneshot = 1,
  Ova = 2,
  Dojinshi = 3,
  Series = 4,
}

/**
 * `MangaLevel` — bậc truy cập (cần level tài khoản hoặc coin để mở),
 * KHÔNG phải phân loại độ tuổi. Backend hiện chưa có trường độ tuổi.
 */
export enum MangaLevel {
  Normal = 1,
  Pro = 2,
  Vip = 3,
  Master = 4,
}

/** `CountriesEnum` — mã ISO 3166-1, chỉ liệt kê nước hay dùng cho truyện. */
export enum Countries {
  CN = 46,
  FR = 76,
  HK = 100,
  JP = 112,
  KR = 119,
  TW = 218,
  TH = 221,
  GB = 235,
  US = 236,
  VN = 242,
}

export interface EnumOption<T> {
  value: T;
  label: string;
}

export const MANGA_STATUS_OPTIONS: EnumOption<MangaStatus>[] = [
  { value: MangaStatus.Active, label: 'Đang ra' },
  { value: MangaStatus.Paused, label: 'Tạm ngưng' },
  { value: MangaStatus.Finished, label: 'Hoàn thành' },
];

export const MANGA_TYPE_OPTIONS: EnumOption<MangaType>[] = [
  { value: MangaType.Series, label: 'Nhiều chương' },
  { value: MangaType.Oneshot, label: 'Oneshot' },
  { value: MangaType.Ova, label: 'OVA' },
  { value: MangaType.Dojinshi, label: 'Doujinshi' },
];

export const MANGA_LEVEL_OPTIONS: EnumOption<MangaLevel>[] = [
  { value: MangaLevel.Normal, label: 'Thường (ai cũng đọc được)' },
  { value: MangaLevel.Pro, label: 'Pro (Lv2–Lv4)' },
  { value: MangaLevel.Vip, label: 'VIP (Lv5–Lv7)' },
  { value: MangaLevel.Master, label: 'Master (Lv8–Lv9)' },
];

export const COUNTRY_OPTIONS: EnumOption<Countries>[] = [
  { value: Countries.JP, label: 'Nhật Bản' },
  { value: Countries.KR, label: 'Hàn Quốc' },
  { value: Countries.CN, label: 'Trung Quốc' },
  { value: Countries.VN, label: 'Việt Nam' },
  { value: Countries.TW, label: 'Đài Loan' },
  { value: Countries.HK, label: 'Hồng Kông' },
  { value: Countries.TH, label: 'Thái Lan' },
  { value: Countries.US, label: 'Mỹ' },
  { value: Countries.GB, label: 'Anh' },
  { value: Countries.FR, label: 'Pháp' },
];

/**
 * Chức năng: tra nhãn tiếng Việt của một giá trị enum để hiển thị.
 * Yêu cầu: `options` — bảng lựa chọn tương ứng; `value` — giá trị enum, có thể
 * là số hoặc chuỗi số (API trả về không nhất quán).
 * Kết quả trả về: nhãn khớp, hoặc `null` nếu không tra được.
 * Exception: không ném — giá trị lạ trả `null` để nơi gọi tự quyết hiển thị gì.
 */
export function enumLabel<T extends number>(
  options: EnumOption<T>[],
  value: T | number | string | null | undefined
): string | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (Number.isNaN(num)) return null;
  return options.find(o => o.value === num)?.label ?? null;
}
