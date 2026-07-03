// Image preprocessing + cropping helpers for OCR. Everything runs on a canvas,
// no dependencies. Used to turn a user-dragged region into a clean, upscaled,
// high-contrast bitmap that tesseract.js can read accurately.

/** A rectangle in natural (source-pixel) image coordinates. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const CROP_TARGET_LONG_EDGE = 1400; // upscale small crops so text is large enough

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image for OCR"));
    img.src = src;
  });
}

/**
 * Grayscale (luminance) + contrast-stretch + auto-invert, applied in place.
 * Spreads weakly-separated colors apart before tesseract's own thresholding,
 * and makes text dark-on-light regardless of the original background.
 */
export function preprocessCanvasInPlace(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not get 2D canvas context");

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = imageData.data;

  const gray = new Float32Array(px.length / 4);
  let min = 255;
  let max = 0;
  let sum = 0;
  for (let i = 0, g = 0; i < px.length; i += 4, g++) {
    const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    gray[g] = lum;
    if (lum < min) min = lum;
    if (lum > max) max = lum;
    sum += lum;
  }

  const range = max - min || 1;
  const mean = sum / gray.length;
  // If the average pixel is dark, the background is likely dark → invert so
  // text becomes dark-on-light (what tesseract's binarizer expects).
  const invert = mean < 128;

  for (let i = 0, g = 0; i < px.length; i += 4, g++) {
    let v = ((gray[g] - min) / range) * 255;
    if (invert) v = 255 - v;
    px[i] = px[i + 1] = px[i + 2] = v;
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Crop a sub-rectangle (in natural image pixels) into a new canvas, upscaled so
 * the long edge is comfortable for OCR, then run the preprocessing pass.
 */
export function cropAndPreprocess(
  img: HTMLImageElement,
  rect: Rect,
): HTMLCanvasElement {
  // Clamp the rect to the image bounds.
  const sx = Math.max(0, Math.min(rect.x, img.naturalWidth));
  const sy = Math.max(0, Math.min(rect.y, img.naturalHeight));
  const sw = Math.max(1, Math.min(rect.width, img.naturalWidth - sx));
  const sh = Math.max(1, Math.min(rect.height, img.naturalHeight - sy));

  const longEdge = Math.max(sw, sh);
  const scale = longEdge < CROP_TARGET_LONG_EDGE ? CROP_TARGET_LONG_EDGE / longEdge : 1;
  const width = Math.max(1, Math.round(sw * scale));
  const height = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not get 2D canvas context");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);

  preprocessCanvasInPlace(canvas);
  return canvas;
}
