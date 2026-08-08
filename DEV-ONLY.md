# DEV-ONLY — thứ cần gỡ / kiểm tra trước khi lên production

> Tất cả những gì liệt kê ở đây **chỉ phục vụ môi trường dev**. Không có món nào
> cần thiết cho production. Xoá được hết mà không ảnh hưởng bản build.
> Cập nhật: 2026-08-03.

## Vì sao có mấy thứ này

Hai vấn đề khác nhau, cùng bắt nguồn từ việc API local phục vụ HTTPS bằng cert
**tự ký** `CN=localhost`.

**1. Node không tin cert đó.** `dotnet dev-certs https --trust` cài cert vào
Windows Certificate Store, nên trình duyệt tin. Node **không** đọc store của hệ
điều hành — nó dùng danh sách 145 root CA biên dịch cứng trong binary — nên
tiến trình SSR gọi API sẽ chết với `DEPTH_ZERO_SELF_SIGNED_CERT`. Hệ quả:
`ng serve` chạy bình thường (browser gọi API), còn SSR thì không (Node gọi API).
Chữa bằng `NODE_EXTRA_CA_CERTS`.

**2. Dev server phải chạy HTTPS.** Cookie `accessToken` do API đặt với
`SameSite=Lax` (`AuthCookieOptions.cs`, dev không khai `SameSite` nên rơi về
default `"Lax"`). Theo **schemeful same-site** — Chrome bật mặc định từ bản 89 —
"site" tính theo scheme + domain, **port không tính**:

| Trang | Gọi API | Cùng site? | Cookie |
|---|---|---|---|
| `http://localhost:4200` | `https://localhost:7181` | ❌ http ≠ https | không gửi |
| `https://localhost:4200` | `https://localhost:7181` | ✅ | gửi |

Nếu dev server chạy HTTP thì `JwtBearerEvents.OnMessageReceived` bên API luôn
thấy `Request.Cookies["accessToken"]` rỗng — đăng nhập xong vẫn như chưa đăng nhập.

Cổng phải đúng **4200**: `appsettings.Development.json` chỉ whitelist
`https://localhost:4200` và `http://localhost:4200`. Chạy nhầm 4201 thì CORS
chặn sạch, mọi trang đổ về `server-error`.

**Production KHÔNG gặp cả hai vấn đề này.** Cert `api.yahallo.online` do Google
Trust Services cấp — nằm sẵn trong 145 root CA của Node (`authorized = true`),
và site production vốn đã là HTTPS.

## Danh sách cần xoá

| Mục | Đường dẫn | Ghi chú |
|---|---|---|
| Wrapper set `NODE_EXTRA_CA_CERTS` | `scripts/with-dev-cert.js` | Xoá cả file |
| Cert đã export (PEM + KEY) | `.certs/` | Đã gitignore, không nằm trong repo |
| Script npm | `package.json` → `dev:ssr` | Trả về bản gốc bên dưới |
| Khối `options` của `serve-ssr` | `angular.json` | Xoá cả khối `port`/`ssl`/`sslCert`/`sslKey` |
| Dòng gitignore | `.gitignore` → khối `.certs/` | Xoá kèm comment phía trên |
| File này | `DEV-ONLY.md` | Xoá sau cùng |

Khôi phục `package.json`:

```json
"dev:ssr": "ng run yahallo-client-refactor:serve-ssr",
```

Khôi phục `angular.json` — xoá khối này khỏi target `serve-ssr`:

```json
"options": {
  "port": 4200,
  "ssl": true,
  "sslCert": ".certs/aspnet-dev-cert.pem",
  "sslKey": ".certs/aspnet-dev-cert.key"
},
```

## Lưu ý bảo mật

`.certs/aspnet-dev-cert.key` là **private key**. Cần giữ lại vì dev server dùng
nó để phục vụ TLS (`sslKey`), không chỉ để tin cậy. Nó đã nằm trong `.gitignore`
— kiểm tra bằng `git status --ignored .certs` phải thấy `!! .certs/`.

Đây là cert dev của ASP.NET, vốn đã nằm sẵn trong `Cert:\CurrentUser\My` trên máy
bạn, nên export ra không tạo thêm rủi ro mới. Nhưng **không commit, không copy
sang máy khác**.

## Không đụng tới đường build production

Các thay đổi trên **không** nằm trong đường đi của bản production:

- `build:ssr` → `ng build && ng run ...:server` — cả hai mặc định
  `configuration: production`, dùng `environment.prod.ts`, không qua wrapper.
- `serve:ssr` → `node dist/.../server/main.js` — không qua wrapper.
- Khối `options` chỉ nằm ở target `serve-ssr`, target này không dùng khi build.

Nên kể cả quên xoá thì bản deploy vẫn đúng. Xoá chủ yếu cho sạch repo.

## Nếu sau này production cũng cần

Chỉ xảy ra khi SSR gọi API qua **mạng nội bộ** bằng cert tự ký / CA riêng
(ví dụ container SSR gọi container API trong cùng VPC qua `https://api-internal:5001`).
Lúc đó vẫn dùng `NODE_EXTRA_CA_CERTS`, chỉ khác là mount cert CA nội bộ vào image
thay vì export từ `dotnet dev-certs`.

**Tuyệt đối không** dùng `NODE_TLS_REJECT_UNAUTHORIZED=0` để thay thế — nó tắt
xác thực TLS cho toàn bộ tiến trình Node, mọi kết nối ra ngoài chứ không riêng
host bạn muốn.
