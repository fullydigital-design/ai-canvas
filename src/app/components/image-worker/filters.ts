import type { WorkerFilterPreset } from "../image-processing-types";
import { clamp } from "./shared";

export function applyFilters(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  filters: WorkerFilterPreset[],
) {
  for (const filter of filters) {
    if (!filter.enabled || filter.intensity <= 0) continue;
    const t = filter.intensity / 100;
    switch (filter.type) {
      case "blur":
        applyBoxBlur({ data, width, height } as ImageData, Math.round(t * 20));
        break;
      case "sharpen":
        applySharpen({ data, width, height } as ImageData, t * 2);
        break;
      case "noise":
        applyNoise({ data, width, height } as ImageData, t * 80);
        break;
      case "vignette":
        applyVignette({ data, width, height } as ImageData, t);
        break;
      case "grain":
        applyGrain({ data, width, height } as ImageData, t * 60);
        break;
      case "sepia":
        applySepia({ data, width, height } as ImageData, t);
        break;
      case "invert":
        applyInvert({ data, width, height } as ImageData, t);
        break;
      case "posterize":
        applyPosterize(
          { data, width, height } as ImageData,
          Math.max(2, Math.round(2 + (1 - t) * 14)),
        );
        break;
      case "emboss":
        applyEmboss({ data, width, height } as ImageData, t);
        break;
      case "pixelate":
        applyPixelate(
          { data, width, height } as ImageData,
          Math.max(1, Math.round(t * 30)),
        );
        break;
      case "chromatic-aberration":
        applyChromaticAberration(
          { data, width, height } as ImageData,
          Math.round(t * 10),
        );
        break;
      case "glow":
        applyGlow({ data, width, height } as ImageData, t);
        break;
    }
  }
}

function applyBoxBlur(data: ImageData, radius: number) {
  if (radius < 1) return;
  const w = data.width;
  const h = data.height;
  const d = data.data;
  const copy = new Uint8ClampedArray(d);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            const i = (ny * w + nx) * 4;
            r += copy[i];
            g += copy[i + 1];
            b += copy[i + 2];
            count++;
          }
        }
      }
      const i = (y * w + x) * 4;
      d[i] = r / count;
      d[i + 1] = g / count;
      d[i + 2] = b / count;
    }
  }
}

function applySharpen(data: ImageData, amount: number) {
  const w = data.width;
  const h = data.height;
  const d = data.data;
  const copy = new Uint8ClampedArray(d);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const center = copy[i + c] * (1 + 4 * amount);
        const neighbors =
          (copy[((y - 1) * w + x) * 4 + c] +
            copy[((y + 1) * w + x) * 4 + c] +
            copy[(y * w + x - 1) * 4 + c] +
            copy[(y * w + x + 1) * 4 + c]) *
          amount;
        d[i + c] = clamp(center - neighbors);
      }
    }
  }
}

function applyNoise(data: ImageData, amount: number) {
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const noise = (Math.random() - 0.5) * amount;
    d[i] = clamp(d[i] + noise);
    d[i + 1] = clamp(d[i + 1] + noise);
    d[i + 2] = clamp(d[i + 2] + noise);
  }
}

function applyVignette(data: ImageData, strength: number) {
  const w = data.width;
  const h = data.height;
  const d = data.data;
  const cx = w / 2;
  const cy = h / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const factor = 1 - (dist / maxDist) * strength;
      const clamped = Math.max(0, factor);
      const i = (y * w + x) * 4;
      d[i] = clamp(d[i] * clamped);
      d[i + 1] = clamp(d[i + 1] * clamped);
      d[i + 2] = clamp(d[i + 2] * clamped);
    }
  }
}

function applyGrain(data: ImageData, amount: number) {
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const grain = (Math.random() - 0.5) * amount;
    const lum = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
    const grainAmount = grain * (1 - Math.abs(lum - 0.5) * 2);
    d[i] = clamp(d[i] + grainAmount);
    d[i + 1] = clamp(d[i + 1] + grainAmount);
    d[i + 2] = clamp(d[i + 2] + grainAmount);
  }
}

function applySepia(data: ImageData, t: number) {
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const sr = clamp(r * 0.393 + g * 0.769 + b * 0.189);
    const sg = clamp(r * 0.349 + g * 0.686 + b * 0.168);
    const sb = clamp(r * 0.272 + g * 0.534 + b * 0.131);
    d[i] = clamp(r + (sr - r) * t);
    d[i + 1] = clamp(g + (sg - g) * t);
    d[i + 2] = clamp(b + (sb - b) * t);
  }
}

function applyInvert(data: ImageData, t: number) {
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = clamp(d[i] + (255 - 2 * d[i]) * t);
    d[i + 1] = clamp(d[i + 1] + (255 - 2 * d[i + 1]) * t);
    d[i + 2] = clamp(d[i + 2] + (255 - 2 * d[i + 2]) * t);
  }
}

function applyPosterize(data: ImageData, levels: number) {
  const d = data.data;
  const step = 255 / (levels - 1);
  for (let i = 0; i < d.length; i += 4) {
    d[i] = clamp(Math.round(d[i] / step) * step);
    d[i + 1] = clamp(Math.round(d[i + 1] / step) * step);
    d[i + 2] = clamp(Math.round(d[i + 2] / step) * step);
  }
}

function applyEmboss(data: ImageData, strength: number) {
  const w = data.width;
  const h = data.height;
  const d = data.data;
  const copy = new Uint8ClampedArray(d);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const tl = copy[((y - 1) * w + x - 1) * 4 + c];
        const br = copy[((y + 1) * w + x + 1) * 4 + c];
        const embossed = clamp(128 + (br - tl) * strength * 2);
        d[i + c] = clamp(d[i + c] * (1 - strength) + embossed * strength);
      }
    }
  }
}

function applyPixelate(data: ImageData, blockSize: number) {
  if (blockSize < 2) return;
  const w = data.width;
  const h = data.height;
  const d = data.data;
  for (let y = 0; y < h; y += blockSize) {
    for (let x = 0; x < w; x += blockSize) {
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let dy = 0; dy < blockSize && y + dy < h; dy++) {
        for (let dx = 0; dx < blockSize && x + dx < w; dx++) {
          const i = ((y + dy) * w + x + dx) * 4;
          r += d[i];
          g += d[i + 1];
          b += d[i + 2];
          count++;
        }
      }
      r = r / count;
      g = g / count;
      b = b / count;
      for (let dy = 0; dy < blockSize && y + dy < h; dy++) {
        for (let dx = 0; dx < blockSize && x + dx < w; dx++) {
          const i = ((y + dy) * w + x + dx) * 4;
          d[i] = r;
          d[i + 1] = g;
          d[i + 2] = b;
        }
      }
    }
  }
}

function applyChromaticAberration(data: ImageData, offset: number) {
  if (offset < 1) return;
  const w = data.width;
  const h = data.height;
  const d = data.data;
  const copy = new Uint8ClampedArray(d);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const rxSrc = Math.min(w - 1, Math.max(0, x - offset));
      const bxSrc = Math.min(w - 1, Math.max(0, x + offset));
      d[i] = copy[(y * w + rxSrc) * 4];
      d[i + 2] = copy[(y * w + bxSrc) * 4 + 2];
    }
  }
}

function applyGlow(data: ImageData, strength: number) {
  const w = data.width;
  const h = data.height;
  const d = data.data;
  const copy = new Uint8ClampedArray(d);
  const radius = Math.max(2, Math.round(strength * 8));
  const temp = new Uint8ClampedArray(d.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = x + dx;
        if (nx >= 0 && nx < w) {
          const si = (y * w + nx) * 4;
          r += copy[si];
          g += copy[si + 1];
          b += copy[si + 2];
          count++;
        }
      }
      const i = (y * w + x) * 4;
      temp[i] = r / count;
      temp[i + 1] = g / count;
      temp[i + 2] = b / count;
      temp[i + 3] = 255;
    }
  }
  const blurred = new Uint8ClampedArray(d.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy;
        if (ny >= 0 && ny < h) {
          const si = (ny * w + x) * 4;
          r += temp[si];
          g += temp[si + 1];
          b += temp[si + 2];
          count++;
        }
      }
      const i = (y * w + x) * 4;
      blurred[i] = r / count;
      blurred[i + 1] = g / count;
      blurred[i + 2] = b / count;
    }
  }
  const s = strength * 0.6;
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const a = d[i + c] / 255;
      const b2 = blurred[i + c] / 255;
      const screen = 1 - (1 - a) * (1 - b2 * s);
      d[i + c] = clamp(screen * 255);
    }
  }
}
