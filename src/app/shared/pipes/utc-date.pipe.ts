import { Pipe, PipeTransform } from '@angular/core';

/**
 * Chuẩn hoá mốc thời gian UTC từ backend trước khi đưa vào pipe `date`.
 *
 * Backend lưu `DateTime.UtcNow` nhưng chuỗi JSON THIẾU 'Z' (EF trả
 * Kind=Unspecified). Nếu để nguyên, `new Date(...)` và pipe `| date` sẽ hiểu đó là
 * giờ LOCAL → hiển thị lệch đúng bằng offset múi giờ (VN: 7 tiếng).
 * Thêm 'Z' để JS hiểu là UTC rồi tự quy đổi sang giờ khu vực của máy.
 *
 * Dùng: `{{ value | utcDate | date:'dd/MM/yyyy HH:mm' }}`
 *
 * ⚠️ CHỈ dùng cho mốc thời gian THẬT (có giờ). KHÔNG dùng cho field chỉ có ngày
 * (vd ngày sinh): cộng 'Z' vào 00:00 rồi đổi sang múi giờ âm sẽ lùi mất 1 ngày.
 */
@Pipe({ name: 'utcDate' })
export class UtcDatePipe implements PipeTransform {
  transform(value: string | Date | null | undefined): string | Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    const s = String(value);
    const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(s);
    return hasTz ? s : s + 'Z';
  }
}
