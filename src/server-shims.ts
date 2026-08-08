/**
 * Shim cho các API chỉ có ở trình duyệt, nạp TRƯỚC khi Angular bootstrap phía server.
 *
 * Vì sao cần: rất nhiều service `providedIn: 'root'` của app đọc `localStorage`
 * ngay trong constructor (theme, ngôn ngữ, phiên đăng nhập, tuỳ chọn đọc...).
 * Node không có `localStorage`, nên nếu không có lớp này thì mọi lần render phía
 * server đều ném `ReferenceError` trước khi kịp vẽ gì.
 *
 * Bản shim này CỐ Ý luôn rỗng, không lưu gì: trang render ở server là trang cho
 * khách vãng lai (chưa đăng nhập, theme mặc định). Dữ liệu cá nhân hoá do client
 * nạp lại sau khi hydrate — không được rò trạng thái của request này sang request
 * khác, vì `globalThis` dùng chung cho cả tiến trình Node.
 */
const emptyStorage: Storage = {
  length: 0,
  clear: () => undefined,
  getItem: () => null,
  key: () => null,
  removeItem: () => undefined,
  setItem: () => undefined,
};

const g = globalThis as any;

if (typeof g.localStorage === 'undefined') g.localStorage = emptyStorage;
if (typeof g.sessionStorage === 'undefined') g.sessionStorage = emptyStorage;
