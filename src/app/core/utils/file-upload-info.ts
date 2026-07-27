/**
 * Server nhận metadata ảnh (FileUploadInfo) thay cho IFormFile: client gửi thông
 * tin file + kích thước resize mong muốn, server trả pre-signed URL, client upload
 * file GỐC lên S3. Bản resize server tự render/cắt sau (client KHÔNG upload).
 * Mirror backend `YAHALLO.Application.Common.DTOs.FileUploadInfo`.
 */
export interface FileUploadInfo {
  fileName: string;
  contentType: string;
  width: number;
  height: number;
  length: number;
  resizeWidth: number;
  resizeHeight: number;
  resizeLength: number;
}

/** Kích thước resize mục tiêu (server render sau). Bỏ qua = không resize (0). */
export const AVATAR_RESIZE = { width: 256, height: 256 };
export const BACKGROUND_RESIZE = { width: 1280, height: 427 };

/**
 * Bề ngang bản resize của ảnh TRANG TRUYỆN. Trang truyện không có tỉ lệ cố định
 * (manhwa cao gấp chục lần chiều ngang) nên không thể dùng cặp W×H cứng như
 * avatar — chỉ chốt bề ngang rồi suy chiều cao theo đúng tỉ lệ gốc.
 */
export const CHAPTER_PAGE_MAX_WIDTH = 800;

/** Đọc kích thước tự nhiên + dung lượng của ảnh thành FileUploadInfo. */
export function buildFileUploadInfo(
  file: File,
  resize?: { width: number; height: number },
): Promise<FileUploadInfo> {
  const make = (w: number, h: number): FileUploadInfo => ({
    fileName: file.name,
    contentType: file.type || 'application/octet-stream',
    width: w,
    height: h,
    length: file.size,
    resizeWidth: resize?.width ?? 0,
    resizeHeight: resize?.height ?? 0,
    resizeLength: 0, // bản resize server tự render sau — chưa biết dung lượng
  });

  return new Promise(resolve => {
    if (!file.type.startsWith('image/')) { resolve(make(0, 0)); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(make(img.naturalWidth, img.naturalHeight)); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(make(0, 0)); };
    img.src = url;
  });
}

/**
 * Chức năng: Dựng FileUploadInfo cho một ảnh trang truyện — giữ nguyên ảnh gốc,
 *   chỉ khai báo bản resize theo bề ngang tối đa và ĐÚNG tỉ lệ ảnh gốc.
 * Yêu cầu: `file` là ảnh; `maxWidth` > 0 (mặc định CHAPTER_PAGE_MAX_WIDTH).
 * Kết quả trả về: Promise<FileUploadInfo>; ảnh đã hẹp hơn `maxWidth` (hoặc không
 *   đọc được kích thước) trả resize = 0 nghĩa là KHÔNG cần server resize.
 * Exception: không ném — ảnh lỗi trả về kích thước 0.
 */
export async function buildChapterPageUploadInfo(
  file: File,
  maxWidth = CHAPTER_PAGE_MAX_WIDTH,
): Promise<FileUploadInfo> {
  const info = await buildFileUploadInfo(file);
  if (!info.width || !info.height || info.width <= maxWidth) return info;
  return {
    ...info,
    resizeWidth: maxWidth,
    resizeHeight: Math.round(info.height * (maxWidth / info.width)),
  };
}

/**
 * Append FileUploadInfo vào FormData dạng field lồng cho ASP.NET [FromForm]
 * (vd prefix "Avatar" → "Avatar.FileName", "Avatar.Width", ...).
 *
 * Với LIST thì prefix mang chỉ số: `FileUploadInfo[0]` → "FileUploadInfo[0].FileName".
 * Chỉ số phải liên tục từ 0 thì model binder mới gom đủ phần tử.
 */
export function appendFileUploadInfo(form: FormData, prefix: string, info: FileUploadInfo): void {
  form.append(`${prefix}.FileName`, info.fileName);
  form.append(`${prefix}.ContentType`, info.contentType);
  form.append(`${prefix}.Width`, String(info.width));
  form.append(`${prefix}.Height`, String(info.height));
  form.append(`${prefix}.Length`, String(info.length));
  form.append(`${prefix}.ResizeWidth`, String(info.resizeWidth));
  form.append(`${prefix}.ResizeHeight`, String(info.resizeHeight));
  form.append(`${prefix}.ResizeLength`, String(info.resizeLength));
}
