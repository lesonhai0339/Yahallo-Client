# Admin — Module mới thêm (bản ghi để remove chính xác)

> **Mục đích:** file này liệt kê CHÍNH XÁC mọi file mới và mọi điểm chèn vào file
> cũ, cho từng module admin vừa thêm. Khi muốn bỏ một module, đọc đúng section của
> nó và làm theo — **không cần grep toàn repo**.
>
> **Ngày thêm:** 2026-07-25 · **Branch:** `dev_agent2`
> **Quy ước:** mọi đoạn code thêm vào file cũ đều có comment mốc
> `⚠️ MODULE MỚI THÊM` để tìm lại kể cả khi số dòng đã xê dịch.

---

## Tổng quan 5 module

| # | Module | Route | Sidebar | API |
|---|--------|-------|---------|-----|
| 1 | Kiểm duyệt bình luận | `/admin/comments` | "Kiểm duyệt BL" | ✅ THẬT |
| 2 | Thùng rác / phục hồi | `/admin/trash` | "Thùng rác" | ⚠️ restore THẬT, list cần backend hỗ trợ |
| 3 | Quản lý Role | `/admin/roles` | "Quản lý Role" | ✅ THẬT (ma trận quyền = client-side) |
| 4 | Sửa ảnh (canvas) | `/admin/image-editor` | "Sửa ảnh" | — chạy 100% client, không gọi API |
| 5 | Quản lý ảnh chương | `/admin/chapter/:chapterId/images` | (nút 🖌 trong chapter-list) | ⚠️ đọc THẬT, ghi cần API |

### File dùng chung (4 service)

| File | Dùng bởi module |
|------|-----------------|
| `src/app/admin/services/admin-moderation.service.ts` | #1, #2 |
| `src/app/admin/services/admin-role.service.ts` | #3 |
| `src/app/admin/services/image-edit.service.ts` | #4, #5 |
| `src/app/admin/services/chapter-image.service.ts` | #5 |

> ⚠️ `admin-moderation.service.ts` được **cả #1 và #2** dùng → chỉ xoá khi remove
> **cả hai** module đó.

---

## Module #1 — Kiểm duyệt bình luận (`/admin/comments`)

**Chức năng:** tìm bình luận theo nội dung, xoá bình luận vi phạm, phục hồi bình
luận đã xoá, bật/tắt "hiện cả đã xoá", phân trang, và **dropdown "Chi tiết"** cho
từng comment.

**API dùng (thật, đã có sẵn):**
- `GET /comment/admin/filter` — **endpoint dành riêng cho admin**, trả về
  `AdminCommentDto`. Gửi kèm `Message` (tìm theo nội dung) và `IsDeleted`.
- `DELETE /comment/delete` body `{ id }`
- `POST /comment/restore` body `{ id }`

> ⚠️ **Quyền:** `Permission.ModerateComments` (Admin + Moderator). KHÔNG dùng
> `ManageManga` vì **Translator cũng có `ManageManga`** → sẽ vào được trang kiểm duyệt.
> Quyền này được thêm mới vào `core/models/permission.model.ts`.

> ⚠️ **Không dùng `/comment/filter-comment` ở trang admin** — đó là bản public cho
> người đọc, không trả các field quản trị (`deleteDate`, `idUserDeleted`, cờ
> `isDeleted`…). Tab "Bình luận" của Thùng rác cũng trỏ vào `/comment/admin/filter`.

**Interface `AdminComment` khớp 1-1 với `AdminCommentDto`** (giữ nguyên tên field
của backend để dễ đối chiếu — đừng đổi tên tuỳ ý):
`id, userId, mangaId, mangaName, chapterId, chapterIndex, chapterName, parentId,`
`blogId, replyToCommentId, message, dateTime, like, dislike, isDeleted,`
`displayName, avatar, replyCount, userCommentTo, createDate, deleteDate, idUserDeleted`

> ⚠️ **Lưu ý mapping:** nội dung comment nằm ở **`message`** (không phải `content`),
> tên người ở **`displayName`**, ảnh ở **`avatar`**. Panel chi tiết hiển thị toàn bộ
> field trên và **không gọi request thêm** — API đã trả đủ trong 1 lần.

### Xoá file mới (3 file)
```
src/app/admin/pages/comment-moderation/comment-moderation.component.ts
src/app/admin/pages/comment-moderation/comment-moderation.component.html
src/app/admin/pages/comment-moderation/comment-moderation.component.scss
```
(xoá luôn folder `src/app/admin/pages/comment-moderation/`)

### Hoàn nguyên file cũ (3 file)

**`src/app/admin/admin.module.ts`**
- Dòng **56** — xoá: `import { CommentModerationComponent } from './pages/comment-moderation/comment-moderation.component';`
- Dòng **106** — xoá khỏi `declarations`: `CommentModerationComponent,`

**`src/app/admin/admin-routing.module.ts`**
- Dòng **18** — xoá: `import { CommentModerationComponent } ...`
- Dòng **90–96** — xoá cả block route:
  ```ts
  {
    path: 'comments',
    component: CommentModerationComponent,
    canActivate: [PermissionGuard],
    data: { permission: Permission.ModerateComments }
  },
  ```

**`src/app/admin/layout/admin-layout/admin-layout.component.ts`**
- Dòng **39** — xoá item sidebar: `{ label: 'Kiểm duyệt BL', path: '/admin/comments', ... }`

---

## Module #2 — Thùng rác / phục hồi (`/admin/trash`)

**Chức năng:** tab theo loại (Truyện / Chương / Bình luận / Tác giả / Họa sĩ),
bảng bản ghi đã xoá mềm, nút **Phục hồi**.

**API dùng:**
- ✅ **THẬT:** `POST /{manga|chapter|comment|author|artist}/restore` body `{ id }`
- ⚠️ **CẦN BACKEND:** phần liệt kê gọi `GET /{...}/filter-*` kèm `IsDeleted=true`.
  Hiện các endpoint filter **chưa chắc nhận param này**; nếu bị bỏ qua thì trang
  lọc lại phía client theo cờ `isDeleted` → thường ra **rỗng** (trang có ghi chú
  giải thích cho người dùng). Khi backend bổ sung filter thật thì trang tự hoạt
  động đúng, **không cần sửa code**.

### Xoá file mới (3 file)
```
src/app/admin/pages/trash-bin/trash-bin.component.ts
src/app/admin/pages/trash-bin/trash-bin.component.html
src/app/admin/pages/trash-bin/trash-bin.component.scss
```
(xoá luôn folder `src/app/admin/pages/trash-bin/`)

### Hoàn nguyên file cũ (3 file)

**`src/app/admin/admin.module.ts`**
- Dòng **57** — xoá: `import { TrashBinComponent } from './pages/trash-bin/trash-bin.component';`
- Dòng **107** — xoá khỏi `declarations`: `TrashBinComponent,`

**`src/app/admin/admin-routing.module.ts`**
- Dòng **19** — xoá: `import { TrashBinComponent } ...`
- Dòng **97–102** — xoá cả block route:
  ```ts
  {
    path: 'trash',
    component: TrashBinComponent,
    canActivate: [PermissionGuard],
    data: { permission: Permission.ManageManga }
  },
  ```

**`src/app/admin/layout/admin-layout/admin-layout.component.ts`**
- Dòng **40** — xoá item sidebar: `{ label: 'Thùng rác', path: '/admin/trash', ... }`

---

## Module #3 — Quản lý Role (`/admin/roles`)

**Chức năng:** danh sách role + đếm user mỗi role, form inline thêm/sửa, xoá role
(có confirm dialog), và **ma trận quyền tham chiếu**.

**API dùng (thật):**
- `GET /role/get-all-pagination`
- `POST /role/create` · `PUT /role/update` · `DELETE /role/delete` · `POST /role/restore`
- `GET /user-role/filter-user-role?RoleId=...&PageSize=1` → đọc `totalCount` để đếm user
  (⚠️ chưa có endpoint đếm riêng; nếu API không trả `totalCount` thì UI hiện `—`)

> ⚠️ **Ma trận quyền là CLIENT-SIDE.** Nó đọc hằng `ROLE_PERMISSIONS` trong
> `src/app/core/models/permission.model.ts`, **không** phải cấu hình từ backend.
> Muốn đổi quyền phải sửa file đó. Trang có ghi chú rõ điều này cho người dùng.

### Xoá file mới (4 file)
```
src/app/admin/pages/role-list/role-list.component.ts
src/app/admin/pages/role-list/role-list.component.html
src/app/admin/pages/role-list/role-list.component.scss
src/app/admin/services/admin-role.service.ts
```
(xoá luôn folder `src/app/admin/pages/role-list/`)

### Hoàn nguyên file cũ (3 file)

**`src/app/admin/admin.module.ts`**
- Dòng **58** — xoá: `import { RoleListComponent } from './pages/role-list/role-list.component';`
- Dòng **108** — xoá khỏi `declarations`: `RoleListComponent,`

**`src/app/admin/admin-routing.module.ts`**
- Dòng **20** — xoá: `import { RoleListComponent } ...`
- Dòng **103–108** — xoá cả block route:
  ```ts
  {
    path: 'roles',
    component: RoleListComponent,
    canActivate: [PermissionGuard],
    data: { permission: Permission.ManageRoles }
  },
  ```

**`src/app/admin/layout/admin-layout/admin-layout.component.ts`**
- Dòng **41** — xoá item sidebar: `{ label: 'Quản lý Role', path: '/admin/roles', ... }`

---

## Module #4 — Sửa ảnh / canvas editor (`/admin/image-editor`)

**Dành cho translator.** Xử lý **100% ở client** (canvas 2D) — không upload, không
gọi API nào. Dùng `jszip` (đã có trong project) để đóng gói khi cắt ảnh.

**Chức năng:**
- **Xoá SFX** — tô kín vùng chọn; có nút *"Tô bằng màu nền lân cận"* tự lấy màu
  chiếm ưu thế quanh vùng
- **Xoá & ghi đè chữ** — ghi chữ vào vùng chọn (tự ngắt dòng, canh giữa dọc,
  font/cỡ/màu/đậm/nghiêng/canh lề/viền chữ), tuỳ chọn tô nền trước để xoá chữ gốc
- **Đổi màu một vùng** — thay màu theo ngưỡng sai khác (khoảng cách RGB), giữ alpha
- **Bảng màu vùng lân cận** — quét viền ~12px *bên ngoài* vùng chọn, lượng tử hoá
  rồi hiện top 8 màu kèm hex, bấm để dùng ngay
- **Hút màu** (eyedropper) + **cắt ảnh dài** theo chiều cao mỗi phần, có vạch chỉ
  đường cắt trên ảnh, xuất **zip** (PNG/JPEG/WebP)
- Undo/Redo (`Ctrl+Z` / `Ctrl+Y`), zoom/fit, nạp ảnh bằng chọn file · kéo-thả · `Ctrl+V`

**Quyền:** `Permission.ManageChapters` — Admin, Moderator **và Translator** đều có.

> ⚠️ **Undo tốn RAM.** Mỗi bước lưu 1 `ImageData` toàn ảnh; ảnh manhwa 800×12000
> ≈ 38MB/bước. Component giới hạn theo **ngân sách byte**
> (`HISTORY_BUDGET_BYTES = 256MB`) và bỏ bước cũ nhất khi vượt, thay vì giới hạn
> theo số bước. Nếu thấy nặng thì giảm hằng số này trong
> `image-editor.component.ts`.

> ⚠️ Chỉ nạp ảnh từ **file/clipboard**, không nạp từ URL. Ảnh cross-origin sẽ làm
> canvas bị "tainted" → `getImageData()` throw, hỏng toàn bộ công cụ màu.

### Xoá file mới (4 file)
```
src/app/admin/pages/image-editor/image-editor.component.ts
src/app/admin/pages/image-editor/image-editor.component.html
src/app/admin/pages/image-editor/image-editor.component.scss
src/app/admin/services/image-edit.service.ts
```
(xoá luôn folder `src/app/admin/pages/image-editor/`)

### Hoàn nguyên file cũ (3 file)

**`src/app/admin/admin.module.ts`**
- Dòng **59** — xoá: `import { ImageEditorComponent } ...`
- Dòng **109** — xoá khỏi `declarations`: `ImageEditorComponent,`

**`src/app/admin/admin-routing.module.ts`**
- Dòng **21** — xoá: `import { ImageEditorComponent } ...`
- Dòng **109–115** — xoá cả block route `path: 'image-editor'` (gồm dòng comment phía trên)

**`src/app/admin/layout/admin-layout/admin-layout.component.ts`**
- Dòng **42** — xoá item sidebar: `{ label: 'Sửa ảnh', path: '/admin/image-editor', ... }`

---

## Module #5 — Quản lý ảnh chương (`/admin/chapter/:chapterId/images`)

Thay cho luồng "sửa chương" cũ (chỉ sửa được title/index, **không xem/sửa được ảnh**).
Vào bằng **nút 🖌 (brush)** ở cột Thao tác trong `/admin/manga/:mangaId/chapters`.

**Luồng đúng như yêu cầu:**
1. Gọi **API THẬT** `GET /chapter/get-image?ChapterId=` — chỉ lấy **URL + metadata**,
   không tải ảnh (giống giao diện đọc truyện).
2. Translator chọn **số ảnh tải mỗi lần**: `1` · `5` · `Tất cả` · `Tuỳ ý (ô số)`.
   Chỉ ảnh được chọn mới gán `src` → mới thực sự tải từ S3. Cuối danh sách có khối
   *"Còn N ảnh chưa tải"* với `+1 / +5 / +N / Tải hết`. Mỗi ảnh chưa tải cũng có
   placeholder bấm để tải riêng.
3. Mỗi ảnh: **Sửa ảnh** (icon 🖌 → mở sidebar editor) · **Thay thế** (chọn file) ·
   **Đảo vị trí** (↑ ↓) · **Xoá**.
4. **Lưu/Huỷ riêng từng ảnh** (chỉ hiện khi ảnh đó có thay đổi) + **Lưu tất cả /
   Huỷ tất cả** ở thanh dính đáy trang.

**Quyền:** `Permission.ManageChapters` → Admin, Mod, **Translator**.

### ⚠️ Trạng thái API

| Thao tác | Endpoint | Trạng thái |
|---|---|---|
| Lấy URL + metadata | `GET /chapter/get-image` | ✅ **THẬT** |
| Xoá 1 ảnh | `DELETE /chapter/delete-image` | ❌ **CHƯA CÓ** → mock |
| Đổi thứ tự | `PUT /chapter/reorder-image` body `{chapterId, order:[{imageId,index}]}` | ❌ **CHƯA CÓ** → mock |
| Xin signed URL để thay ảnh | `POST /chapter/replace-image` → `{fileId, signedUrl, key}` | ⚠️ **cần xác nhận tên/shape** |
| Upload ảnh mới | `PUT <signedUrl>` **trực tiếp lên S3** | ✅ đúng luồng |
| Confirm / rollback | `POST /services/confirm-uploads` · `/fail-uploads` | ⚠️ đang mock (`USE_MOCK=true`) |

#### Luồng thay ảnh (đúng bản chất "xoá cũ + thay mới")

```
client                          server                       S3
  │ POST /chapter/replace-image   │
  │  {chapterId,imageId,fileName, │
  │   contentType,fileSize}       │
  ├──────────────────────────────►│ XOÁ ảnh cũ
  │                               │ tạo presigned PUT
  │◄──────────────────────────────┤ {fileId, signedUrl}
  │ PUT <signedUrl>  (bytes ảnh)                        │
  ├────────────────────────────────────────────────────►│  ETag
  │ POST /services/confirm-uploads {fileId, etag}       │
  ├──────────────────────────────►│
```

- **Server KHÔNG nhận bytes ảnh** — client PUT thẳng lên S3. Đây chính là lý do
  bucket cần `PUT` trong `AllowedMethods` và expose `ETag`.
- Upload S3 fail → tự gọi `failUploads([fileId])` để server dọn bản ghi treo.
- Có **thanh progress %** cho từng ảnh (`xhr.upload.onprogress`), quan trọng vì
  trang manhwa thường rất nặng.
- **Chỉ đổi thứ tự thì KHÔNG đi luồng này** — chỉ cập nhật `index`, không re-upload.

> Service gọi thật trước, `catchError` → trả `{ mocked: true }`, UI hiện toast
> **"Đã lưu tạm ở client — backend chưa có endpoint tương ứng"**. Khi backend bổ
> sung 3 endpoint trên thì **tự hoạt động, không phải sửa code client**.
>
> Đổi thứ tự hiện chỉ đảo `index` + thứ tự trong mảng (đúng như bạn nói "đảo signed
> url là đủ") nên **không tải lại ảnh**.

### CORS / cách nạp ảnh vào canvas

Bucket S3 đã cấu hình CORS (`GET, PUT, HEAD` · origin `localhost:4200`, `yahallo.online`
· expose `ETag`) nên đọc pixel được.

Tuy vậy panel **không** nạp ảnh bằng `img.crossOrigin` trực tiếp, mà đi đường
`fetch(url) → Blob → objectURL → <img>`. Ba lý do:

1. **Cache "bẩn"**: nếu ảnh đã được trang đọc truyện tải trước đó bằng request
   KHÔNG CORS, browser cache lại response thiếu header CORS. Lần sau dù có
   `crossOrigin='anonymous'` vẫn có thể ăn đúng cache đó → canvas **bị tainted dù
   S3 đã cấu hình đúng**. Đây là cạm bẫy hay gặp nhất.
2. **Không phá signature**: không thể chèn query cache-buster vào presigned URL —
   SigV4 ký cả query string nên thêm param là hỏng chữ ký.
3. `blob:` URL là **same-origin** → vẽ lên canvas không bao giờ taint.

`fetch` dùng `cache: 'reload'` để bỏ qua cache cũ. Nếu `fetch` fail thì fallback về
cách nạp trực tiếp kèm `crossOrigin`, và `probeTaint()` vẫn kiểm tra lại — tainted
thì panel khoá công cụ màu và báo lỗi rõ ràng.

> ⚠️ **Origin chưa có trong config**: `https://www.yahallo.online` (bản `www.`).
> Nếu site chạy ở subdomain đó thì cần thêm vào `AllowedOrigins`.

### Xoá file mới (7 file)
```
src/app/admin/pages/chapter-images/chapter-images.component.ts
src/app/admin/pages/chapter-images/chapter-images.component.html
src/app/admin/pages/chapter-images/chapter-images.component.scss
src/app/admin/shared/image-editor-panel/image-editor-panel.component.ts
src/app/admin/shared/image-editor-panel/image-editor-panel.component.html
src/app/admin/shared/image-editor-panel/image-editor-panel.component.scss
src/app/admin/services/chapter-image.service.ts
```
(xoá luôn 2 folder `pages/chapter-images/` và `shared/image-editor-panel/`)

### Hoàn nguyên file cũ (4 file)

**`src/app/admin/admin.module.ts`**
- Dòng **60–61** — xoá 2 import `ImageEditorPanelComponent`, `ChapterImagesComponent`
- Dòng **112–113** — xoá 2 dòng khỏi `declarations`

**`src/app/admin/admin-routing.module.ts`**
- Dòng **22** — xoá: `import { ChapterImagesComponent } ...`
- Dòng **110–116** — xoá cả block route `path: 'chapter/:chapterId/images'`

**`src/app/admin/pages/chapter-list/chapter-list.component.ts`**
- Dòng **38–46** — xoá method `manageImages()` (có comment mốc phía trên)

**`src/app/admin/pages/chapter-list/chapter-list.component.html`**
- Dòng **55–59** — xoá nút `.action-btn--images` (có comment mốc)

**`src/app/admin/pages/chapter-list/chapter-list.component.scss`**
- Dòng **83–84** — xoá rule `.action-btn--images`

> ⚠️ `image-edit.service.ts` được **cả #4 và #5** dùng → chỉ xoá khi remove cả hai.

---

## Remove TẤT CẢ 3 module (cách nhanh)

```bash
# 1. Xoá folder + service mới
rm -rf src/app/admin/pages/comment-moderation \
       src/app/admin/pages/trash-bin \
       src/app/admin/pages/role-list
rm -f  src/app/admin/services/admin-moderation.service.ts \
       src/app/admin/services/admin-role.service.ts

# 2. Tìm 3 điểm chèn còn lại trong file cũ rồi xoá thủ công
grep -rn "MODULE MỚI THÊM" src/app/admin/
```
`grep` trên trả về đúng 3 file cần sửa:
`admin.module.ts` (2 chỗ), `admin-routing.module.ts` (2 chỗ),
`admin-layout/admin-layout.component.ts` (1 chỗ).

Sau khi xoá, chạy `npx ng build --configuration development` để chắc không còn
tham chiếu treo.

---

## ⚠️ Lưu ý: KHÔNG có file nào bị sửa ngoài 3 file dưới

Toàn bộ 3 module chỉ chèn vào đúng 3 file cũ, không đụng gì khác:

| File cũ bị sửa | Số điểm chèn |
|----------------|--------------|
| `src/app/admin/admin.module.ts` | 2 (import block + declarations) |
| `src/app/admin/admin-routing.module.ts` | 2 (import block + 3 route) |
| `src/app/admin/layout/admin-layout/admin-layout.component.ts` | 2 (4 nav item + switchViewAs reload) |
| `src/app/admin/pages/chapter-list/chapter-list.component.{ts,html,scss}` | 3 (nút mở quản lý ảnh) |
| `src/app/core/models/permission.model.ts` | 1 (thêm `ModerateComments`) |

Không sửa: `app.module.ts`, `app-routing.module.ts`, i18n json, `styles.scss`,
`environment.ts`, hay bất kỳ service/component cũ nào.

---

# Phụ lục — Chức năng admin CÒN THIẾU (chưa implement)

Danh sách rà soát cho admin site truyện, xếp theo giá trị. Mục có ✅ là API đã có
sẵn nên implement nhanh; ❌ là cần backend làm trước.

## Ưu tiên cao
| Chức năng | API | Ghi chú |
|-----------|-----|---------|
| **Báo cáo / report** (comment, chương lỗi ảnh, truyện sai nội dung) | ❌ chưa có | Cần bảng `Report`. Rất cần cho site có UGC |
| **Bulk upload chương** (kéo cả folder / zip nhiều chương 1 lượt) | ⚠️ `presign-upload` đang mock | Hiện chỉ tạo từng chương |
| **Broadcast thông báo toàn site** | ⚠️ có `/notification/admin-send` cho 1 user | Cần endpoint gửi all / theo role |
| **Audit log** (ai xoá truyện, ai ban user, lúc nào) | ❌ chưa có | Bắt buộc khi có nhiều mod |

## Ưu tiên trung bình
| Chức năng | API | Ghi chú |
|-----------|-----|---------|
| **Quản lý banner / slider trang chủ** | ❌ chưa có | Hiện homepage cố định |
| **Hàng đợi duyệt chương** (mod up → admin duyệt mới publish) | ❌ chưa có | Cần field `status` cho chapter |
| **Đặt lịch publish chương** | ❌ chưa có | Cần `publishAt` |
| **Inbox feedback tổng** | ✅ `/user/{id}/feedbacks` | Hiện chỉ xem theo từng user |
| **Quản lý nhóm dịch (scanlation group)** | ❌ chưa có | Nếu site có nhiều nhóm dịch |
| **Thống kê follow / subscription** | ✅ `/follow-manga/filter-follow-manga` | Chưa có trang |

## Ưu tiên thấp
| Chức năng | API | Ghi chú |
|-----------|-----|---------|
| **Quản lý storage / ảnh mồ côi** | ❌ chưa có | Dọn ảnh chương đã xoá |
| **SEO metadata theo truyện** | ❌ chưa có | Hiện `SeoService` tự sinh |
| **Export dữ liệu (CSV)** | ❌ chưa có | Cho báo cáo |
| **Cấu hình site** (tên, logo, maintenance mode) | ❌ chưa có | Đang hardcode |
