/**
 * Non-destructive image adjustment utilities.
 * All functions operate on ImageData pixel arrays.
 */
import type {
  LevelsAdjustment,
  CurvesAdjustment,
  CurvePoint,
  ColorBalanceAdjustment,
  HueSaturationAdjustment,
  BlurSharpenAdjustment,
  LayerAdjustments,
} from "./editor-store";
import { applyFilters } from "./filters-gallery";

// Clamp value to 0-255
const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v) | 0;

// ─── LEVELS ───────────────────────────────────────────────────────────
export function applyLevels(data: Uint8ClampedArray, levels: LevelsAdjustment) {
  const { inputBlack, inputWhite, gamma, outputBlack, outputWhite } = levels;
  const inputRange = Math.max(1, inputWhite - inputBlack);
  const outputRange = outputWhite - outputBlack;
  const invGamma = 1 / gamma;

  // Build LUT for speed
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let v = (i - inputBlack) / inputRange;
    v = Math.max(0, Math.min(1, v));
    v = Math.pow(v, invGamma);
    lut[i] = clamp(v * outputRange + outputBlack);
  }

  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]];
    data[i + 1] = lut[data[i + 1]];
    data[i + 2] = lut[data[i + 2]];
  }
}

// ─── CURVES ───────────────────────────────────────────────────────────
// Monotone cubic spline interpolation for curve points
function buildCurveLUT(points: CurvePoint[]): Uint8Array {
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const lut = new Uint8Array(256);

  if (sorted.length < 2) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }

  // Linear interpolation between sorted points
  for (let i = 0; i < 256; i++) {
    // Find the two points i falls between
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
      // Smoothstep for nicer curves
      const st = t * t * (3 - 2 * t);
      lut[i] = clamp(sorted[lo].y + st * (sorted[hi].y - sorted[lo].y));
    }
  }
  return lut;
}

export function applyCurves(data: Uint8ClampedArray, curves: CurvesAdjustment) {
  const rgbLUT = buildCurveLUT(curves.rgb);
  const redLUT = buildCurveLUT(curves.red);
  const greenLUT = buildCurveLUT(curves.green);
  const blueLUT = buildCurveLUT(curves.blue);

  for (let i = 0; i < data.length; i += 4) {
    // Apply per-channel first, then master RGB
    data[i] = rgbLUT[redLUT[data[i]]];
    data[i + 1] = rgbLUT[greenLUT[data[i + 1]]];
    data[i + 2] = rgbLUT[blueLUT[data[i + 2]]];
  }
}

// ─── COLOR BALANCE ────────────────────────────────────────────────────
export function applyColorBalance(
  data: Uint8ClampedArray,
  cb: ColorBalanceAdjustment
) {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;

    // Shadow/midtone/highlight weights
    const shadow = 1 - lum; // brighter at dark end
    const highlight = lum;
    const midtone = 1 - Math.abs(lum - 0.5) * 2;

    const rAdj =
      (cb.shadowsCyanRed * shadow +
        cb.midtonesCyanRed * midtone +
        cb.highlightsCyanRed * highlight) *
      0.01 * 50;
    const gAdj =
      (cb.shadowsMagentaGreen * shadow +
        cb.midtonesMagentaGreen * midtone +
        cb.highlightsMagentaGreen * highlight) *
      0.01 * 50;
    const bAdj =
      (cb.shadowsYellowBlue * shadow +
        cb.midtonesYellowBlue * midtone +
        cb.highlightsYellowBlue * highlight) *
      0.01 * 50;

    data[i] = clamp(r + rAdj);
    data[i + 1] = clamp(g + gAdj);
    data[i + 2] = clamp(b + bAdj);
  }
}

// ─── HUE / SATURATION ────────────────────────────────────────────────
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0,
    s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
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

export function applyHueSaturation(
  data: Uint8ClampedArray,
  hs: HueSaturationAdjustment
) {
  const hShift = hs.hue / 360;
  const sFactor = hs.saturation / 100;
  const lShift = hs.lightness / 100;

  for (let i = 0; i < data.length; i += 4) {
    let [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    h = (h + hShift + 1) % 1;
    s = Math.max(0, Math.min(1, s + sFactor * s + (sFactor > 0 ? sFactor * (1 - s) * 0.5 : 0)));
    l = Math.max(0, Math.min(1, l + lShift * (lShift > 0 ? 1 - l : l)));
    const [r, g, b] = hslToRgb(h, s, l);
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}

// ─── BLUR (Box Blur — fast approximation of Gaussian) ─────────────────
function boxBlur(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  radius: number
) {
  if (radius < 1) return;
  const r = Math.round(radius);
  const copy = new Uint8ClampedArray(data);

  // Horizontal pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rr = 0, gg = 0, bb = 0, count = 0;
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

  // Copy intermediate result
  const mid = new Uint8ClampedArray(data);

  // Vertical pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rr = 0, gg = 0, bb = 0, count = 0;
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

// ─── SHARPEN (Unsharp Mask) ───────────────────────────────────────────
function unsharpMask(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  amount: number,
  radius: number
) {
  if (amount <= 0) return;
  const factor = amount / 100;

  // Create blurred copy
  const blurred = new Uint8ClampedArray(data);
  boxBlur(blurred, w, h, radius);

  // Sharpen = original + factor * (original - blurred)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clamp(data[i] + factor * (data[i] - blurred[i]));
    data[i + 1] = clamp(data[i + 1] + factor * (data[i + 1] - blurred[i + 1]));
    data[i + 2] = clamp(data[i + 2] + factor * (data[i + 2] - blurred[i + 2]));
  }
}

export function applyBlurSharpen(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  bs: BlurSharpenAdjustment
) {
  if (bs.blurRadius > 0) {
    // Multiple passes for better approximation of Gaussian
    const passes = Math.min(3, Math.ceil(bs.blurRadius / 8));
    const perPass = bs.blurRadius / passes;
    for (let p = 0; p < passes; p++) {
      boxBlur(data, w, h, perPass);
    }
  }
  if (bs.sharpenAmount > 0) {
    unsharpMask(data, w, h, bs.sharpenAmount, bs.sharpenRadius);
  }
}

// ─── MASTER: Apply all adjustments to an ImageData ────────────────────
export function applyAllAdjustments(
  imageData: ImageData,
  adjustments: LayerAdjustments
): ImageData {
  const { data, width, height } = imageData;

  // Order: Levels → Curves → Color Balance → Hue/Sat → Blur/Sharpen
  if (adjustments.levels) {
    applyLevels(data, adjustments.levels);
  }
  if (adjustments.curves) {
    applyCurves(data, adjustments.curves);
  }
  if (adjustments.colorBalance) {
    applyColorBalance(data, adjustments.colorBalance);
  }
  if (adjustments.hueSaturation) {
    applyHueSaturation(data, adjustments.hueSaturation);
  }
  if (adjustments.blurSharpen) {
    applyBlurSharpen(data, width, height, adjustments.blurSharpen);
  }
  if (adjustments.filters && adjustments.filters.length > 0) {
    applyFilters(data, width, height, adjustments.filters);
  }

  return imageData;
}

// Check if adjustments are at default (no-op) values
export function hasActiveAdjustments(adj?: LayerAdjustments): boolean {
  if (!adj) return false;
  if (adj.levels) {
    const l = adj.levels;
    if (l.inputBlack !== 0 || l.inputWhite !== 255 || l.gamma !== 1 || l.outputBlack !== 0 || l.outputWhite !== 255)
      return true;
  }
  if (adj.curves) {
    const c = adj.curves;
    for (const ch of ["rgb", "red", "green", "blue"] as const) {
      const pts = c[ch];
      if (pts.length !== 2) return true;
      if (pts[0].x !== 0 || pts[0].y !== 0 || pts[1].x !== 255 || pts[1].y !== 255) return true;
    }
  }
  if (adj.colorBalance) {
    const cb = adj.colorBalance;
    if (Object.values(cb).some((v) => v !== 0)) return true;
  }
  if (adj.hueSaturation) {
    const hs = adj.hueSaturation;
    if (hs.hue !== 0 || hs.saturation !== 0 || hs.lightness !== 0) return true;
  }
  if (adj.blurSharpen) {
    const bs = adj.blurSharpen;
    if (bs.blurRadius > 0 || bs.sharpenAmount > 0) return true;
  }
  if (adj.filters && adj.filters.length > 0) {
    if (adj.filters.some((f) => f.enabled && f.intensity > 0)) return true;
  }
  return false;
}