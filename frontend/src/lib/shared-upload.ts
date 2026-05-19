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

const STORAGE_KEY = 'eti_shared_upload_payload_v1';

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

/** PNG/WebP (by MIME or filename) may carry alpha; JPEG family typically does not. */
function imageFormatLikelyHasAlpha(file: File): boolean {
  const type = (file.type || '').toLowerCase();
  if (type === 'image/png' || type === 'image/webp') return true;
  const name = file.name.toLowerCase();
  return /\.(png|webp)$/.test(name);
}

/**
 * True if sampled canvas pixels are almost a single flat color (e.g. solid white
 * after white fill + invisible draw, or solid black when decode produced no opaque pixels).
 */
function canvasLooksUniformlyFlat(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  if (w < 4 || h < 4) return false;
  const step = Math.max(8, Math.floor(Math.min(w, h) / 24));
  let minR = 255;
  let maxR = 0;
  let minG = 255;
  let maxG = 0;
  let minB = 255;
  let maxB = 0;
  for (let y = step; y < h - step; y += step) {
    for (let x = step; x < w - step; x += step) {
      const d = ctx.getImageData(x, y, 1, 1).data;
      const r = d[0];
      const g = d[1];
      const b = d[2];
      minR = Math.min(minR, r);
      maxR = Math.max(maxR, r);
      minG = Math.min(minG, g);
      maxG = Math.max(maxG, g);
      minB = Math.min(minB, b);
      maxB = Math.max(maxB, b);
    }
  }
  const range = Math.max(maxR - minR, maxG - minG, maxB - minB);
  return range < 10;
}

/** Screenshots are usually large; tiny icons should not trigger flat fallback. */
const MIN_FILE_BYTES_FOR_FLAT_CANVAS_FALLBACK = 8192;

/**
 * Read an image File as a base64 JPEG string using the browser's native image
 * decode pipeline instead of FileReader.
 *
 * Purpose: On some Android devices (e.g. Poco M7 Pro on HyperOS), File objects from
 * `capture="environment"` inputs are backed by a MediaStore content URI that
 * Chrome's JavaScript file-reading APIs (FileReader, arrayBuffer()) cannot read
 * reliably — they return empty or truncated data. FileReader works correctly only
 * on blobs that are already fully in memory (e.g. network response blobs).
 *
 * Solution: Load the image via `new Image()` from a blob: URL. Chrome's image
 * loading pipeline reads the content URI through its native C++/JNI layer
 * (the same path used to display <img> tags), bypassing the broken JS binding.
 * Once the image is decoded into GPU memory, `canvas.toBlob()` produces a fresh
 * in-memory JPEG Blob that FileReader can read reliably.
 *
 * JPEG vs alpha: Some vendor builds (HyperOS observed) save screenshots as `.jpg`. Filling the canvas white
 * before `drawImage` is only applied when the file is likely PNG/WebP (alpha).
 * For `.jpg`, an all-transparent decode bug would composite over white and yield
 * a useless all-white JPEG; without the pre-fill, the same bug yields a flat dark
 * canvas which we detect and fall back to `blobToBase64(file)` for gallery picks
 * where FileReader still returns full bytes.
 *
 * Fallback: if the canvas approach fails (e.g. unsupported image format), or the
 * painted result is a uniform flat color on a non-trivial file size, use FileReader.
 *
 * @param file  Image File from a file input (any source, any MIME type)
 * @returns     Raw base64 string (no data-URL prefix) of the image as JPEG
 */
/**
 * Compress an image File for upload as a JSON base64 payload.
 *
 * Purpose: Camera photos on modern phones (12-50MP) can be 8-12MB raw.
 * When base64-encoded, they become 11-16MB, exceeding Vercel's 4.5MB
 * serverless function body-size limit. The backend Express JSON limit
 * is 10MB, which may also be exceeded.
 *
 * Solution: Load the image via canvas, resize to max 1600px dimension,
 * and export as JPEG at 80% quality. This typically reduces a 10MB
 * camera photo to 200-400KB — well within all payload limits while
 * preserving enough quality for receipt legibility.
 *
 * @param file   Image File from a file input or camera capture
 * @returns      Raw base64 string (no data-URL prefix) of the compressed JPEG
 */
export function compressImageForUpload(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    // PDF files cannot be compressed via canvas — pass through as-is
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      blobToBase64(file).then(resolve).catch(reject);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      void (async () => {
        try {
          try { await img.decode(); } catch { /* decode() is optional */ }

          const naturalW = img.naturalWidth;
          const naturalH = img.naturalHeight;

          if (naturalW === 0 || naturalH === 0) {
            // Zero-dimension image — fallback to raw reader
            const raw = await blobToBase64(file);
            resolve(raw);
            return;
          }

          // Resize to max 1600px on the long side for receipt readability
          const MAX_DIM = 1600;
          let w = naturalW;
          let h = naturalH;
          if (w > MAX_DIM || h > MAX_DIM) {
            const scale = MAX_DIM / Math.max(w, h);
            w = Math.round(w * scale);
            h = Math.round(h * scale);
          }

          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            const raw = await blobToBase64(file);
            resolve(raw);
            return;
          }

          // White background for alpha-capable formats
          if (imageFormatLikelyHasAlpha(file)) {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, w, h);
          }
          ctx.drawImage(img, 0, 0, w, h);

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                blobToBase64(file).then(resolve).catch(reject);
                return;
              }
              blobToBase64(blob).then(resolve).catch(reject);
            },
            'image/jpeg',
            0.80
          );
        } catch {
          // Any failure — fallback to raw
          blobToBase64(file).then(resolve).catch(reject);
        }
      })();
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      blobToBase64(file).then(resolve).catch(reject);
    };

    img.src = objectUrl;
  });
}

export function readImageFileAsBase64(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      void (async () => {
        try {
          try {
            await img.decode();
          } catch {
            // decode() is optional; onload already fired
          }

          const naturalW = img.naturalWidth;
          const naturalH = img.naturalHeight;

          // If Chrome "loaded" the image but got no pixel data (can happen when
          // the OS/Chrome stack blocks content-URI pixel access for certain file types like
          // screenshots), reject so the fallback can handle it.
          if (naturalW === 0 || naturalH === 0) {
            reject(new Error('image loaded with zero dimensions'));
            return;
          }

          // Scale down to avoid canvas OOM on mobile.
          // The server already resizes to 1200px; 1920px gives us headroom.
          const MAX_DIM = 1920;
          let w = naturalW;
          let h = naturalH;
          if (w > MAX_DIM || h > MAX_DIM) {
            const scale = MAX_DIM / Math.max(w, h);
            w = Math.round(w * scale);
            h = Math.round(h * scale);
          }

          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('canvas context unavailable'));
            return;
          }

          const needsOpaqueBackground = imageFormatLikelyHasAlpha(file);
          if (needsOpaqueBackground) {
            // JPEG has no alpha; transparent PNG/WebP pixels would composite over
            // the default transparent-black canvas and look black in the export.
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, w, h);
          }
          ctx.drawImage(img, 0, 0, w, h);

          if (
            canvasLooksUniformlyFlat(ctx, w, h) &&
            file.size >= MIN_FILE_BYTES_FOR_FLAT_CANVAS_FALLBACK
          ) {
            const raw = await blobToBase64(file);
            if (raw && raw.length >= 256) {
              resolve(raw);
              return;
            }
          }

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('canvas toBlob produced no output'));
                return;
              }
              blobToBase64(blob).then(resolve).catch(reject);
            },
            'image/jpeg',
            0.92,
          );
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      })();
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      // Canvas path failed (e.g. unsupported codec) — fall back to FileReader
      blobToBase64(file).then(resolve).catch(reject);
    };

    img.src = objectUrl;
  });
}

// ---------------------------------------------------------------------------
// Attachment-grade image compression (high quality, multipart-friendly)
// ---------------------------------------------------------------------------

export interface AttachmentCompressionOptions {
  /** Max dimension on the long side, in pixels. Default 2400. */
  maxDim?: number;
  /** JPEG quality 0..1. Default 0.92 (handwriting-safe). */
  quality?: number;
  /** Files smaller than this many bytes are passed through unchanged. Default 400KB. */
  passThroughBelowBytes?: number;
}

/**
 * Strip the file extension from a filename. Returns the input unchanged if no
 * extension is present.
 */
function stripFileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return name;
  return name.slice(0, dot);
}

/**
 * Determine if a file is an image we can losslessly transcode to JPEG via
 * canvas without breaking semantics. GIF (animated), SVG (vector), and ICO
 * are intentionally excluded — converting them to JPEG would be lossy in a
 * way the user does not expect.
 */
function isCompressibleImage(file: File): boolean {
  const type = (file.type || '').toLowerCase();
  if (type === 'image/gif' || type === 'image/svg+xml' || type === 'image/x-icon') return false;
  if (type.startsWith('image/')) return true;

  // Some Android share targets do not set MIME — fall back to extension.
  const lowerName = file.name.toLowerCase();
  return /\.(jpg|jpeg|png|webp|heic|heif|bmp|tiff?)$/.test(lowerName);
}

/**
 * Compress an image File for upload as part of a multipart/form-data request.
 *
 * Purpose: Order attachments (and similar large-payload uploads) are sent
 * straight to the backend without the JSON encoding step used for receipts,
 * but they still hit Vercel's ~4.5MB rewrite body limit. Phone screenshots
 * (PNG, 3-8MB) routinely exceed that limit, returning 413.
 *
 * Operation: Loads the image via the browser's native decode pipeline (using
 * a blob: URL → <img> → canvas), resizes to a max long-side of `maxDim`
 * pixels (default 2400 — preserves handwritten-text legibility on A4 at
 * ~300 DPI equivalent), and re-encodes as JPEG at `quality` (default 0.92,
 * effectively lossless for OCR / human reading).
 *
 * - PDFs, GIFs, SVGs, ICO, and any non-image MIME → returned as-is.
 * - Files already smaller than `passThroughBelowBytes` (default 400KB) →
 *   returned as-is to avoid wasted CPU and unnecessary transcoding.
 * - On any failure (decode error, canvas OOM, toBlob returns null) → the
 *   original file is returned unchanged so the upload still has a chance to
 *   succeed (multer / nginx will reject if too large, surfacing a friendly
 *   413 message via api.ts).
 *
 * The returned File preserves the original stem with `.jpg` appended and
 * `type: 'image/jpeg'`, so the backend `mime_type` stored in
 * `order_attachments` reflects the actual on-disk format.
 *
 * @param file     Image File from a file input (any source, any MIME type)
 * @param options  Optional overrides for max dimension / quality / threshold
 * @returns        A new compressed File (or the original on no-op / failure)
 */
export async function compressImageFileForAttachment(
  file: File,
  options: AttachmentCompressionOptions = {}
): Promise<File> {
  const maxDim = options.maxDim ?? 2400;
  const quality = options.quality ?? 0.92;
  const passThroughBelowBytes = options.passThroughBelowBytes ?? 400 * 1024;

  if (!isCompressibleImage(file)) return file;
  if (file.size <= passThroughBelowBytes) return file;

  return new Promise<File>((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    const finishWithOriginal = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    img.onload = () => {
      void (async () => {
        try {
          try { await img.decode(); } catch { /* decode() is optional */ }

          const naturalW = img.naturalWidth;
          const naturalH = img.naturalHeight;
          if (naturalW === 0 || naturalH === 0) {
            finishWithOriginal();
            return;
          }

          let w = naturalW;
          let h = naturalH;
          if (w > maxDim || h > maxDim) {
            const scale = maxDim / Math.max(w, h);
            w = Math.round(w * scale);
            h = Math.round(h * scale);
          }

          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            finishWithOriginal();
            return;
          }

          // JPEG has no alpha channel — composite alpha-capable formats
          // (PNG/WebP) over white so transparent regions don't render as black.
          if (imageFormatLikelyHasAlpha(file)) {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, w, h);
          }
          ctx.drawImage(img, 0, 0, w, h);

          // Detect catastrophic decode failures (uniform flat canvas) on
          // non-trivial source files; in that case keep the original bytes.
          if (
            canvasLooksUniformlyFlat(ctx, w, h) &&
            file.size >= MIN_FILE_BYTES_FOR_FLAT_CANVAS_FALLBACK
          ) {
            finishWithOriginal();
            return;
          }

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                finishWithOriginal();
                return;
              }

              // If compression somehow produced a larger file (rare; happens
              // with tiny already-compressed JPEGs), keep the original.
              if (blob.size >= file.size) {
                finishWithOriginal();
                return;
              }

              URL.revokeObjectURL(objectUrl);
              const newName = `${stripFileExtension(file.name)}.jpg`;
              const compressed = new File([blob], newName, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              resolve(compressed);
            },
            'image/jpeg',
            quality
          );
        } catch {
          finishWithOriginal();
        }
      })();
    };

    img.onerror = () => {
      finishWithOriginal();
    };

    img.src = objectUrl;
  });
}

/**
 * Compress a batch of files in parallel for attachment upload. Non-image
 * files (PDFs etc.) are passed through unchanged. Failures are swallowed —
 * the original file is returned for any item that fails compression.
 */
export async function prepareAttachmentsForUpload(
  files: File[],
  options?: AttachmentCompressionOptions
): Promise<File[]> {
  return Promise.all(files.map((f) => compressImageFileForAttachment(f, options)));
}
