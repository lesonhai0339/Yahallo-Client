/**
 * Chạy một lệnh Angular với cert dev của ASP.NET được Node tin cậy.
 *
 * Vì sao cần: API .NET local phục vụ HTTPS bằng cert tự ký `CN=localhost`.
 * Trình duyệt tin cert này vì `dotnet dev-certs https --trust` cài nó vào
 * Windows Certificate Store. Node KHÔNG đọc store của hệ điều hành — nó dùng
 * danh sách root CA biên dịch cứng trong binary — nên tiến trình SSR gọi API
 * sẽ chết với `DEPTH_ZERO_SELF_SIGNED_CERT`. Biến `NODE_EXTRA_CA_CERTS` nối
 * thêm cert đó vào danh sách root của Node, chỉ cho đúng tiến trình này.
 *
 * Script còn lo việc export cặp PEM + KEY ra `.certs/`, vì `angular.json` trỏ
 * `sslCert`/`sslKey` vào đó để dev server chạy HTTPS. Dev server PHẢI là HTTPS:
 * cookie `accessToken` của API đặt `SameSite=Lax`, mà theo schemeful same-site
 * thì trang `http://localhost` và API `https://localhost` là hai site khác nhau
 * — cookie sẽ không được gửi kèm, và mọi request đều hoá ra chưa đăng nhập.
 *
 * Dùng: node scripts/with-dev-cert.js <lệnh> [tham số...]
 * Ví dụ: node scripts/with-dev-cert.js ng run yahallo-client-refactor:serve-ssr
 *
 * CHỈ dành cho môi trường dev. Production dùng cert do CA công cộng cấp nên
 * Node tin sẵn, không cần gì thêm.
 */

const { spawn, spawnSync } = require('node:child_process');
const { existsSync, mkdirSync } = require('node:fs');
const { join, resolve } = require('node:path');

const ROOT = resolve(__dirname, '..');
const CERT_DIR = join(ROOT, '.certs');
const CERT_PEM = join(CERT_DIR, 'aspnet-dev-cert.pem');
const CERT_KEY = join(CERT_DIR, 'aspnet-dev-cert.key');

/**
 * Chức năng: Bảo đảm có cặp file PEM + KEY của cert dev. PEM dùng cho
 *   `NODE_EXTRA_CA_CERTS` (để Node TIN cert khi SSR gọi API); cả cặp dùng cho
 *   `sslCert`/`sslKey` của dev server (để nó PHỤC VỤ qua HTTPS).
 * Yêu cầu: máy đã cài .NET SDK và đã chạy `dotnet dev-certs https --trust`.
 * Kết quả trả về: đường dẫn tuyệt đối tới file PEM.
 * Exception: ném Error khi `dotnet` không có trong PATH hoặc export thất bại.
 */
function ensureCert() {
  if (existsSync(CERT_PEM) && existsSync(CERT_KEY)) return CERT_PEM;

  console.log('[dev-cert] Thiếu cert trong .certs/ — đang export từ store...');
  mkdirSync(CERT_DIR, { recursive: true });

  // Không bật `shell`: `dotnet` là executable thật nên spawn thẳng được, và
  // truyền args kèm shell sẽ dính cảnh báo DEP0190.
  const r = spawnSync(
    'dotnet',
    ['dev-certs', 'https', '--export-path', CERT_PEM, '--format', 'PEM', '--no-password'],
    { stdio: 'inherit' }
  );

  if (r.error || r.status !== 0) {
    throw new Error(
      'Không export được cert dev. Kiểm tra đã cài .NET SDK và đã chạy:\n' +
      '  dotnet dev-certs https --trust'
    );
  }

  for (const f of [CERT_PEM, CERT_KEY]) {
    if (!existsSync(f)) {
      throw new Error('dotnet báo thành công nhưng không thấy file ' + f);
    }
  }

  console.log('[dev-cert] Đã export xong.');
  return CERT_PEM;
}

/**
 * Chức năng: Bọc nháy kép quanh tham số có khoảng trắng. Cần vì phải spawn với
 *   `shell: true` (Windows chỉ chạy được `ng.cmd` qua shell), mà shell sẽ xé
 *   tham số theo khoảng trắng nếu không bọc.
 * Yêu cầu: `arg` là chuỗi tham số nguyên bản.
 * Kết quả trả về: chuỗi đã bọc nháy nếu cần, ngược lại trả nguyên.
 * Exception: không ném.
 */
function quoteArg(arg) {
  if (!/[\s"]/.test(arg)) return arg;
  return '"' + arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, '$1$1') + '"';
}

/**
 * Chức năng: Đọc lệnh từ argv rồi spawn nó với `NODE_EXTRA_CA_CERTS` đã set.
 *   Phải spawn tiến trình con chứ không set trong tiến trình này, vì Node chỉ
 *   đọc biến đó một lần lúc khởi động để dựng kho tin cậy.
 * Yêu cầu: `process.argv` từ vị trí thứ 3 trở đi là lệnh cần chạy.
 * Kết quả trả về: không (thoát theo đúng exit code của tiến trình con).
 * Exception: không ném — thiếu tham số thì in hướng dẫn rồi thoát mã 1.
 */
function main() {
  const [cmd, ...args] = process.argv.slice(2);

  if (!cmd) {
    console.error('Dùng: node scripts/with-dev-cert.js <lệnh> [tham số...]');
    process.exit(1);
  }

  const cert = ensureCert();
  console.log('[dev-cert] NODE_EXTRA_CA_CERTS = ' + cert);

  // Gộp thành một chuỗi thay vì truyền mảng args: Node cảnh báo DEP0190 khi
  // vừa truyền args vừa bật `shell`, vì nó nối chuỗi mà không tự escape.
  const line = [cmd, ...args].map(quoteArg).join(' ');

  const child = spawn(line, {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, NODE_EXTRA_CA_CERTS: cert },
  });

  child.on('exit', (code, signal) => process.exit(signal ? 1 : code ?? 0));
}

try {
  main();
} catch (err) {
  console.error('[dev-cert] ' + err.message);
  process.exit(1);
}
