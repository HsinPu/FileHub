import { UPLOAD_LIMITS } from '@filehub/contracts';

const encoder = new TextEncoder();
export const joinUploadPath = (parent: string, child: string) => parent ? `${parent}/${child}` : child;
export function uploadRelativePath(value: string) {
  const parts = value.split('/');
  if (!value || value.length > 1024 || !value.isWellFormed() || parts.length > 64 || value.includes('\\') || [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
    || parts.some((part) => !part || part === '.' || part === '..' || part !== part.trim() || /[. ]$/.test(part) || /[<>:"|?*]/.test(part) || encoder.encode(part).length > 255 || part.toLowerCase() === '.filehub' || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error('名稱或資料夾路徑不支援；請檢查長度、保留名稱與特殊字元。');
  return parts;
}
export function planSelection(files: readonly File[], folder: boolean, parent: string) {
  const paths = files.map((file) => folder ? file.webkitRelativePath : file.name);
  return files.map((file, index) => {
    const path = paths[index] ?? file.name;
    let error: string | undefined;
    try {
      uploadRelativePath(path); uploadRelativePath(joinUploadPath(parent, path));
      if (file.size > UPLOAD_LIMITS.fileBytes) throw new Error('單一檔案不可超過 1 GiB。');
      if (paths.some((other, otherIndex) => index !== otherIndex && (other === path || other.startsWith(`${path}/`) || path.startsWith(`${other}/`)))) throw new Error('選取內容有重複名稱或檔案／資料夾衝突，請分開選取。');
    } catch (reason) { error = reason instanceof Error ? reason.message : '無法使用此檔案。'; }
    return { file, path, ...(error ? { error } : {}) };
  });
}
export const uploadSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KiB` : `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
