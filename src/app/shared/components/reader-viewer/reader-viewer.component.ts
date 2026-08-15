import {
  Component, Input, Output, EventEmitter,
  ViewChildren, QueryList, ElementRef,
  AfterViewInit, OnDestroy, OnChanges, SimpleChanges, HostListener
} from '@angular/core';
import { Subject } from 'rxjs';
import { ChapterImage } from '../../../core/models/chapter.interface';

/** Cách ảnh lấp khung đọc. */
export type ReaderFitMode = 'width' | 'height' | 'both' | 'original';

@Component({
  selector: 'app-reader-viewer',
  templateUrl: './reader-viewer.component.html',
  styleUrls: ['./reader-viewer.component.scss']
})
export class ReaderViewerComponent implements AfterViewInit, OnDestroy, OnChanges {
  @Input() images: ChapterImage[] = [];
  @Input() initialPage = 0;
  @Input() direction: 'vertical' | 'horizontal' = 'vertical';
  @Input() horizontalDir: 'rtl' | 'ltr' = 'rtl';
  @Input() imageSize = 100;
  @Input() preloadCount = 3;
  /** Ảnh lấp theo chiều rộng / chiều cao / vừa cả hai / cỡ gốc. */
  @Input() fitMode: ReaderFitMode = 'width';
  /** Trang đôi — chỉ có tác dụng ở chế độ ngang (giống sách giấy). */
  @Input() doublePage = false;
  @Output() pageChange = new EventEmitter<number>();

  @ViewChildren('pageRef') pageRefs!: QueryList<ElementRef>;

  currentPage = 0;
  visibleIndices = new Set<number>();

  /**
   * Các trang đang hiện ở chế độ ngang, đã xếp đúng thứ tự nhìn (rtl thì trang
   * nhỏ hơn nằm bên phải). Là field chứ không phải getter: getter trả mảng mới
   * mỗi vòng change-detection sẽ khiến `*ngFor` dựng lại ảnh và nháy màn hình.
   */
  pagePair: number[] = [0];

  /** Chỉ số ảnh tải lỗi — hiện nút thử lại thay cho ảnh. */
  failed = new Set<number>();

  /**
   * Chỉ số ảnh đã tải xong. Chưa nằm trong tập này thì template đè skeleton lên
   * chỗ đã chừa sẵn, thay vì để khoảng trắng.
   */
  loaded = new Set<number>();

  /** Token phá cache cho từng ảnh, tăng mỗi lần bấm thử lại. */
  private retryTokens = new Map<number, number>();

  /**
   * Tỉ lệ đo được từ chính ảnh sau khi tải xong, dùng khi API không trả
   * `width`/`height`. Dữ liệu cũ trên hệ thống đang trả về 0 cho cả hai, nên nếu
   * chỉ trông vào API thì mọi chương cũ đều rơi về tỉ lệ mặc định.
   */
  private measured = new Map<number, string>();

  /** Người dùng đã tự cuộn/vuốt chưa — dùng để biết có được phép chỉnh lại vị trí. */
  private userHasScrolled = false;

  private observer: IntersectionObserver | null = null;
  private visiblePages = new Set<number>();

  /**
   * Mốc thời gian (ms) mà trước đó observer KHÔNG được sửa `currentPage`.
   * Đặt mỗi lần nhảy trang bằng nút/phím: lúc `scrollIntoView` còn đang chạy mượt,
   * các trang trung gian lướt qua khung nhìn sẽ liên tục kéo `currentPage` về giá
   * trị khác, khiến lần bấm kế tiếp tính sai điểm xuất phát.
   */
  private suppressObserverUntil = 0;
  private hasScrolledToInitial = false;
  private destroy$ = new Subject<void>();
  private touchStartX = 0;
  private touchStartY = 0;
  private touchStartTime = 0;
  private readonly SWIPE_THRESHOLD = 50;
  private readonly SWIPE_TIME_LIMIT = 300;

  ngAfterViewInit(): void {
    this.pageRefs.changes.subscribe(() => {
      this.setupObserver();
      this.scrollToInitialIfNeeded();
    });

    if (this.pageRefs.length > 0) {
      this.setupObserver();
      this.scrollToInitialIfNeeded();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['images']) {
      this.hasScrolledToInitial = false;
      this.failed.clear();
      this.loaded.clear();
      this.retryTokens.clear();
      this.measured.clear();
      this.userHasScrolled = false;

      // Đặt `currentPage` về đúng trang cần mở NGAY, trước khi tính cửa sổ tải.
      // Nếu không, `updateVisibleIndices()` bên dưới chạy với `currentPage = 0`:
      // nó tải 4 ảnh đầu chương (không ai xem) còn trang thật sự cần mở thì
      // không có thẻ `<img>` nào — vào thẳng URL trang 62 sẽ thấy skeleton rồi
      // ảnh mới hiện, đúng kiểu nhảy chớp.
      this.currentPage = Math.min(
        Math.max(0, this.initialPage),
        Math.max(0, this.images.length - 1),
      );
    }
    if (changes['preloadCount'] || changes['images'] || changes['direction'] ||
        changes['doublePage'] || changes['horizontalDir']) {
      this.updateVisibleIndices();
    }
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Trang đôi chỉ áp dụng ở chế độ ngang — cuộn dọc mà ghép đôi thì vô nghĩa. */
  get isDouble(): boolean {
    return this.doublePage && this.direction === 'horizontal';
  }

  /** Số trang lật mỗi lần: 2 khi đang xem trang đôi. */
  private get step(): number {
    return this.isDouble ? 2 : 1;
  }

  get canGoPrev(): boolean { return this.currentPage > 0; }

  get canGoNext(): boolean {
    return this.currentPage + this.step <= this.images.length - 1;
  }

  /** Nhãn trang dưới góc ảnh: "3-4" khi xem trang đôi, "3" khi xem đơn. */
  get pageLabel(): string {
    if (!this.isDouble || this.pagePair.length < 2) return String(this.currentPage + 1);
    const nums = this.pagePair.map(p => p + 1).sort((a, b) => a - b);
    return `${nums[0]}-${nums[nums.length - 1]}`;
  }

  /**
   * Chức năng: dựng URL ảnh, kèm token phá cache nếu trang này từng bấm thử lại
   * (không có token thì trình duyệt trả lại đúng bản lỗi trong cache).
   * Yêu cầu: `index` — vị trí ảnh trong `images`.
   * Kết quả trả về: URL đầy đủ; chuỗi rỗng nếu không có ảnh ở vị trí đó.
   * Exception: không ném — index sai trả chuỗi rỗng.
   */
  srcFor(index: number): string {
    const url = this.images[index]?.cloudUrl;
    if (!url) return '';
    const token = this.retryTokens.get(index);
    if (!token) return url;
    return url + (url.includes('?') ? '&' : '?') + '_retry=' + token;
  }

  /**
   * Chức năng: tỉ lệ khung của một trang, để chỗ trống chiếm sẵn ĐÚNG bằng ảnh sẽ
   *   thay thế nó. Không có tỉ lệ thật thì khung giữ chỗ phải đoán một chiều cao
   *   cố định, ảnh thật thường cao gấp 2-3 lần con số đoán — cuộn ngược lên là
   *   trang giật và mất chỗ đang đọc. API trả sẵn `width`/`height` nên không phải
   *   chờ tải ảnh mới biết.
   * Yêu cầu: `index` — vị trí ảnh trong `images`.
   * Kết quả trả về: chuỗi dùng được cho CSS `aspect-ratio` (vd "1000 / 1450");
   *   `null` khi thiếu kích thước — khi đó CSS lùi về tỉ lệ mặc định.
   * Exception: không ném — index sai hoặc số 0/NaN đều trả `null`.
   */
  ratioOf(index: number): string | null {
    const img = this.images[index];
    const w = Number(img?.width);
    const h = Number(img?.height);
    if (w > 0 && h > 0) return `${w} / ${h}`;
    // API không có số đo (dữ liệu cũ trả 0) — dùng số đo được từ lần tải trước.
    return this.measured.get(index) ?? null;
  }

  /**
   * Chức năng: đánh dấu ảnh tải lỗi để template đổi sang khối "thử lại".
   * Yêu cầu: `index` — vị trí ảnh trong `images`.
   * Kết quả trả về: không (thêm vào `failed`).
   * Exception: không ném.
   */
  onImgError(index: number): void {
    this.failed.add(index);
    this.loaded.delete(index);
  }

  /**
   * Chức năng: đánh dấu ảnh đã tải xong để gỡ skeleton đè trên nó.
   * Yêu cầu: `index` — vị trí ảnh; gọi từ sự kiện `load` của `<img>`.
   * Kết quả trả về: không (thêm vào `loaded`).
   * Exception: không ném.
   */
  onImgLoad(index: number, el?: HTMLImageElement): void {
    this.loaded.add(index);

    const w = el?.naturalWidth ?? 0;
    const h = el?.naturalHeight ?? 0;
    if (!w || !h) return;

    const apiHasSize = Number(this.images[index]?.width) > 0;
    if (apiHasSize || this.measured.has(index)) return;

    this.measured.set(index, `${w} / ${h}`);

    // API không có số đo nên khung giữ chỗ lúc nãy dùng tỉ lệ mặc định — chiều
    // cao vừa đổi, vị trí cuộn ban đầu do đó lệch đi. Chỉnh lại đúng MỘT lần,
    // và chỉ khi người đọc chưa tự cuộn (tự ý kéo màn hình của họ là rất khó chịu).
    if (index === this.initialPage && this.hasScrolledToInitial && !this.userHasScrolled) {
      const target = this.pageRefs?.toArray()[index]?.nativeElement;
      target?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
    }
  }

  /** Đánh dấu người dùng đã tự điều khiển màn hình — sau đó không tự cuộn giúp nữa. */
  @HostListener('window:wheel')
  @HostListener('window:touchmove')
  onUserScroll(): void {
    this.userHasScrolled = true;
  }

  /**
   * Ảnh này đã tải xong chưa. Đánh dấu theo CHỈ SỐ chứ không theo thẻ `<img>`:
   * lật qua lật lại thì thẻ bị dựng lại nhưng ảnh đã nằm trong cache trình duyệt,
   * hiện lại skeleton lúc đó chỉ làm nháy màn hình vô ích.
   */
  isLoaded(index: number): boolean {
    return this.loaded.has(index);
  }

  /**
   * Chức năng: tải lại một ảnh lỗi — tăng token phá cache rồi bỏ khỏi `failed`.
   * Yêu cầu: `index` — vị trí ảnh trong `images`.
   * Kết quả trả về: không (cập nhật `retryTokens` và `failed` tại chỗ).
   * Exception: không ném — lỗi lần nữa thì `onImgError` lại đánh dấu.
   */
  retry(index: number): void {
    this.retryTokens.set(index, (this.retryTokens.get(index) ?? 0) + 1);
    this.failed.delete(index);
  }

  private setupObserver(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.visiblePages.clear();

    // Chế độ ngang KHÔNG dùng observer. Ở đó chỉ có đúng MỘT phần tử `#pageRef`
    // và `data-page` của nó đổi theo `currentPage`. Observer chỉ đọc lại thuộc
    // tính đó khi có sự kiện giao cắt, nên `visiblePages` giữ lại số trang cũ:
    // hễ có gì kích hoạt lại observer (bật/tắt toàn màn hình, xoay máy, đổi cỡ)
    // là `Math.min` bốc trúng số cũ và kéo `currentPage` lùi về trang đã qua —
    // biểu hiện đúng như "bấm nút mà không ăn". Lật trang ngang đã tự gán
    // `currentPage` rồi, observer không đóng góp gì thêm.
    if (this.direction === 'horizontal') return;

    this.observer = new IntersectionObserver((entries) => {
      // Đang nhảy trang bằng nút/phím thì bỏ qua, chờ cuộn xong hẵng tính.
      if (Date.now() < this.suppressObserverUntil) return;

      for (const entry of entries) {
        const page = parseInt(entry.target.getAttribute('data-page') || '0', 10);
        if (entry.isIntersecting) {
          this.visiblePages.add(page);
        } else {
          this.visiblePages.delete(page);
        }
      }

      if (this.visiblePages.size > 0) {
        const topPage = Math.min(...this.visiblePages);
        if (topPage !== this.currentPage) {
          this.currentPage = topPage;
          this.pageChange.emit(topPage);
          this.updateVisibleIndices();
        }
      }
    }, {
      // `threshold: 0` = chạm mép là tính. KHÔNG dùng 0.1: ngưỡng đó tính theo
      // phần trăm CHIỀU CAO CỦA CHÍNH ẢNH, nên dải webtoon cao 10.000px trên màn
      // 800px chỉ đạt tối đa 0.08 — không bao giờ vượt 0.1, observer im lặng,
      // `currentPage` đứng yên và tiến trình đọc không được lưu.
      threshold: 0,
      // Chỉ tính là "trang đang đọc" khi nó cắt qua DẢI GIỮA màn hình. Không có
      // dòng này thì với `threshold: 0`, một vệt 1px của trang phía trên còn dính
      // mép khung nhìn cũng bị coi là đang xem, và `Math.min` sẽ chọn nó — bấm
      // "trang sau" xong `currentPage` lại tụt về trang cũ, bấm tiếp vẫn ra đúng
      // đích đó nên trông như nút chết.
      rootMargin: '-45% 0px -45% 0px',
    });

    this.pageRefs.forEach(ref => {
      this.observer!.observe(ref.nativeElement);
    });
  }

  private updateVisibleIndices(): void {
    this.visibleIndices.clear();
    const behind = this.direction === 'horizontal' ? this.preloadCount : 1;
    const start = Math.max(0, this.currentPage - behind);
    const end = Math.min(this.images.length - 1, this.currentPage + this.preloadCount);
    for (let i = start; i <= end; i++) {
      this.visibleIndices.add(i);
    }
    this.rebuildPagePair();
  }

  /**
   * Chức năng: dựng lại danh sách trang đang hiện ở chế độ ngang, xếp đúng thứ
   * tự nhìn — rtl thì trang nhỏ hơn nằm bên phải nên phải đảo mảng.
   * Yêu cầu: `currentPage`, `isDouble`, `horizontalDir` đã ở giá trị mới.
   * Kết quả trả về: không (gán lại `pagePair`).
   * Exception: không ném — hết ảnh thì cặp chỉ còn 1 phần tử.
   */
  private rebuildPagePair(): void {
    const pair = [this.currentPage];
    if (this.isDouble && this.currentPage + 1 <= this.images.length - 1) {
      pair.push(this.currentPage + 1);
    }
    this.pagePair = this.horizontalDir === 'rtl' ? pair.reverse() : pair;
  }

  shouldLoad(index: number): boolean {
    return this.visibleIndices.has(index);
  }

  /**
   * Pages around the current one to warm in the background while in horizontal
   * mode (where only the current page is shown). Excludes the current page,
   * which is already rendered.
   */
  get preloadIndices(): number[] {
    const result: number[] = [];
    this.visibleIndices.forEach(i => {
      if (!this.pagePair.includes(i) && i >= 0 && i < this.images.length) result.push(i);
    });
    return result;
  }

  @HostListener('window:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    const isRtl = this.horizontalDir === 'rtl';
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.goToPage(isRtl ? 'prev' : 'next');
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.goToPage(isRtl ? 'next' : 'prev');
    }
  }

  onTouchStart(event: TouchEvent): void {
    if (event.touches.length !== 1) return;
    this.touchStartX = event.touches[0].clientX;
    this.touchStartY = event.touches[0].clientY;
    this.touchStartTime = Date.now();
  }

  onTouchEnd(event: TouchEvent): void {
    if (event.changedTouches.length !== 1) return;
    const dx = event.changedTouches[0].clientX - this.touchStartX;
    const dy = event.changedTouches[0].clientY - this.touchStartY;
    const dt = Date.now() - this.touchStartTime;

    if (Math.abs(dx) < this.SWIPE_THRESHOLD) return;
    if (Math.abs(dx) < Math.abs(dy)) return;
    if (dt > this.SWIPE_TIME_LIMIT) return;

    const isRtl = this.horizontalDir === 'rtl';
    if (dx > 0) {
      this.goToPage(isRtl ? 'next' : 'prev');
    } else {
      this.goToPage(isRtl ? 'prev' : 'next');
    }
  }

  /**
   * Chức năng: nhảy một bước sang trang trước/sau (nút điều hướng, phím ←/→, vuốt).
   * Yêu cầu: `direction` — chiều nhảy; `step` = 2 khi đang xem trang đôi.
   * Kết quả trả về: không (đổi `currentPage`, phát `pageChange`, và ở chế độ dọc
   *   thì cuộn tới trang đích).
   * Exception: không ném — đã ở đầu/cuối thì kẹp lại, không đi đâu cả.
   */
  goToPage(direction: 'prev' | 'next'): void {
    this.scrollToPage(
      direction === 'prev' ? this.currentPage - this.step : this.currentPage + this.step,
    );
  }

  private scrollToInitialIfNeeded(): void {
    if (this.hasScrolledToInitial || this.initialPage <= 0) return;

    // Horizontal mode shows a single page — jump currentPage to the saved index
    // so neighbours preload around it (same as the preload window).
    if (this.direction === 'horizontal') {
      if (this.images.length === 0) return;
      this.currentPage = Math.min(this.initialPage, this.images.length - 1);
      this.updateVisibleIndices();
      this.pageChange.emit(this.currentPage);
      this.hasScrolledToInitial = true;
      return;
    }

    if (this.pageRefs.length > this.initialPage) {
      const el = this.pageRefs.toArray()[this.initialPage]?.nativeElement;
      if (el) {
        // ĐỒNG BỘ, không bọc `setTimeout`. Hàm này được gọi từ `pageRefs.changes`,
        // tức DOM đã dựng xong nhưng trình duyệt CHƯA vẽ khung nào — cuộn ngay
        // tại đây thì khung đầu tiên vẽ ra đã ở đúng trang. Bọc `setTimeout` là
        // nhường cho nó vẽ ở đầu trang trước rồi mới nhảy, thành ra chớp một cái.
        //
        // Cuộn đúng vị trí được là nhờ khung giữ chỗ đã có `aspect-ratio` thật;
        // hồi còn đoán chiều cao 600px thì có cuộn sớm cũng lệch.
        el.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
        this.hasScrolledToInitial = true;
      }
    }
  }

  /**
   * Chức năng: nhảy tới MỘT ảnh bất kỳ. Đây là cửa duy nhất để đổi trang — nút
   *   điều hướng, phím ←/→, vuốt và danh sách chọn trang ở bottombar đều đi qua
   *   đây, nên hành vi luôn giống nhau.
   * Yêu cầu: `index` — vị trí ảnh 0-based; ngoài khoảng thì tự kẹp về đầu/cuối.
   * Kết quả trả về: không (đổi `currentPage`, phát `pageChange`, và ở chế độ dọc
   *   thì cuộn mượt tới ảnh đó).
   * Exception: không ném — trùng trang đang xem thì thoát sớm, không cuộn lại.
   */
  scrollToPage(index: number): void {
    const target = Math.min(Math.max(0, index), Math.max(0, this.images.length - 1));
    if (target === this.currentPage) return;

    // Gán NGAY, không đợi observer xác nhận. Trước đây nhánh dọc chỉ cuộn rồi để
    // observer cập nhật, nên bấm nhanh hai lần liên tiếp sẽ tính cả hai lần từ
    // cùng một điểm xuất phát cũ — ra cùng một đích, lần bấm thứ hai như mất hút.
    this.currentPage = target;
    this.pageChange.emit(target);
    this.updateVisibleIndices();

    if (this.direction === 'horizontal') return;

    const el = this.pageRefs?.toArray()[target]?.nativeElement;
    if (el) {
      // Khoá observer trong lúc cuộn mượt: các trang lướt qua giữa đường sẽ liên
      // tục ghi đè `currentPage` và làm lần nhảy kế tiếp tính sai điểm xuất phát.
      // 700ms đủ cho một lần `scrollIntoView` mượt; hết hạn là observer tự chạy
      // lại nên không có nguy cơ kẹt vĩnh viễn nếu cuộn bị ngắt giữa chừng.
      this.suppressObserverUntil = Date.now() + 700;
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }
}
