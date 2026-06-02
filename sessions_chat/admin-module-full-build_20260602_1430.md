# Session: Admin Module — Full Build
**Date:** 2026-06-02 14:30  
**Branch:** dev_agent2  
**Model:** claude-sonnet-4-6  

## Summary
Xây dựng toàn bộ module admin từ đầu và tích hợp vào Yahallo-Client. Bao gồm lazy-loaded AdminModule tại `/admin`, role-based guard, layout sidebar riêng, 5 trang quản lý, và 5 shared components/dialogs. Đồng thời fix 5 bugs runtime trong code hiện có.

## Changes

### New Files — Admin Core
- [CREATE] `src/app/core/guards/admin.guard.ts` — Guard kiểm tra role Admin qua AdminStateService
- [CREATE] `src/app/admin/admin.module.ts` — NgModule khai báo tất cả admin components + Material imports
- [CREATE] `src/app/admin/admin-routing.module.ts` — Child routes dưới AdminLayoutComponent

### New Files — Services
- [CREATE] `src/app/admin/services/admin-state.service.ts` — Subscribe auth$, gọi filter-user-role API, expose isAdmin$
- [CREATE] `src/app/admin/services/admin.service.ts` — User CRUD, role add/remove, lock/unlock
- [CREATE] `src/app/admin/services/admin-manga.service.ts` — Manga/chapter/author/artist/tag CRUD + searchByPrefix + linkSeries
- [CREATE] `src/app/admin/services/image-upload.service.ts` — S3 pre-signed URL flow (USE_MOCK=true)

### New Files — Layout
- [CREATE] `src/app/admin/layout/admin-layout/admin-layout.component.{ts,html,scss}` — Sidebar + topbar, no site header/footer

### New Files — Pages
- [CREATE] `src/app/admin/pages/dashboard/dashboard.component.{ts,html,scss}` — Stat cards
- [CREATE] `src/app/admin/pages/manga-list/manga-list.component.{ts,html,scss}` — MatTable + CRUD actions
- [CREATE] `src/app/admin/pages/manga-form/manga-form.component.{ts,html,scss}` — Create/edit form
- [CREATE] `src/app/admin/pages/chapter-list/chapter-list.component.{ts,html,scss}` — Chapter management
- [CREATE] `src/app/admin/pages/user-list/user-list.component.{ts,html,scss}` — User + role management

### New Files — Shared
- [CREATE] `src/app/admin/shared/confirm-dialog/confirm-dialog.component.ts` — Reusable confirm dialog
- [CREATE] `src/app/admin/shared/chapter-form-dialog/chapter-form-dialog.component.{ts,html,scss}` — Chapter form + S3 upload UI
- [CREATE] `src/app/admin/shared/user-role-dialog/user-role-dialog.component.{ts,html}` — Role management + lock account
- [CREATE] `src/app/admin/shared/multi-tag-select/multi-tag-select.component.{ts,html,scss}` — Internal-search multi-select chips
- [CREATE] `src/app/admin/shared/related-manga-selector/related-manga-selector.component.{ts,html,scss}` — Prefix-search + link series

### New Files — Config
- [CREATE] `CLAUDE.md` — Auto-load project guide + session logging instructions
- [CREATE] `sessions_chat/` — Folder cho session logs

### Modified Files
- [MODIFY] `src/app/app-routing.module.ts` — Thêm lazy route `path: 'admin'`
- [MODIFY] `src/app/app.component.ts` — Ẩn header/footer khi URL `/admin/*`
- [MODIFY] `src/app/Layout/header/header.component.{ts,html,scss}` — Thêm Admin Panel link (amber) trong user dropdown
- [MODIFY] `src/app/core/services/notification.service.ts` — Fix `setNotifications()` Array.isArray guard
- [MODIFY] `src/app/core/services/user-interaction.service.ts` — Fix `getUnreadNotifications()` unwrap `res.value.items`
- [MODIFY] `angular.json` — Thêm `pink-bluegrey.css` Material theme
- [MODIFY] `src/styles.scss` — Material table/paginator/dialog dark theme overrides

## Decisions

- **Decision:** Lazy-load AdminModule thay vì eager  
  **Why:** Admin bundle ~2.18MB (Material), không nên load cho user thường

- **Decision:** AdminStateService là singleton (`providedIn: 'root'`) dù file nằm trong `/admin`  
  **Why:** Header component (main bundle) cũng cần isAdmin$; lazy module không ảnh hưởng singleton

- **Decision:** `USE_MOCK = true` trong ImageUploadService  
  **Why:** Backend S3 endpoints chưa có, mock cho phép test toàn bộ UI flow

- **Decision:** MultiTagSelectComponent dùng property thường thay vì getter cho `allItems`  
  **Why:** Getter tạo array ref mới mỗi CD cycle → ExpressionChangedAfterItHasBeenCheckedError

- **Decision:** Prefix pills + text input cho RelatedMangaSelector thay vì tự parse prefix  
  **Why:** UX tốt hơn, user không cần nhớ syntax nhưng vẫn thấy full query `ref:name:...`

## Bugs Fixed

- **Bug:** `TypeError: n.slice is not a function` trong NotificationService  
  **Cause:** `getUnreadNotifications()` trả về object `{ value: { items: [] } }` thay vì array  
  **Fix:** Unwrap chain `res?.value?.data ?? res?.value?.items ?? res?.items ?? []` + guard `Array.isArray` trong `setNotifications()`

- **Bug:** Angular Material warning "Could not find core theme"  
  **Cause:** Thiếu prebuilt theme CSS  
  **Fix:** Thêm `pink-bluegrey.css` vào `angular.json` styles array

- **Bug:** `ExpressionChangedAfterItHasBeenCheckedError` trong MangaFormComponent  
  **Cause:** `get tagItems()` getter tạo `[...].map()` mới mỗi lần  
  **Fix:** Đổi thành property `tagItems: TagItem[] = []`, set một lần trong forkJoin callback

- **Bug:** `ngModel` lỗi trong MultiTagSelectComponent  
  **Cause:** Component nằm trong `<form [formGroup]>` của parent, Angular yêu cầu `name` hoặc `standalone`  
  **Fix:** Thêm `[ngModelOptions]="{ standalone: true }"`

- **Bug:** `UserRolePagination is not defined` trong AdminStateService  
  **Cause:** Type reference đến interface chưa import, `roles?.values` là Array method chứ không phải property  
  **Fix:** Khai báo interface inline, unwrap `res?.value?.data`

## Mock / TODOs

- [ ] `POST /services/presign-upload` — nhận `ImageUploadMeta[]`, trả `SignedUrlItem[]`
- [ ] `POST /services/confirm-uploads` — nhận `{ files: FileUploadResult[] }`, update file status
- [ ] `POST /services/fail-uploads` — mark files as failed/unavailable  
- [ ] `POST /manga/link-series` — nhận `{ sourceId, targetIds[] }`, tạo series relationship
- [ ] `GET /manga/filter-manga` — thêm params `authorName`, `artistName` (hiện chỉ có `name`)
- [ ] Set `USE_MOCK = false` trong `image-upload.service.ts` khi backend S3 ready
- [ ] Admin role check dùng `GET /user-role/filter-user-role` — xác nhận đúng endpoint với backend

## Notes for Next Session

- **SignalR error** "Failed to fetch" là bình thường khi backend chưa chạy — không phải bug code
- `admin-state.service.ts` parse response shape: `{ value: { data: [{ roleName, ... }] } }`
- `AdminModule` cần khai báo tất cả components mới trong `declarations[]` array
- `MultiTagSelectComponent` selector: `app-multi-tag-select`
- `RelatedMangaSelectorComponent` selector: `app-related-manga-selector`
- File `image-upload.service.ts` có `MOCK_DELAY_MS = 600` và simulated progress ticks cho mock S3
- Chapter form dialog: single file → 3-step indicator; multi file → overall + per-file progress bars
