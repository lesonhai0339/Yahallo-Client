# Yahallo-Client — Claude Code Project Guide

> Đây là file hướng dẫn tự động load mỗi khi bắt đầu conversation trong project này.
> Claude phải đọc file này trước khi trả lời bất kỳ câu hỏi nào.

---

## 1. Project Snapshot

| Key | Value |
|-----|-------|
| **App** | `yahallo-client-refactor` — frontend đọc truyện (manga reader) |
| **Framework** | Angular **16.2**, **NgModule** (KHÔNG dùng standalone), TypeScript, RxJS 7.8 |
| **UI** | Bootstrap 5.3 (layout/grid) + Angular Material 16 (table/dialog/menu) + `ngx-toastr` (toast) |
| **Realtime** | SignalR (`@microsoft/signalr` 8) — hub notification tại `/hubs/notification` |
| **Theme** | Dark mặc định, CSS variables (`--bg-primary`, `--accent-primary: #e94560`) — `ThemeService` |
| **i18n** | `vi` / `en` — `TranslationService` + `translate` pipe, file `src/assets/i18n/*.json` |
| **Auth** | JWT qua cookie (`withCredentials`) + user mã hoá AES (`crypto-js`) trong localStorage |
| **Backend** | .NET API cùng cấp: `../Yahallo-API`. Base URL dev `https://localhost:7181` — `src/environments/environment.ts` |
| **Branch chính** | `master` (đang làm trên các nhánh `dev_agent*`) |

### Kiến trúc runtime (cần nhớ)
- **Bootstrap:** `app.module.ts` dùng 2 `APP_INITIALIZER` — `initTranslations` rồi `initAuth` (nạp i18n + phục hồi phiên trước khi app chạy).
- **HTTP interceptor chain (đúng thứ tự):** `AuthInterceptor` → `RefreshInterceptor` (bắt 401 → gọi refresh → retry) → `ErrorInterceptor`. Xem `core/interceptors/`.
- **Cache:** `core/services/cache.service.ts` — `CacheService.get(key, ttlMs, producer)` (Map + `shareReplay`, lỗi không cache) + hằng `CACHE_TTL`. Dùng cho GET ít đổi (homepage, manga-detail, chapters, **user-profile**). Mutation xong nhớ gọi `invalidate(keyOrPrefix)`.
- **Master data:** `MasterDataService` phát `categories$/tags$/authors$/artists$/homepage$` (ReplaySubject) — load 1 lần, share cho header + search.

### Cấu trúc thư mục
```
src/app/
├── core/                    — hạ tầng dùng chung (không phải UI page)
│   ├── guards/              — auth.guard, admin.guard, permission.guard
│   ├── interceptors/        — auth / refresh / error
│   ├── models/              — interfaces.ts, manga/chapter/comment/country/permission
│   ├── services/            — ~24 service (xem mục 1.1)
│   └── utils/               — file-upload-info.ts
├── features/                — TRANG người dùng (routed components)
│   ├── home/                — trang chủ
│   ├── manga/               — manga-detail, manga-reader, manga-search (advanced),
│   │                          top-manga, manga-list, manga-list-page
│   ├── user/                — profile (tabs: info/following/history/frames/downloads/settings),
│   │                          settings, avatar-frames, notifications
│   ├── person/person-detail — trang author / artist / tag (dùng chung, phân biệt qua route data.kind)
│   ├── auth/                — login, register, forgot-password
│   ├── offline-reader/      — đọc offline (đã tải)
│   └── error/               — server-error
├── shared/                  — COMPONENT tái dùng (khai báo/eXport ở SharedModule)
│   ├── components/          — manga-card, manga-sumary-card, entity-detail, comment-section/
│   │                          comment-item/comment-editor, pagination, loading-skeleton,
│   │                          avatar-frame, image-crop-dialog, reader-viewer, download-tray,
│   │                          session-expired-dialog
│   ├── directives/          — image-fallback (appImageFallback)
│   └── pipes/               — translate, format-text
├── Layout/                  — header, footer, sidebar (khung app)
├── admin/                   — panel quản trị, LAZY-LOAD tại /admin (AdminModule)
│   ├── layout/admin-layout
│   ├── pages/               — dashboard, manga-list, manga-form, chapter-list,
│   │                          manga-analytics, user-list, user-analytics, topic-list,
│   │                          taxonomy-list, taxonomy-requests
│   ├── services/            — admin-manga, admin-state, admin, analytics, image-upload, taxonomy
│   └── shared/              — dialog + control riêng của admin (multi-tag-select,
│                              related-manga-selector, các *-dialog)
└── Tool/ · Service/ · Extension/   — CODE CŨ (pre-refactor). Còn vài chỗ dùng
                                       (vd Tool/skeletonscreen, Tool/search). Ưu tiên code
                                       trong core/features/shared; tránh mở rộng thư mục cũ.
```

### 1.1 Services (`core/services/`) — tra nhanh
- **Dữ liệu manga:** `manga.service` (homepage, filter-manga, detail, stats, chapters, images…), `chapter.service`, `tag.service`, `author.service`, `artist.service`, `country.service`, `master-data.service`, `search.service` (suggest cho header).
- **Người dùng & tương tác:** `auth.service`, `user.service` (profile — có cache), `user-interaction.service` (following, notification read…), `user-settings.service`, `user-preferences.service`, `follow-manga.service`, `reading-progress.service`, `comment.service`, `avatar-frame.service`, `permission.service`.
- **Hạ tầng:** `cache.service`, `notification.service` (SignalR hub), `download.service` (tải offline), `theme.service`, `translation.service`, `seo.service`, `health.service`.

### 1.2 Routes chính (`app-routing.module.ts`)
`/` home · `/manga/:id` detail · `/manga/:id/chapter/:chapterId/:chapterIndex` reader · `/search` + `/search/advanced` · `/the-loai/:id` · `/latest` · `/popular` · `/top-manga[/:criterion]` · `/author|artist|tag/:id` (PersonDetail) · `/auth/{login,register,forgot-password}` · `/user/:id/:name[/:tab]` (AuthGuard; tab = info|following|history|frames|downloads|settings|notifications) · `/offline` · `/admin` (lazy) · `**` → home.

> ⚠️ **Lưu ý routing profile:** `user/:id/:name` (tab info) và `user/:id/:name/:tab` là **2 route config khác nhau** → chuyển giữa info và các tab con sẽ **destroy/recreate `ProfileComponent`** (re-fire API). Vì vậy `getProfile` được cache theo id.

---

## 2. Memory & Context Files

Đọc các file này để nắm context của các conversation trước:

| File | Nội dung |
|------|----------|
| `memory/project-overview.md` | Tech stack, conventions, cấu trúc tổng quan |
| `memory/project-admin.md` | Admin module: services, guards, API assumptions |
| `memory/conversation_20260602_admin-module.md` | Session log đầy đủ: admin build, bugs fixed, mock APIs |
| `sessions_chat/*.md` | Các session logs theo thứ tự thời gian |

---

## 3. Conventions bắt buộc

- **Luôn dùng NgModule**, không tạo standalone component
- **Admin components** phải khai báo trong `AdminModule` (`src/app/admin/admin.module.ts`)
- **Services** dùng `providedIn: 'root'` trừ khi có lý do đặc biệt
- **Dropdown items** dùng `mousedown` thay vì `click` để tránh blur race condition
- **Array inputs** cho component phải là property thường, không dùng getter (tránh `ExpressionChangedAfterItHasBeenCheckedError`)
- **`ngModel` trong `[formGroup]`** phải có `[ngModelOptions]="{ standalone: true }"`
- Không tạo file `.md` documentation trừ khi được yêu cầu

### 3.1 Comment cho method — BẮT BUỘC 4 nhánh

Mỗi method (trừ getter/setter một dòng và event handler thuần chuyển tiếp) phải có
comment theo đúng 4 nhánh dưới đây, để người đọc sau — hoặc dev khác — hiểu ngay
mà không phải đọc thân hàm:

```ts
/**
 * Chức năng: <làm gì, và vì sao cần — nếu có lý do không hiển nhiên>
 * Yêu cầu: <từng tham số: ý nghĩa, ràng buộc, đơn vị; state/điều kiện tiên quyết>
 * Kết quả trả về: <trả gì; Observable/Promise thì nói rõ emit gì, có complete không>
 * Exception: <ném/emit lỗi gì, khi nào; hoặc "không ném — trả X khi lỗi">
 */
```

Quy ước:
- Viết bằng **tiếng Việt**, ngắn gọn, không diễn giải lại code từng dòng.
- Method `void` → `Kết quả trả về: không (cập nhật <field> tại chỗ)`.
- Không bao giờ ném lỗi → ghi rõ `Exception: không ném — <hành vi thay thế>`.
- Nhánh nào thực sự không có nội dung thì vẫn giữ dòng và ghi `không`.

### 3.2 Ghi chú chức năng đã làm — BẮT BUỘC

Làm xong một chức năng (hoặc sửa đáng kể một chức năng đã có) → cập nhật ngay
**mục 8. Feature Index** ở cuối file này. Mục đích: cả người lẫn Claude tra được
"chức năng X nằm ở đâu" mà không phải grep lại cả repo mỗi session.

Quy ước ghi:
- **Neo bằng TÊN, không bằng số dòng.** Ghi tên class / method / `@Input` / class
  CSS / path route. Số dòng hỏng ngay ở lần sửa kế tiếp, tên thì grep ra được.
- **Một dòng = một chức năng**, không phải một file. Chức năng trải nhiều file thì
  liệt kê các file trong cùng ô, cách nhau bằng `<br>`.
- **Sửa chức năng cũ → sửa đúng dòng đó**, không thêm dòng trùng.
- Nhóm theo khu vực (trang / module). Thêm mới vào đúng nhóm sẵn có.
- Chỉ ghi chức năng thật sự tra cứu lại được. Đổi màu, sửa chính tả, refactor
  thuần tuý thì bỏ qua — index phồng lên là mất tác dụng.

---

## 4. Mock APIs (chưa có backend — cần implement)

| Endpoint | Method | Mô tả |
|----------|--------|-------|
| `/services/presign-upload` | POST | S3 pre-signed URL cho ảnh chương |
| `/services/confirm-uploads` | POST | Xác nhận upload S3 thành công |
| `/services/fail-uploads` | POST | Đánh dấu upload thất bại |
| `/manga/link-series` | POST | Liên kết các bộ truyện cùng series |
| `/manga/filter-manga` | GET | Cần thêm params `authorName`, `artistName` |

---

## 5. Session Logging — Quy trình bắt buộc

**Khi nào lưu:** Khi user kết thúc conversation (nói "xong", "done", "tạm biệt", "lưu session", hoặc yêu cầu rõ ràng).

**Nơi lưu:** `sessions_chat/<topic>_<YYYYMMDD_HHMM>.md`

**Tên file:** Topic là slug mô tả chủ đề chính, ví dụ:
- `admin-module-build_20260602_1430.md`
- `bugfix-signalr-notification_20260602_1600.md`
- `multi-tag-select-component_20260602_1700.md`

**Format log — dùng template dưới đây:**

```markdown
# Session: <Chủ đề>
**Date:** YYYY-MM-DD HH:MM  
**Branch:** <git branch>  
**Model:** <model đang dùng, vd claude-opus-5>  

## Summary
<!-- 2-3 câu tóm tắt những gì đã làm trong session này -->

## Changes
<!-- Mỗi dòng: [ACTION] path/to/file — lý do ngắn gọn -->
<!-- ACTION: CREATE | MODIFY | DELETE | FIX -->
- [CREATE] src/app/admin/... — ...
- [MODIFY] src/app/app.module.ts — ...

## Decisions
<!-- Các quyết định kỹ thuật quan trọng và lý do -->
- **Decision:** ...  
  **Why:** ...

## Bugs Fixed
<!-- Bug → Root cause → Fix -->
- **Bug:** ...  
  **Cause:** ...  
  **Fix:** ...

## Mock / TODOs
<!-- Những thứ đang mock hoặc cần làm tiếp -->
- [ ] API `POST /...` — cần implement khi backend sẵn sàng
- [ ] ...

## Notes for Next Session
<!-- Context cần nhớ cho conversation tiếp theo -->
- ...
```

---

## 6. Hành động khi bắt đầu conversation

1. Đọc `CLAUDE.md` (file này) ✓
2. User nhắc tới một chức năng đã có → tra **mục 8. Feature Index** trước, đừng grep mò
3. Nếu cần thêm bối cảnh vì sao làm vậy → đọc session log liên quan trong `sessions_chat/`
4. Trả lời theo đúng conventions của project

## 7. Hành động khi kết thúc conversation

1. Xác định topic chính của conversation
2. Tạo file `sessions_chat/<topic>_<datetime>.md` theo format ở mục 5
3. Cập nhật **mục 8. Feature Index** cho các chức năng vừa làm (xem quy ước ở 3.2)
4. Cập nhật `memory/MEMORY.md` nếu có thông tin mới cần lưu dài hạn

---

## 8. Feature Index

Tra "chức năng này nằm ở đâu". Neo là **tên** (class / method / `@Input` / class CSS /
route), không phải số dòng — quy ước ghi ở mục 3.2.

### Giao diện & theme

| Chức năng | File | Neo trong file |
|-----------|------|----------------|
| Theme + ảnh nền + font (lưu theo tài khoản) | `core/services/theme.service.ts` | `THEMES`, `hydrate()`, `applyBackground()`, `setBackgroundCoverMain()` |
| Lớp ảnh nền tuỳ chỉnh + chế độ phủ nội dung | `src/styles.scss` | `body.has-bg-image`, `body.has-bg-image:not(.bg-cover-main)`, `body.has-bg-image.bg-cover-main` |
| Hiệu ứng đổi theme (`ripple` / `none`) | `core/services/theme.service.ts`<br>`src/styles.scss` | `THEME_TRANSITIONS`, `setThemeWithEffect()`, `runRippleTransition()`<br>`::view-transition-old(root)` / `::view-transition-new(root)` |
| Chọn hiệu ứng trong Settings | `features/user/settings/settings.component.{ts,html,scss}` | `selectTransition()`, `.fx-section`, `.fx-card`; i18n `SETTINGS.FX_*` |
| Đồng bộ settings với server (gồm `Transition`) | `core/services/user-settings.service.ts` | `TRANSITION_NAMES`/`TRANSITION_VALUES`, `applyDto()`, `saveWith()` |

### Admin — quản lý truyện

| Chức năng | File | Neo trong file |
|-----------|------|----------------|
| Danh sách truyện (endpoint riêng của admin) | `admin/services/admin-manga.service.ts`<br>`admin/pages/manga-list/manga-list.component.ts` | `getAll()` → `manga/admin/get-all-pagination`<br>`loadData()`, `hasActiveFilter` |
| Lọc / tìm / sắp xếp truyện (server-side) | `admin/services/admin-manga.service.ts`<br>`admin/pages/manga-list/manga-list.component.{ts,html,scss}` | `AdminMangaFilter`, `filter()` → `manga/admin/filter`, `getDetail()`<br>`criteria`/`draft`, `applyFilters()`, `resetFilters()`, `setSort()`, `.filter-panel`, `.sort-chips` |
| Ẩn / hiện truyện (`DisplayMode`, tách khỏi `status`) | `admin/services/admin-manga.service.ts`<br>`admin/pages/manga-list/manga-list.component.{ts,html}` | `DisplayMode`, `updateDisplayMode()` → `manga/update`<br>`isHidden()`, `toggleVisibility()`, `getDisplayModeLabel()` |
| Tạo / sửa truyện | `admin/services/admin-manga.service.ts`<br>`admin/pages/manga-form/manga-form.component.ts` | `create()`, `update()` (Id nằm TRONG form, route `manga/update`)<br>`buildFormData()` |

### Trang tác giả / hoạ sĩ / thể loại

| Chức năng | File | Neo trong file |
|-----------|------|----------------|
| Trang `/author/:id`, `/artist/:id`, `/tag/:id` | `features/person/person-detail/person-detail.component.{ts,html,scss}` | `load()`, `loadMangas()`, `previewSize` (6 truyện), `moreLink`, `.person-panel`, `.hero-skeleton` |
| Container nền riêng (ảnh nền không phủ nội dung) | `features/person/person-detail/person-detail.component.scss`<br>`src/styles.scss` | `.person-panel`<br>`.person-page .person-panel` trong khối `bg-cover-main` |
| Khối info + danh sách truyện (dùng chung với search) | `shared/components/entity-detail/entity-detail.component.{ts,html,scss}` | `@Input splitHeight` / `moreLink` / `showViewToggle`, `:host(.entity-detail--split)`, `.person-hero`, `.person-works` |
| Chuyển lưới / danh sách + skeleton theo chế độ | `shared/components/entity-detail/entity-detail.component.{ts,html,scss}` | `viewMode`, `setViewMode()`, `buildRows()`, `skeletonItems`, `.manga-list`, `.row-skeletons` |
| Trang "xem thêm" — danh sách đầy đủ theo đối tượng | `app-routing.module.ts`<br>`features/manga/manga-list-page/manga-list-page.component.ts`<br>`core/services/manga.service.ts` | route `author\|artist\|tag/:id/manga`<br>`ListMode`, `isEntityMode`, `loadEntityName()`, `backLink`<br>`getSortedPaginated(..., filters)` |
