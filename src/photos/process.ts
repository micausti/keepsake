/**
 * Turns a camera or library photo into the copies the app needs:
 *  - full:  ~2000px JPEG kept on the device
 *  - thumb: ~400px JPEG for lists
 *  - ai:    ~1000px JPEG sent to Claude, never stored
 * Drawing to a canvas and re-encoding drops all metadata, including GPS.
 */
import { readExifDateTaken } from './exif.ts';

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

async function loadImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    // Browsers apply the EXIF orientation when decoding, so dimensions are upright.
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function encode(img: HTMLImageElement, maxEdge: number, quality: number): Promise<Blob> {
  const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight, maxEdge);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not available');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode photo'))), 'image/jpeg', quality),
  );
}

export async function processPhoto(file: File): Promise<ProcessedPhoto> {
  const takenAt = readExifDateTaken(await file.arrayBuffer()) ?? new Date(file.lastModified || Date.now());
  const img = await loadImage(file);
  const [full, thumb, ai] = await Promise.all([
    encode(img, FULL_EDGE, 0.85),
    encode(img, THUMB_EDGE, 0.8),
    encode(img, AI_EDGE, 0.8),
  ]);
  const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight, FULL_EDGE);
  return { full, thumb, ai, width, height, takenAt };
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
