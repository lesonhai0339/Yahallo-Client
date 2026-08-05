# Session: Bật SSR cho các trang public (bản Refactor)

**Date:** 2026-07-31 18:00
**Branch:** dev_agent2
**Model:** claude-opus-5
**Phạm vi:** CHỈ trong `Yahallo-Client-Refactor/`. Bản gốc `Yahallo-Client/` không bị đụng tới.

## Summary

Bật Angular SSR (`@angular/ssr` 17.3.17) cho toàn bộ trang công khai — trang chủ,
chi tiết truyện, đọc truyện, tìm kiếm, top-manga, /latest, /popular, trang tác giả
/hoạ sĩ/thể loại. Khu `/admin` được **loại trừ khỏi SSR** một cách tường minh.
Đã chạy thử server thật và xác nhận HTML trả về có nội dung (không còn shell rỗng).

## Changes

- [CREATE] `src/server-shims.ts` — shim `localStorage`/`sessionStorage` rỗng cho Node
- [CREATE] `src/main.server.ts` — entry server (do `ng add` sinh), thêm import shim
- [CREATE] `src/app/app.module.server.ts` — `AppServerModule` (do `ng add` sinh)
- [CREATE] `server.ts` — Express + `CommonEngine`; thêm nhánh bỏ qua SSR cho `/admin`
- [CREATE] `tsconfig.server.json` — thêm `rootDir: "."`
- [MODIFY] `src/app/app.module.ts` — `provideClientHydration()` (do `ng add` thêm)
- [MODIFY] `angular.json` — thêm target `server`, `serve-ssr`, `prerender`
- [MODIFY] `package.json` — thêm script `dev:ssr`, `serve:ssr`, `build:ssr`, `prerender`
- [FIX] `server.ts` — `import * as express` → `import express` (esModuleInterop)
- [FIX] `src/app/shared/components/pagination/pagination.component.ts` — guard `window`

## Decisions

- **Decision:** Dùng shim `localStorage` rỗng ở tầng Node thay vì bọc
  `isPlatformBrowser` trong ~15 service.
  **Why:** Rất nhiều service `providedIn: 'root'` đọc `localStorage` ngay trong
  constructor (theme, i18n, auth, prefs, reading-progress). Sửa từng cái là 15+ file
  và dễ sót. Shim rỗng cho kết quả đúng về mặt ngữ nghĩa: trang render ở server là
  trang cho **khách vãng lai** — chưa đăng nhập, theme mặc định — còn dữ liệu cá
  nhân hoá do client nạp lại sau khi hydrate.
  **Lưu ý:** shim CỐ Ý không lưu gì. `globalThis` dùng chung cả tiến trình Node nên
  nếu lưu thật sẽ rò trạng thái từ request của người này sang người khác.

- **Decision:** `/admin` và `/admin/*` trả thẳng `index.html`, không qua SSR.
  **Why:** Admin nằm sau đăng nhập nên không cần SEO, lại đụng nhiều API trình
  duyệt. Render nó ở server chỉ tốn CPU và tăng rủi ro.

- **Decision:** Chọn SSR theo request, chưa bật prerender.
  **Why:** Trang chi tiết truyện là route động (`/manga/:id`); prerender cần danh
  sách id lúc build. Target `prerender` đã có sẵn trong `angular.json` (hiện chỉ
  khai báo route `/`), khi nào cần thì bổ sung danh sách route.

- **Decision:** `pagination.component.ts` mặc định `isMobile = false` trên server.
  **Why:** `window.innerWidth` chạy ngay ở field initializer. Không có `window` ở
  Node. Mặc định desktop rồi để constructor + `onResize()` chỉnh lại phía client.

## Bugs Fixed

- **Bug:** `error TS6059: File 'server.ts' is not under rootDir 'src'`
  **Cause:** `tsconfig.json` gốc đặt `rootDir: ./src`, mà `server.ts` nằm ở thư mục gốc.
  **Fix:** `tsconfig.server.json` thêm `"rootDir": "."`.

- **Bug:** `error TS2349: This expression is not callable` tại `express()`
  **Cause:** `ng add` sinh `import * as express from 'express'`, nhưng project bật
  `esModuleInterop` nên namespace import không gọi được.
  **Fix:** đổi sang `import express from 'express'`.

## Kiểm chứng

Chạy `npm run build:ssr` rồi `node dist/yahallo-client-refactor/server/main.js`:

| Route | `<app-root>` | Kết luận |
|---|---|---|
| `/` | 7.247 ký tự | Đã SSR |
| `/latest` | 7.247 ký tự | Đã SSR |
| `/manga/abc-123` | 7.247 ký tự | Đã SSR |
| `/admin` | 0 ký tự | Shell, đúng như thiết kế |
| `/admin/manga` | 0 ký tự | Shell, đúng như thiết kế |

HTML trả về có `<app-header>`, `<app-footer>`, text tiếng Việt thật, và khối
TransferState (`ngh-state`) để client không gọi lại API đã fetch ở server.

## Mock / TODOs

- [ ] **Chưa kiểm chứng với API thật.** Lúc test, API không truy cập được từ máy
      này nên router render ra trang lỗi 503. Cần chạy lại khi
      `environment.prod.ts` trỏ tới API đang sống. **URL API phải truy cập được
      từ tiến trình Node**, không chỉ từ trình duyệt.
- [ ] **Cookie JWT chưa được forward.** `server.ts` chưa chuyển cookie của request
      sang các lệnh gọi API phía server, nên trang SSR luôn ở trạng thái chưa đăng
      nhập. Với trang công khai thì đúng ý; nếu sau này cần SSR phần cá nhân hoá
      thì phải thêm interceptor đọc cookie từ `REQUEST` token.
- [ ] **SignalR chưa được chặn ở server.** `notification.service` chưa bọc
      `isPlatformBrowser`. Hiện chưa gây lỗi vì hub chỉ kết nối sau khi đăng nhập,
      mà server render luôn ở trạng thái đăng xuất — nhưng nên chặn cho chắc.
- [ ] **Prerender** cho trang chi tiết truyện nếu muốn phục vụ từ CDN.
- [ ] Cân nhắc `TransferState` cho `MasterDataService` để bớt một vòng gọi API sau hydrate.

## Notes for Next Session

- Lệnh: `npm run build:ssr` (build cả browser + server), `npm run serve:ssr` (chạy),
  `npm run dev:ssr` (dev có watch).
- Output: `dist/yahallo-client-refactor/browser` (tĩnh) + `dist/yahallo-client-refactor/server/main.js` (Node).
- Deploy: `server.ts` export sẵn hàm `app()` nên chạy được cả dạng serverless
  (Vercel function) lẫn container (ECS). Nếu chạy container trên ECS cạnh API thì
  SSR gọi API qua mạng nội bộ, nhanh hơn hẳn.
- **Sau mỗi lần đổi phiên bản Angular phải xoá `.angular` và `dist` trước khi build** —
  cache không nhận biết việc đổi major, và triệu chứng nó gây ra trông y hệt lỗi CSS.
