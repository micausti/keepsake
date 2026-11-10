/**
 * Turns a camera or library photo into the copies the app needs:
 *  - full:  ~2000px JPEG kept on the device
 *  - thumb: ~400px JPEG for lists
 *  - ai:    ~1000px JPEG sent to Claude, never stored
 * Drawing to a canvas and re-encoding drops all metadata, including GPS.
 */
import { readExif } from './exif.ts';

export const FULL_EDGE = 2000;
export const THUMB_EDGE = 400;
export const AI_EDGE = 1000;

export interface ProcessedPhoto {
  full: Blob;
  thumb: Blob;
  ai: Blob;
  width: number;
  height: number;
  takenAt: Date;
}

/** Scales (width, height) down so the longer edge is at most `maxEdge`. Never scales up. */
export function fitWithin(width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Canvas transform [a, b, c, d, e, f] that draws raw w×h pixels upright for an EXIF orientation. */
export function orientationMatrix(orientation: number, w: number, h: number): [number, number, number, number, number, number] {
  switch (orientation) {
    case 2:
      return [-1, 0, 0, 1, w, 0];
    case 3:
      return [-1, 0, 0, -1, w, h];
    case 4:
      return [1, 0, 0, -1, 0, h];
    case 5:
      return [0, 1, 1, 0, 0, 0];
    case 6:
      return [0, 1, -1, 0, h, 0];
    case 7:
      return [0, -1, -1, 0, h, w];
    case 8:
      return [0, -1, 1, 0, 0, w];
    default:
      return [1, 0, 0, 1, 0, 0];
  }
}

/** Orientations 5–8 turn the picture a quarter turn, swapping width and height. */
const swapsSides = (orientation: number) => orientation >= 5 && orientation <= 8;

/** How this browser treats EXIF orientation when decoding and drawing images. */
export interface OrientationHandling {
  /** naturalWidth/naturalHeight are already upright. */
  sizeUpright: boolean;
  /** drawImage paints the picture upright. */
  drawUpright: boolean;
}

export interface DrawPlan {
  canvasWidth: number;
  canvasHeight: number;
  /** Transform to set before drawing, or null to draw as-is. */
  matrix: [number, number, number, number, number, number] | null;
  drawWidth: number;
  drawHeight: number;
}

/**
 * Works out how to draw an image upright at most `maxEdge` px, whatever the
 * browser already does with the EXIF orientation, so it's never turned twice.
 */
export function planDraw(
  natural: { width: number; height: number },
  orientation: number,
  handling: OrientationHandling,
  maxEdge: number,
): DrawPlan {
  const swap = swapsSides(orientation);
  if (orientation === 1 || handling.drawUpright) {
    // The browser paints it upright; size the canvas to the upright shape.
    const upright = handling.sizeUpright || !swap ? natural : { width: natural.height, height: natural.width };
    const { width, height } = fitWithin(upright.width, upright.height, maxEdge);
    return { canvasWidth: width, canvasHeight: height, matrix: null, drawWidth: width, drawHeight: height };
  }
  // The browser paints raw pixels: turn them ourselves.
  const raw = handling.sizeUpright && swap ? { width: natural.height, height: natural.width } : natural;
  const { width, height } = fitWithin(raw.width, raw.height, maxEdge);
  return {
    canvasWidth: swap ? height : width,
    canvasHeight: swap ? width : height,
    matrix: orientationMatrix(orientation, width, height),
    drawWidth: width,
    drawHeight: height,
  };
}

async function loadImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode photo'))), 'image/jpeg', quality),
  );
}

function render(img: HTMLImageElement, plan: DrawPlan): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = plan.canvasWidth;
  canvas.height = plan.canvasHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not available');
  ctx.imageSmoothingQuality = 'high';
  if (plan.matrix) ctx.setTransform(...plan.matrix);
  ctx.drawImage(img, 0, 0, plan.drawWidth, plan.drawHeight);
  return canvas;
}

let handlingPromise: Promise<OrientationHandling> | undefined;

/**
 * Finds out once how this browser handles EXIF orientation, using a 16×8
 * test JPEG (red left half, blue right) tagged "rotate 90° clockwise".
 * Upright it is 8×16 with red on top and blue at the bottom.
 */
export function orientationHandling(): Promise<OrientationHandling> {
  handlingPromise ??= (async () => {
    const source = document.createElement('canvas');
    source.width = 16;
    source.height = 8;
    const sctx = source.getContext('2d');
    if (!sctx) throw new Error('Canvas not available');
    sctx.fillStyle = '#ff0000';
    sctx.fillRect(0, 0, 8, 8);
    sctx.fillStyle = '#0000ff';
    sctx.fillRect(8, 0, 8, 8);
    const jpeg = new Uint8Array(await (await toJpeg(source, 0.95)).arrayBuffer());
    const tagged = new Blob([jpeg.slice(0, 2), orientationSegment(6), jpeg.slice(2)], { type: 'image/jpeg' });
    const img = await loadImage(tagged);
    const sizeUpright = img.naturalWidth === 8 && img.naturalHeight === 16;
    const probe = document.createElement('canvas');
    probe.width = 8;
    probe.height = 16;
    const pctx = probe.getContext('2d');
    if (!pctx) throw new Error('Canvas not available');
    pctx.drawImage(img, 0, 0, 8, 16);
    const [r, , b] = pctx.getImageData(2, 13, 1, 1).data;
    return { sizeUpright, drawUpright: (b ?? 0) > (r ?? 0) };
  })().catch(() => {
    handlingPromise = undefined;
    // Modern browsers draw upright; assume that if the check itself fails.
    return { sizeUpright: true, drawUpright: true };
  });
  return handlingPromise;
}

/** A minimal APP1 EXIF segment holding only an orientation tag. */
function orientationSegment(orientation: number): Uint8Array<ArrayBuffer> {
  const tiff = [0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0];
  const payload = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const length = payload.length + 2;
  return new Uint8Array([0xff, 0xe1, length >> 8, length & 0xff, ...payload]);
}

export async function processPhoto(file: File): Promise<ProcessedPhoto> {
  const exif = readExif(await file.arrayBuffer());
  const takenAt = exif.dateTaken ?? new Date(file.lastModified || Date.now());
  const [img, handling] = await Promise.all([loadImage(file), orientationHandling()]);
  const natural = { width: img.naturalWidth, height: img.naturalHeight };
  const plan = (edge: number) => planDraw(natural, exif.orientation, handling, edge);
  const fullPlan = plan(FULL_EDGE);
  const [full, thumb, ai] = await Promise.all([
    toJpeg(render(img, fullPlan), 0.85),
    toJpeg(render(img, plan(THUMB_EDGE)), 0.8),
    toJpeg(render(img, plan(AI_EDGE)), 0.8),
  ]);
  return { full, thumb, ai, width: fullPlan.canvasWidth, height: fullPlan.canvasHeight, takenAt };
}

/** Turns an already-processed JPEG (no EXIF) a quarter turn clockwise. */
export async function rotateJpeg(blob: Blob, quality = 0.85): Promise<{ blob: Blob; width: number; height: number }> {
  const img = await loadImage(blob);
  const plan = planDraw(
    { width: img.naturalWidth, height: img.naturalHeight },
    6,
    { sizeUpright: false, drawUpright: false },
    Number.MAX_SAFE_INTEGER,
  );
  return { blob: await toJpeg(render(img, plan), quality), width: plan.canvasWidth, height: plan.canvasHeight };
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
