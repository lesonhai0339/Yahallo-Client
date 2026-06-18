export interface Country {
  /** Số thứ tự quốc gia (đồng bộ với CountriesEnum/CountryEntity ở backend) */
  code: number;
  /** Mã ISO 3166-1 alpha-2, vd 'VN' */
  name: string;
  /** Tên tiếng Anh, vd 'Viet Nam' */
  fullName: string;
  /** Tên tiếng Việt, vd 'Việt Nam' */
  vietnameseName: string;
  /** Mã gọi điện thoại quốc tế (không kèm dấu '+'), vd 84 */
  phoneCode: number;
}
