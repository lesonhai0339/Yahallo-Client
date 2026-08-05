import { Component, Input } from '@angular/core';
import { MangaSumaryDto } from '../../../core/models/manga.interface';

/**
 * Dải "Truyện mới" nằm trên cùng trang chủ, NGOÀI `main-layout` nên chiếm trọn
 * chiều ngang thay vì bị bó trong cột nội dung.
 *
 * Cố ý KHÔNG dùng lại `<app-manga-sumary-card>`: dải này trình bày theo hàng
 * ngang cuộn được, bìa to hơn và ít thông tin phụ hơn thẻ trong lưới. Dùng
 * chung một component rồi ghi đè CSS sẽ khiến mỗi lần sửa thẻ lưới lại vỡ dải này.
 */
@Component({
  selector: 'app-new-manga-strip',
  templateUrl: './new-manga-strip.component.html',
  styleUrls: ['./new-manga-strip.component.scss'],
})
export class NewMangaStripComponent {
  @Input() mangas: MangaSumaryDto[] = [];
  @Input() loading = false;

  /** Số ô khung xương lúc đang tải — khớp số mục server trả về (6). */
  readonly skeletonItems = [1, 2, 3, 4, 5, 6];

  /**
   * Chức năng: Nhãn chương mới nhất cho một truyện.
   * Yêu cầu: `m` là một mục trong `mangas`.
   * Kết quả trả về: chuỗi `Chương N`, hoặc chuỗi rỗng khi truyện chưa có chương
   *   — template dựa vào chuỗi rỗng để ẩn hẳn nhãn thay vì hiện "Chương N/A".
   * Exception: không ném.
   */
  chapterLabel(m: any): string {
    const idx = m?.lastChapterIndex ?? m?.lastestChapter?.index ?? null;
    return idx === null ? '' : `Chương ${idx}`;
  }
}
