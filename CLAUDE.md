# Yahallo-Client — Claude Code Project Guide

> Đây là file hướng dẫn tự động load mỗi khi bắt đầu conversation trong project này.
> Claude phải đọc file này trước khi trả lời bất kỳ câu hỏi nào.

---

## 1. Project Snapshot

| Key | Value |
|-----|-------|
| **Framework** | Angular 16, **NgModule** (không dùng standalone components) |
| **UI** | Bootstrap 5 (layout) + Angular Material (tables/dialogs) |
| **Theme** | Dark default, CSS variables (`--bg-primary`, `--accent-primary: #e94560`) |
| **Auth** | JWT cookie + AES-encrypted user in localStorage |
| **API Base** | `https://localhost:7181` (dev) — xem `src/environments/environment.ts` |
| **Branch chính** | `master` |

**Cấu trúc thư mục quan trọng:**
```
src/app/
├── core/          — guards, interceptors, services, models
├── features/      — user-facing pages (home, manga, auth, user)
├── shared/        — reusable components (manga-card, comments...)
├── Layout/        — header, footer
└── admin/         — admin panel (lazy-loaded tại /admin)
    ├── services/
    ├── layout/
    ├── pages/
    └── shared/    — dialogs, multi-tag-select, related-manga-selector
```

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
**Model:** claude-sonnet-4-6  

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
2. Nếu user đề cập đến feature/bug đã làm trước đó → đọc file session log liên quan trong `sessions_chat/`
3. Trả lời theo đúng conventions của project

## 7. Hành động khi kết thúc conversation

1. Xác định topic chính của conversation
2. Tạo file `sessions_chat/<topic>_<datetime>.md` theo format ở mục 5
3. Cập nhật `memory/MEMORY.md` nếu có thông tin mới cần lưu dài hạn
