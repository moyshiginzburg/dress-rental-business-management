export type SharedUploadContext =
  | 'transaction_income'
  | 'transaction_expense'
  | 'order_deposit'
  | 'dress_add'
  | 'dress_edit';

export interface SharedUploadPayload {
  id: string;
  fileName: string;
  mimeType: string;
  base64: string;
  createdAt: number;
  source: 'android_share_target';
}

const STORAGE_KEY = 'shared_upload_payload_v1';

function canUseStorage() {
  return typeof window !== 'undefined' && !!window.sessionStorage;
}

export function saveSharedUploadPayload(payload: SharedUploadPayload) {
  if (!canUseStorage()) return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function getSharedUploadPayload(): SharedUploadPayload | null {
  if (!canUseStorage()) return null;
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as SharedUploadPayload;
    if (!parsed?.base64 || !parsed?.fileName) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSharedUploadPayload() {
  if (!canUseStorage()) return;
  window.sessionStorage.removeItem(STORAGE_KEY);
}

export function base64ToFile(base64: string, fileName: string, mimeType: string): File {
  const cleaned = base64.includes(',') ? base64.split(',')[1] : base64;
  const byteChars = atob(cleaned);
  const byteNumbers = new Array(byteChars.length);

  for (let i = 0; i < byteChars.length; i += 1) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }

  const byteArray = new Uint8Array(byteNumbers);
  return new File([byteArray], fileName, { type: mimeType || 'application/octet-stream' });
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Failed to read blob'));
        return;
      }
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
}
