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
 * Append FileUploadInfo vào FormData dạng field lồng cho ASP.NET [FromForm]
 * (vd prefix "Avatar" → "Avatar.FileName", "Avatar.Width", ...).
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
