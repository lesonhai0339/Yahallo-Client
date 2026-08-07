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
| Báo cáo bình luận | POST | Chưa có endpoint. Nút "Báo cáo" ở `manga-info` (`reportComment()`) mới chỉ hiện toast |

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

### Admin — khung xương (skeleton) & responsive

| Chức năng | File | Neo trong file |
|-----------|------|----------------|
| Bộ skeleton dùng chung của admin — 4 component, phủ mọi trang `/admin/*` | `admin/shared/table-skeleton/`<br>`admin/shared/detail-card-skeleton/`<br>`admin/shared/interaction-skeleton/`<br>`admin/shared/analytics-skeleton/`<br>`admin/shared/form-skeleton/` | `TableSkeletonComponent` (`variant` table/card, `leading` none/cover/avatar) — danh sách, bảng, panel chi tiết<br>`DetailCardSkeletonComponent` (`variant` cover/avatar) — thẻ chi tiết cột phải<br>`InteractionSkeletonComponent` (`variant` follow/comment) — khối follow/comment ở `manga-info`<br>`AnalyticsSkeletonComponent` (`statRows`/`stats`/`charts`/`chartCols`/`bars`) — trang thống kê + biểu đồ dashboard<br>`FormSkeletonComponent` (`sections`/`fields`) — form 2 cột `manga-form`<br>Tất cả dùng class `.skeleton` toàn cục ở `styles.scss`, mỗi component tự có `@media` riêng |
| Bảng chương ẩn sau `*ngIf` lúc hiện skeleton → phải nối lại `MatSort` | `admin/pages/chapter-list/chapter-list.component.ts` | setter `@ViewChild(MatSort) set sortRef()` — `ngAfterViewInit` chạy khi bảng chưa render nên gán `dataSource.sort` ở đó là mất sort; `mat-paginator` nằm ngoài `*ngIf` nên vẫn gán trong `ngAfterViewInit` |
| Biểu đồ dashboard có cờ loading riêng khỏi thẻ thống kê | `admin/pages/dashboard/dashboard.component.{ts,html}` | `chartsLoading` — bật lại mỗi lần `loadCharts()` (đổi range cũng nạp lại) |
| Thẻ thông tin truyện ở cột phải trang chương nạp riêng | `admin/pages/chapter-list/chapter-list.component.{ts,html}` | `mangaLoading` — trước đây `*ngIf="manga"` nên cột phải trống trơn lúc chờ |
| Responsive cho 2 trang admin chưa có breakpoint | `admin/pages/topic-list/topic-list.component.scss`<br>`admin/pages/taxonomy-requests/taxonomy-requests.component.scss` | `topic-list`: 1024px bỏ lưới 2 cột + bỏ `sticky` của `.page-detail`; 768px `.category-bar` cuộn ngang<br>`taxonomy-requests`: 768px `.req-card` xếp dọc, `.r-btn` trải hết chiều ngang |

### Admin — quản lý truyện

| Chức năng | File | Neo trong file |
|-----------|------|----------------|
| Danh sách truyện (endpoint riêng của admin) | `admin/services/admin-manga.service.ts`<br>`admin/pages/manga-list/manga-list.component.ts` | `getAll()` → `manga/admin/get-all-pagination`<br>`loadData()`, `hasActiveFilter` |
| Lọc truyện theo chủ sở hữu | `admin/services/admin-manga.service.ts` | `AdminMangaFilter.ownerId` → gửi lên là **`UserId`**, KHÔNG phải `OwnerId` — sai tên thì backend bỏ qua và trả về toàn bộ truyện, không báo lỗi |
| Lọc / tìm / sắp xếp truyện (server-side) | `admin/services/admin-manga.service.ts`<br>`admin/pages/manga-list/manga-list.component.{ts,html,scss}` | `AdminMangaFilter`, `filter()` → `manga/admin/filter`, `getDetail()`<br>`criteria`/`draft`, `applyFilters()`, `resetFilters()`, `setSort()`, `syncColumns()`, `.filter-panel`, `.sort-chips` |
| Ẩn / hiện truyện (`DisplayMode`, tách khỏi `status`) | `admin/services/admin-manga.service.ts`<br>`admin/pages/manga-list/manga-list.component.{ts,html}` | `DisplayMode`, `updateDisplayMode()` → `manga/update`<br>`isHidden()`, `toggleVisibility()`, `getDisplayModeLabel()` |
| Danh sách truyện dạng thẻ, đổi được lưới / danh sách (bỏ `mat-table`) | `admin/pages/manga-list/manga-list.component.{ts,html,scss}` | `items` (mảng thường, thay `MatTableDataSource`), `goPage()`/`setPageSize()`/`totalPages` (thay `mat-paginator`), `goInfo()`, `viewMode`/`setViewMode()`, `filterByTag()`<br>`.mgrid` / `.mgrid--list`, `.mtile__main` (bìa + info) và `.mtile__actions` (hàng nút dưới, `border-top` ngăn cách), `.view-toggle`, `.pager`<br>nhận `?tagIds=` từ query param lúc `ngOnInit` (bấm tag ở `manga-info` dẫn sang) |
| Trang thông tin một truyện (không phải form sửa) | `admin/pages/manga-info/manga-info.component.{ts,html,scss}`<br>`admin/admin-routing.module.ts` | `load()` (qua `AdminMangaService.getDetail`), `loadStats()` (qua `/manga/status`), `goBack()` dùng `Location.back()` để giữ trang + bộ lọc<br>route `manga/:id/info` — phải đứng TRƯỚC `manga`<br>`getDetail()` trả DỮ LIỆU THÔ (`displayName`/`mangaThumbnail`/`totalView`/`owner{}`/`mode`) — phải quy đổi tên field, khác `manga-list` đã map sẵn<br>số bình luận lấy từ `totalComment` của payload admin, KHÔNG phải `/manga/status` |
| Quay lại từ form sửa / danh sách chương / thống kê → về `manga-info` | `admin/pages/manga-form/manga-form.component.ts`<br>`admin/pages/chapter-list/chapter-list.component.ts`<br>`admin/pages/manga-analytics/manga-analytics.component.ts` | `backToOrigin()` — lưu xong hoặc huỷ đều về `manga/:id/info`, tạo mới thì về info của truyện vừa tạo<br>`goBack()` ở hai trang còn lại; không có id mới về danh sách |
| Danh sách người dùng dạng thẻ (bỏ `mat-table`) | `admin/pages/user-list/user-list.component.{ts,html,scss}`<br>`admin/services/admin.service.ts` | `items`/`visibleUsers` (lọc tại chỗ), `viewMode`, `goPage()`/`setPageSize()`, `goProfile()` (nút "Truyện đã tạo" đã bỏ — vào hồ sơ là thấy)<br>`getAllUsers()` → **`user/admin/get-all-pagination`** (AdminUserDto: `roles`/`status`/`level`; bản công khai không có)<br>`.ugrid` / `.ugrid--list`, `.utile__actions` (cao cố định, neo đáy), `.role-chip` |
| Lưới truyện trong trang chi tiết (user / tag): 8 cột, đổi lưới-danh sách, nhảy trang | `admin/pages/user-profile/user-profile.component.{ts,html,scss}`<br>`admin/pages/tag-info/tag-info.component.{ts,html,scss}` | `pageSize = 16` = 2 hàng × 8 cột; `.manga-grid` CỐ ĐỊNH số cột (không `auto-fill`) nên mới lấp đúng 2 hàng<br>`viewMode`/`setViewMode()`, `.manga-grid--list`<br>`jumpTo`/`jumpToPage()` — ô nhập là `type="text"` + `inputmode="numeric"` (không dùng `number` vì có nút tăng/giảm); người dùng đếm từ 1, nội bộ từ 0 |
| Trang thông tin thể loại / tác giả / hoạ sĩ + truyện liên quan | `admin/pages/taxonomy-info/taxonomy-info.component.{ts,html,scss}`<br>`admin/pages/taxonomy-list/taxonomy-list.component.{ts,html,scss}`<br>`admin/admin-routing.module.ts` | `TaxonomyInfoComponent` — MỘT component cho cả 3 loại, phân biệt qua `route.data.kind`<br>`loadEntity()` (tag → `getTagInfo`; author/artist → `filter({id})` rồi lấy phần tử đầu, nhận cả `depscription` viết sai của backend)<br>`loadMangas()` đổi tham số theo kind: `tagIds` / `authorId` / `artistId`<br>route `tags/:id`, `authors/:id`, `artists/:id`<br>`taxonomy-list.goInfo()` + `.tax-name-link`; chip thể loại ở `manga-list`/`manga-info` cũng dẫn vào đây |
| Hồ sơ người dùng + truyện đã đăng | `admin/pages/user-profile/user-profile.component.{ts,html,scss}`<br>`admin/admin-routing.module.ts` | `loadUser()`, `loadMangas()` (lọc `ownerId`), `goManga()`<br>route `users/:id` (phải đứng TRƯỚC `users`) |
| Danh sách chương (endpoint riêng của admin) | `admin/services/admin-manga.service.ts`<br>`admin/pages/chapter-list/chapter-list.component.ts` | `getChapters()` → **`chapter/admin/filter`** (AdminFilterChapterQuery: `Index`/`MangaName`/`SortBy`/`ReverseSort`/`IsDeleted`)<br>`MangaId` **bắt buộc** — thiếu thì backend chặn (không có nó là query toàn site)<br>`loadChapters()` chuẩn hoá `subIndex ?? 0` — server trả `null` cho chương thường |
| Người theo dõi + bình luận của một truyện (khối xổ tại chỗ) | `admin/services/admin-interaction.service.ts`<br>`admin/pages/manga-info/manga-info.component.{ts,html,scss}` | `getFollows()` → `follow-manga/admin/filter`; `getComments()` → `comment/admin/filter`<br>`toggleFollows()`/`toggleComments()` — nạp LƯỜI, chỉ gọi API ở lần mở đầu tiên<br>`.drawer`, `.ilist`; bình luận có chương thì hiện chip chương<br>`InteractionSkeletonComponent` (`variant` follow/comment); chiều cao cố định: `.ilist__row` có `min-height`, `fillerRows()` chèn dòng trống cho đủ `pageSize`, nội dung bình luận cắt 2 dòng<br>`followFilter`/`commentFilter` — lọc theo user/chương/khoảng ngày/thứ tự/đã xoá; `mangaId` LUÔN ghim theo truyện đang mở, không cho đổi<br>`AdminFollowDto`: avatar ở `userAvatar`, `initials()` chỉ là dự phòng; đã bỏ `lastUpdate`, nay là `createDate`/`updateDate`/`deleteDate` |
| Tạo / sửa truyện | `admin/services/admin-manga.service.ts`<br>`admin/pages/manga-form/manga-form.component.ts` | `create()`, `update()` (Id nằm TRONG form, route `manga/update`)<br>`buildFormData()` |

### Trang tác giả / hoạ sĩ / thể loại

| Chức năng | File | Neo trong file |
|-----------|------|----------------|
| Trang `/author/:id`, `/artist/:id`, `/tag/:id` | `features/person/person-detail/person-detail.component.{ts,html,scss}` | `load()`, `loadMangas()`, `previewSize` (6 truyện), `moreLink`, `.person-panel`, `.hero-skeleton` |
| Container nền riêng (ảnh nền không phủ nội dung) | `features/person/person-detail/person-detail.component.scss`<br>`src/styles.scss` | `.person-panel`<br>`.person-page .person-panel` trong khối `bg-cover-main` |
| Khối info + danh sách truyện (dùng chung với search) | `shared/components/entity-detail/entity-detail.component.{ts,html,scss}` | `@Input splitHeight` / `moreLink` / `showViewToggle`, `:host(.entity-detail--split)`, `.person-hero`, `.person-works` |
| Chuyển lưới / danh sách + skeleton theo chế độ | `shared/components/entity-detail/entity-detail.component.{ts,html,scss}` | `viewMode`, `setViewMode()`, `buildRows()`, `skeletonItems`, `.manga-list`, `.row-skeletons` |
| Trang "xem thêm" — danh sách đầy đủ theo đối tượng | `app-routing.module.ts`<br>`features/manga/manga-list-page/manga-list-page.component.ts`<br>`core/services/manga.service.ts` | route `author\|artist\|tag/:id/manga`<br>`ListMode`, `isEntityMode`, `loadEntityName()`, `backLink`<br>`getSortedPaginated(..., filters)` |

### Trang chủ

| Chức năng | File | Neo trong file |
|-----------|------|----------------|
| Dải "Truyện mới" (đầu trang, 6 mục, cuộn ngang) | `features/home/new-manga-strip/new-manga-strip.component.{ts,html,scss}`<br>`features/home/home.component.{ts,html}`<br>`core/models/manga.interface.ts` | `NewMangaStripComponent` — `@Input mangas`/`loading`, `.new-strip__rail` (một hàng, cuộn ngang), markup RIÊNG không dùng `.manga-card`<br>đặt NGOÀI `.main-layout` để chiếm trọn chiều ngang; `newManga` lấy từ `homepage.newManga`, **không** gọi API riêng<br>`HomepageDto.newManga`; i18n `HOME.NEW_MANGA`; đã bỏ hẳn khối gợi ý (`HOME.RECOMMENDED`, `getRecommendedForUser`) |
| Nút chương trên thẻ truyện — ẩn khi chưa có chương | `shared/components/manga-sumary-card/manga-sumary-card.component.{ts,html}` | getter `latestChapterIndex` (trả `null`, KHÔNG phải `0`, khi chưa có chương) → `*ngIf` ẩn nút thay vì hiện "Chương N/A" |

### Trang đọc truyện

| Chức năng | File | Neo trong file |
|-----------|------|----------------|
| Chương không tồn tại → trang 404 + mã HTTP 404 | `features/manga/manga-reader/manga-reader.component.{ts,html}` | `notFound`, `markNotFound()` — ghi `RESPONSE_CONTEXT`<br>`loadImages()` bắt `error` 404 **và** `imgs` rỗng; `loadChapters()` phải kiểm ở nhánh `next` vì `filter-chapter` trả 200 + mảng rỗng<br>`<app-error-page>` thay cả cột đọc; ẩn viewer/bottombar/skeleton |
| Kẹp số trang trong URL vào khoảng ảnh thật | `features/manga/manga-reader/manga-reader.component.ts` | `clampInitialPage()` — gọi SAU khi ảnh về (trước đó chưa biết chương có bao nhiêu ảnh); dùng `location.replaceState` để không thêm mục vào lịch sử<br>`ngOnInit` chặn sẵn giá trị âm / không phải số |
| Tên truyện cho `<title>` trang đọc | `core/services/manga.service.ts`<br>`core/models/interfaces.ts`<br>`features/manga/manga-reader/manga-reader.component.ts` | `getChapters()` map thêm `mangaName` (API `filter-chapter` trả sẵn)<br>`Chapter.mangaName?`<br>`loadChapters()` — route KHÔNG có param `:name`, lấy tên từ chapter |

### SSR (chỉ có ở bản Refactor)

| Chức năng | File | Neo trong file |
|-----------|------|----------------|
| SSR cho trang public, bỏ qua `/admin` | `server.ts`<br>`src/main.server.ts`<br>`src/app/app.module.server.ts` | `app()`, nhánh `server.get('/admin*')`<br>import `./server-shims`<br>`AppServerModule` |
| Shim API trình duyệt phía Node | `src/server-shims.ts` | `emptyStorage` — `localStorage`/`sessionStorage` rỗng, KHÔNG lưu gì |
| Guard API trình duyệt để SSR không bị ngắt giữa chừng | `core/services/theme.service.ts`<br>`shared/components/manga-sumary-card/…component.ts`<br>`features/home/home.component.ts`<br>`shared/components/pagination/…component.ts` | `isBrowser` → `apply()`, `applyFont()`, `applyBackground()`<br>`ngAfterViewInit()` — `requestAnimationFrame`/`ResizeObserver`<br>`ngOnInit()` — `window.innerWidth`<br>`isPlatformBrowser` trong constructor + `onResize()` |
| Hydration + TransferState | `src/app/app.module.ts` | `provideClientHydration()` |
| Trang lỗi dùng chung + trả đúng mã HTTP (404 / 503) | `features/error/error-page.component.ts`<br>`core/tokens/response-context.ts`<br>`app-routing.module.ts`<br>`server.ts` | `ErrorPageComponent` — nội dung theo thứ tự `@Input()` → `route.data` → mặc định, chốt trong `ngOnInit()`; `@Input showRetry` để tắt nút "Thử lại" khi lỗi 404<br>Nhúng được vào trang khác: `<app-error-page code="404" …>` (giữ nguyên URL, không điều hướng)<br>`RESPONSE_CONTEXT` — object chia sẻ tham chiếu, tạo mới MỖI request<br>route `server-error` (503) và `**` (404, dùng `component:` chứ KHÔNG `redirectTo`)<br>`res.status(responseContext.status)` |
| Lệnh build/chạy | `package.json` | `build:ssr`, `serve:ssr`, `dev:ssr`, `prerender` |
| Chạy SSR local qua HTTPS + cert dev (dev-only) | `scripts/with-dev-cert.js`<br>`angular.json`<br>`DEV-ONLY.md` | `ensureCert()`, `NODE_EXTRA_CA_CERTS`<br>`serve-ssr` → `options.ssl`/`sslCert`/`sslKey`/`port: 4200`<br>hướng dẫn gỡ trước khi lên production |

> Chi tiết quyết định và việc còn tồn: `sessions_chat/ssr-public-pages_20260731_1800.md`

---

## 9. Script chẩn đoán (PowerShell / shell) — tra nhanh

Các lệnh đã dùng thật để gỡ lỗi trong project này. Chép lại để lần sau khỏi mò.
**Không phải file trong repo** — dán thẳng vào terminal khi cần.

> Quy ước: PowerShell là shell chính trên máy dev. Vài lệnh dưới đây là `curl` /
> `node -e` vì chúng chẩn đoán TLS và HTTP, PowerShell không tiện bằng.

### 9.1 Chứng chỉ (cert)

| Việc | Lệnh | Dùng khi |
|---|---|---|
| Xem cert dev còn hạn / đã trust chưa | `dotnet dev-certs https --check --trust` | Nghi cert hết hạn hoặc chưa cài |
| Tìm cert nằm ở store nào | xem 9.1.a | Cần biết Windows lưu cert ở đâu |
| Export **chỉ phần public** ra PEM | xem 9.1.b | Làm `NODE_EXTRA_CA_CERTS`, không đụng private key |
| Export **cả cặp** PEM + KEY | `dotnet dev-certs https --export-path .certs\aspnet-dev-cert.pem --format PEM --no-password` | Cần `sslCert`+`sslKey` cho dev server HTTPS |

**9.1.a — Cert `CN=localhost` nằm ở store nào**

Chức năng: quét 4 store hay dùng, in ra store nào có cert và có kèm private key
không. `My` = bản Kestrel dùng để phục vụ TLS (có key); `Root` = bản đánh dấu
tin cậy (không key). Thiếu ở `Root` thì trình duyệt sẽ báo cert không hợp lệ.

```powershell
$tp = 'FA68EE2B722E69FBC328ECF64C29BA96A8CE7E06'   # đổi thumbprint nếu cert được tạo lại
foreach ($s in @('Cert:\CurrentUser\My','Cert:\CurrentUser\Root','Cert:\LocalMachine\My','Cert:\LocalMachine\Root')) {
    $c = Get-ChildItem $s -ErrorAction SilentlyContinue | Where-Object { $_.Thumbprint -eq $tp }
    if ($c) { "{0,-28} FOUND  HasPrivateKey={1}  NotAfter={2}" -f $s, $c.HasPrivateKey, $c.NotAfter }
    else    { "{0,-28} -" -f $s }
}
```

**9.1.b — Export phần public ra PEM (an toàn hơn `dotnet dev-certs`)**

Chức năng: ghi ra file PEM chỉ chứa cert công khai. Khác với
`dotnet dev-certs ... --no-password` vốn xuất kèm file `.key` chứa private key —
dùng cách này khi chỉ cần *tin cậy* cert, không cần *phục vụ* TLS.

```powershell
$c = Get-ChildItem Cert:\CurrentUser\Root | Where-Object { $_.Subject -eq 'CN=localhost' } | Select-Object -First 1
$pem = "-----BEGIN CERTIFICATE-----`n" +
       [Convert]::ToBase64String($c.RawData, 'InsertLineBreaks') +
       "`n-----END CERTIFICATE-----"
$pem | Out-File .certs\aspnet-dev-cert.pem -Encoding ascii
```

### 9.2 Cổng và tiến trình

**9.2.a — Ai đang giữ cổng 4200/4201**

Chức năng: tìm PID đang LISTENING trên dải cổng dev, rồi in ra dòng lệnh đầy đủ
và thời điểm khởi động của từng tiến trình. Dùng khi `dev:ssr` tự nhảy sang cổng
khác (dấu hiệu có tiến trình cũ còn sống) — chạy sai cổng là CORS chặn sạch.

```powershell
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 4200,4201,4000 } |
    Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
        $p = Get-CimInstance Win32_Process -Filter "ProcessId = $_"
        "PID $($p.ProcessId) | start $($p.CreationDate)"
        "  $($p.CommandLine)"
    }
```

Tắt tiến trình cũ: `Stop-Process -Id <PID> -Force`

### 9.3 Mạng — TLS, CORS, API

**9.3.a — Node có tin cert của một host không**

Chức năng: bắt tay TLS rồi in cả chuỗi chứng chỉ (leaf → trung gian → root) và
kết quả `authorized`. Phân biệt được "API chết" với "Node không tin cert" — hai
lỗi trông giống nhau ở tầng ứng dụng nhưng cách chữa khác hẳn.

```powershell
node -e "const t=require('tls');const s=t.connect({host:'api.yahallo.online',port:443,servername:'api.yahallo.online'},()=>{let c=s.getPeerCertificate(true),d=0,seen=new Set();while(c&&!seen.has(c.fingerprint)){seen.add(c.fingerprint);console.log('depth '+d+': '+(c.subject.CN||'?')+'  <- '+(c.issuer.CN||'?'));c=c.issuerCertificate;d++;}console.log('authorized:',s.authorized);s.end();});s.on('error',e=>console.log('ERR',e.message));"
```

Đổi `host`/`port` thành `localhost` / `7181` để soi API local.

**9.3.b — Kiểm tra `NODE_EXTRA_CA_CERTS` có ăn không**

Chức năng: gọi thử API bằng chính cơ chế `fetch` mà Angular SSR dùng. Ra HTTP 200
là Node đã tin cert; ra `DEPTH_ZERO_SELF_SIGNED_CERT` là chưa.

```powershell
$env:NODE_EXTRA_CA_CERTS = "$PWD\.certs\aspnet-dev-cert.pem"
node -e "fetch('https://localhost:7181/hc').then(r=>console.log('HTTP',r.status)).catch(e=>console.log('LOI',(e.cause&&e.cause.code)||e.message))"
```

**9.3.c — Origin nào được CORS cho phép**

Chức năng: gửi thử header `Origin` rồi xem API có trả `Access-Control-Allow-Origin`
không. Không có header = trình duyệt sẽ chặn, dù `curl` vẫn nhận được body.
Nhớ: origin gồm **cả scheme**, `http://` và `https://` là hai origin khác nhau.

```powershell
foreach ($o in @('https://localhost:4200','http://localhost:4200','https://localhost:4201')) {
    $h = curl.exe -s -i https://localhost:7181/hc -H "Origin: $o" --max-time 10 |
         Select-String -Pattern 'access-control-allow-origin'
    "{0,-26} {1}" -f $o, $(if ($h) { $h.Line.Trim() } else { '(bi chan)' })
}
```

### 9.4 Đo chất lượng SSR

**9.4.a — Route nào thực sự SSR ra dữ liệu**

Chức năng: tải HTML thô của từng route rồi đếm nội dung **bên trong `<app-root>`**
— số thẻ truyện, số khối skeleton, có phải trang `server-error` không. Phân biệt
"SSR ra dữ liệu thật" với "SSR ra khung loading" và "SSR ra trang lỗi".

```powershell
$routes = '/', '/latest', '/popular', '/top-manga'
foreach ($r in $routes) {
    $html = curl.exe -s "https://localhost:4200$r" --max-time 120
    $inner = [regex]::Match($html, '(?s)<app-root[^>]*>(.*?)</app-root>').Groups[1].Value
    $body  = ($inner -split '</app-header>')[-1]
    $cards = [regex]::Matches($body, 'app-manga-sumary-card').Count / 2
    $skel  = [regex]::Matches($body, 'skeleton').Count
    $state = if ($inner -match 'app-server-error') { 'TRANG 503' }
             elseif ($cards -gt 0) { 'CO DU LIEU' } elseif ($skel -gt 0) { 'CHI SKELETON' } else { 'khong ro' }
    "{0,-14} {1,7} ky tu | the:{2,3} | skeleton:{3,4} | {4}" -f $r, $inner.Length, $cards, $skel, $state
}
```

**9.4.b — Ba cái bẫy khi kiểm tra SSR bằng trình duyệt**

Cả ba đều dẫn tới kết luận "SSR không chạy" trong khi nó chạy bình thường.

| Bẫy | Vì sao sai | Làm đúng |
|---|---|---|
| Xem tab **Elements** của DevTools | Elements hiển thị DOM *sau khi hydrate*, không phải HTML server gửi | Ctrl+U (View Source) hoặc `curl` |
| Chuyển trang trong SPA rồi xem tab **Doc** / Ctrl+U | Angular Router đổi URL bằng `pushState`, **không** tải tài liệu mới → tab Doc mãi chỉ có tài liệu của lần tải đầu | Gõ thẳng URL vào thanh địa chỉ + Enter, hoặc **F5** tại route đó |
| Chạy sai cổng | 4201 không nằm trong CORS whitelist → hydrate xong là đổ về `server-error`, che mất HTML đã SSR đúng | Bảo đảm dev server ở **4200** (xem 9.2.a) |

Bẫy thứ hai hay gặp nhất: SSR chỉ áp dụng cho **lần tải tài liệu đầu tiên** của
một URL. Điều hướng nội bộ sau đó là việc của client — đúng như thiết kế, và
cũng đúng cách Googlebot truy cập (nó vào thẳng URL, không bấm link trong SPA).

**9.4.c — Đếm thẻ KHÔNG đủ, phải đếm thẻ ĐƯỢC GÁN INPUT**

Một lỗi ném ra giữa lúc Angular render danh sách sẽ **ngắt phần còn lại**: các
component phía sau vẫn có mặt trong HTML nhưng ở dạng vỏ rỗng — không `src`,
không `href`, chữ rỗng. Đếm `<app-manga-sumary-card>` sẽ ra đủ 20 và tưởng là
xong, trong khi thực tế chỉ 2 thẻ có dữ liệu.

Dấu hiệu nhận biết trong HTML: thẻ có dữ liệu mang `ng-reflect-manga="[object Object]"`,
thẻ rỗng thì **không có thuộc tính đó**; các thẻ rỗng dài **bằng nhau từng ký tự**
và chung một `ngh="N"`.

```powershell
$html = curl.exe -s https://localhost:4200/latest --max-time 120
$total = [regex]::Matches($html, '<app-manga-sumary-card').Count
$bound = [regex]::Matches($html, 'ng-reflect-manga').Count
"the: $bound / $total co du lieu"
```

Lệch nhau = có exception đang cắt ngang render. Tìm trong log server dòng
`ERROR ReferenceError:` kèm tên component, rồi guard bằng `isPlatformBrowser`.
