import type {
  WorkerCurvePoint,
  WorkerLayer,
} from "../image-processing-types";

const bitmapCache = new Map<string, Promise<ImageBitmap>>();

export function clamp(v: number) {
  return (v < 0 ? 0 : v > 255 ? 255 : v) | 0;
}

export async function loadBitmap(dataUrl: string): Promise<ImageBitmap> {
  const cached = bitmapCache.get(dataUrl);
  if (cached) return cached;
  const promise = (async () => {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return createImageBitmap(blob);
  })();
  bitmapCache.set(dataUrl, promise);
  return promise;
}

export function renderTextContent(
  ctx: OffscreenCanvasRenderingContext2D,
  layer: WorkerLayer,
) {
  if (!layer.textContent) return;
  const fontSize = layer.textSize || 32;
  const fontFamily = layer.textFont || "Inter";
  const weight = layer.textBold ? "bold" : "normal";
  const style = layer.textItalic ? "italic" : "normal";
  const lineHeight = (layer.textLineHeight || 1.4) * fontSize;
  ctx.fillStyle = layer.textColor || "#000000";
  ctx.font = `${style} ${weight} ${fontSize}px ${fontFamily}, sans-serif`;
  ctx.textBaseline = "top";
  ctx.textAlign = layer.textAlign || "left";
  const textX =
    layer.textAlign === "center"
      ? layer.width / 2
      : layer.textAlign === "right"
        ? layer.width
        : 0;
  layer.textContent.split("\n").forEach((line, lineIdx) => {
    ctx.fillText(line, textX, lineIdx * lineHeight);
  });
}

export function buildCurveLUT(points: WorkerCurvePoint[]): Uint8Array {
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const lut = new Uint8Array(256);
  if (sorted.length < 2) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }
  for (let i = 0; i < 256; i++) {
    let lo = 0;
    let hi = sorted.length - 1;
    for (let j = 0; j < sorted.length - 1; j++) {
      if (i >= sorted[j].x && i <= sorted[j + 1].x) {
        lo = j;
        hi = j + 1;
        break;
      }
    }
    if (i <= sorted[0].x) {
      lut[i] = clamp(sorted[0].y);
    } else if (i >= sorted[sorted.length - 1].x) {
      lut[i] = clamp(sorted[sorted.length - 1].y);
    } else {
      const range = sorted[hi].x - sorted[lo].x;
      const t = range > 0 ? (i - sorted[lo].x) / range : 0;
      const st = t * t * (3 - 2 * t);
      lut[i] = clamp(sorted[lo].y + st * (sorted[hi].y - sorted[lo].y));
    }
  }
  return lut;
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h, s, l];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = clamp(l * 255);
    return [v, v, v];
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    clamp(hue2rgb(p, q, h + 1 / 3) * 255),
    clamp(hue2rgb(p, q, h) * 255),
    clamp(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

export function boxBlur(data: Uint8ClampedArray, w: number, h: number, radius: number) {
  if (radius < 1) return;
  const r = Math.round(radius);
  const copy = new Uint8ClampedArray(data);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rr = 0;
      let gg = 0;
      let bb = 0;
      let count = 0;
      for (let k = -r; k <= r; k++) {
        const xx = Math.min(w - 1, Math.max(0, x + k));
        const idx = (y * w + xx) * 4;
        rr += copy[idx];
        gg += copy[idx + 1];
        bb += copy[idx + 2];
        count++;
      }
      const idx = (y * w + x) * 4;
      data[idx] = (rr / count) | 0;
      data[idx + 1] = (gg / count) | 0;
      data[idx + 2] = (bb / count) | 0;
    }
  }
  const mid = new Uint8ClampedArray(data);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rr = 0;
      let gg = 0;
      let bb = 0;
      let count = 0;
      for (let k = -r; k <= r; k++) {
        const yy = Math.min(h - 1, Math.max(0, y + k));
        const idx = (yy * w + x) * 4;
        rr += mid[idx];
        gg += mid[idx + 1];
        bb += mid[idx + 2];
        count++;
      }
      const idx = (y * w + x) * 4;
      data[idx] = (rr / count) | 0;
      data[idx + 1] = (gg / count) | 0;
      data[idx + 2] = (bb / count) | 0;
    }
  }
}

export function luminanceToAlpha(
  src: OffscreenCanvasRenderingContext2D,
  w: number,
  h: number,
): OffscreenCanvas {
  const temp = new OffscreenCanvas(w, h);
  const tctx = temp.getContext("2d")!;
  tctx.drawImage(src.canvas as OffscreenCanvas, 0, 0, w, h);
  const imgData = tctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = d[i];
    d[i + 3] = lum;
    d[i] = 255;
    d[i + 1] = 255;
    d[i + 2] = 255;
  }
  tctx.putImageData(imgData, 0, 0);
  return temp;
}
