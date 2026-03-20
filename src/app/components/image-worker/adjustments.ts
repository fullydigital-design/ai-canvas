import type { WorkerLayerAdjustments } from "../image-processing-types";
import { applyFilters } from "./filters";
import {
  boxBlur,
  buildCurveLUT,
  clamp,
  hslToRgb,
  rgbToHsl,
} from "./shared";

export function hasActiveAdjustments(adj?: WorkerLayerAdjustments): boolean {
  if (!adj) return false;
  if (adj.levels) {
    const l = adj.levels;
    if (
      l.inputBlack !== 0 ||
      l.inputWhite !== 255 ||
      l.gamma !== 1 ||
      l.outputBlack !== 0 ||
      l.outputWhite !== 255
    ) {
      return true;
    }
  }
  if (adj.curves) {
    const c = adj.curves;
    for (const ch of ["rgb", "red", "green", "blue"] as const) {
      const pts = c[ch];
      if (pts.length !== 2) return true;
      if (
        pts[0].x !== 0 ||
        pts[0].y !== 0 ||
        pts[1].x !== 255 ||
        pts[1].y !== 255
      ) {
        return true;
      }
    }
  }
  if (adj.colorBalance && Object.values(adj.colorBalance).some((v) => v !== 0)) {
    return true;
  }
  if (adj.hueSaturation) {
    const hs = adj.hueSaturation;
    if (hs.hue !== 0 || hs.saturation !== 0 || hs.lightness !== 0) return true;
  }
  if (adj.blurSharpen) {
    const bs = adj.blurSharpen;
    if (bs.blurRadius > 0 || bs.sharpenAmount > 0) return true;
  }
  if (adj.filters && adj.filters.some((f) => f.enabled && f.intensity > 0)) {
    return true;
  }
  return false;
}

export function applyAllAdjustments(
  imageData: ImageData,
  adjustments: WorkerLayerAdjustments,
) {
  const { data, width, height } = imageData;
  if (adjustments.levels) {
    const { inputBlack, inputWhite, gamma, outputBlack, outputWhite } =
      adjustments.levels;
    const inputRange = Math.max(1, inputWhite - inputBlack);
    const outputRange = outputWhite - outputBlack;
    const invGamma = 1 / gamma;
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
  if (adjustments.curves) {
    const rgbLUT = buildCurveLUT(adjustments.curves.rgb);
    const redLUT = buildCurveLUT(adjustments.curves.red);
    const greenLUT = buildCurveLUT(adjustments.curves.green);
    const blueLUT = buildCurveLUT(adjustments.curves.blue);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = rgbLUT[redLUT[data[i]]];
      data[i + 1] = rgbLUT[greenLUT[data[i + 1]]];
      data[i + 2] = rgbLUT[blueLUT[data[i + 2]]];
    }
  }
  if (adjustments.colorBalance) {
    const cb = adjustments.colorBalance;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
      const shadow = 1 - lum;
      const highlight = lum;
      const midtone = 1 - Math.abs(lum - 0.5) * 2;
      const rAdj =
        (cb.shadowsCyanRed * shadow +
          cb.midtonesCyanRed * midtone +
          cb.highlightsCyanRed * highlight) *
        0.01 *
        50;
      const gAdj =
        (cb.shadowsMagentaGreen * shadow +
          cb.midtonesMagentaGreen * midtone +
          cb.highlightsMagentaGreen * highlight) *
        0.01 *
        50;
      const bAdj =
        (cb.shadowsYellowBlue * shadow +
          cb.midtonesYellowBlue * midtone +
          cb.highlightsYellowBlue * highlight) *
        0.01 *
        50;
      data[i] = clamp(r + rAdj);
      data[i + 1] = clamp(g + gAdj);
      data[i + 2] = clamp(b + bAdj);
    }
  }
  if (adjustments.hueSaturation) {
    const hs = adjustments.hueSaturation;
    const hShift = hs.hue / 360;
    const sFactor = hs.saturation / 100;
    const lShift = hs.lightness / 100;
    for (let i = 0; i < data.length; i += 4) {
      let [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
      h = (h + hShift + 1) % 1;
      s = Math.max(
        0,
        Math.min(1, s + sFactor * s + (sFactor > 0 ? sFactor * (1 - s) * 0.5 : 0)),
      );
      l = Math.max(0, Math.min(1, l + lShift * (lShift > 0 ? 1 - l : l)));
      const [r, g, b] = hslToRgb(h, s, l);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  }
  if (adjustments.blurSharpen) {
    const bs = adjustments.blurSharpen;
    if (bs.blurRadius > 0) {
      const passes = Math.min(3, Math.ceil(bs.blurRadius / 8));
      const perPass = bs.blurRadius / passes;
      for (let p = 0; p < passes; p++) {
        boxBlur(data, width, height, perPass);
      }
    }
    if (bs.sharpenAmount > 0) {
      const factor = bs.sharpenAmount / 100;
      const blurred = new Uint8ClampedArray(data);
      boxBlur(blurred, width, height, bs.sharpenRadius);
      for (let i = 0; i < data.length; i += 4) {
        data[i] = clamp(data[i] + factor * (data[i] - blurred[i]));
        data[i + 1] = clamp(data[i + 1] + factor * (data[i + 1] - blurred[i + 1]));
        data[i + 2] = clamp(data[i + 2] + factor * (data[i + 2] - blurred[i + 2]));
      }
    }
  }
  if (adjustments.filters && adjustments.filters.length > 0) {
    applyFilters(data, width, height, adjustments.filters);
  }
}
