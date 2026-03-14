/**
 * Advanced selection tools: Lasso (freehand) and Magic Wand (flood-fill).
 * Both produce Selection objects with optional polygon path data.
 */
import type { Selection, SelectionPath } from "./editor-store";

// ─── Lasso: convert a freehand polygon path to a bounding-box Selection ───

export function lassoPathToSelection(points: { x: number; y: number }[]): Selection | null {
  if (points.length < 3) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const width = maxX - minX;
  const height = maxY - minY;
  if (width < 2 || height < 2) return null;
  return {
    x: minX,
    y: minY,
    width,
    height,
    path: { points: [...points] },
  };
}

// ─── Magic Wand: flood-fill selection based on color similarity ───

export interface MagicWandOptions {
  tolerance: number;       // 0-255 color distance threshold
  contiguous: boolean;     // only select connected pixels
  antiAlias: boolean;
}

export const DEFAULT_MAGIC_WAND: MagicWandOptions = {
  tolerance: 32,
  contiguous: true,
  antiAlias: true,
};

/**
 * Performs magic wand selection on a flattened canvas at the given coordinates.
 * Returns a Selection with the bounding box and an optional path of edge points.
 */
export function magicWandSelect(
  canvas: HTMLCanvasElement,
  startX: number,
  startY: number,
  options: MagicWandOptions
): Selection | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const w = canvas.width;
  const h = canvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  const sx = Math.round(startX);
  const sy = Math.round(startY);
  if (sx < 0 || sx >= w || sy < 0 || sy >= h) return null;

  const startIdx = (sy * w + sx) * 4;
  const targetR = data[startIdx];
  const targetG = data[startIdx + 1];
  const targetB = data[startIdx + 2];
  const targetA = data[startIdx + 3];

  const tolerance = options.tolerance;
  const visited = new Uint8Array(w * h);
  const selected = new Uint8Array(w * h);

  const colorMatch = (idx: number) => {
    const i = idx * 4;
    const dr = data[i] - targetR;
    const dg = data[i + 1] - targetG;
    const db = data[i + 2] - targetB;
    const da = data[i + 3] - targetA;
    return Math.sqrt(dr * dr + dg * dg + db * db + da * da) <= tolerance;
  };

  if (options.contiguous) {
    // Flood fill from start point
    const stack: number[] = [sx, sy];
    while (stack.length > 0) {
      const cy = stack.pop()!;
      const cx = stack.pop()!;
      const idx = cy * w + cx;
      if (cx < 0 || cx >= w || cy < 0 || cy >= h) continue;
      if (visited[idx]) continue;
      visited[idx] = 1;
      if (!colorMatch(idx)) continue;
      selected[idx] = 1;
      stack.push(cx - 1, cy);
      stack.push(cx + 1, cy);
      stack.push(cx, cy - 1);
      stack.push(cx, cy + 1);
    }
  } else {
    // Select ALL matching pixels globally
    for (let i = 0; i < w * h; i++) {
      if (colorMatch(i)) selected[i] = 1;
    }
  }

  // Find bounding box of selected pixels
  let minX = w, minY = h, maxX = 0, maxY = 0;
  let hasSelection = false;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (selected[y * w + x]) {
        hasSelection = true;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!hasSelection) return null;

  // Build edge path for marching ants (simplified: walk the boundary)
  const edgePoints: { x: number; y: number }[] = [];
  // Top edge
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      if (selected[y * w + x]) {
        edgePoints.push({ x, y });
        break;
      }
    }
  }
  // Right edge
  for (let y = minY; y <= maxY; y++) {
    for (let x = maxX; x >= minX; x--) {
      if (selected[y * w + x]) {
        edgePoints.push({ x: x + 1, y });
        break;
      }
    }
  }
  // Bottom edge (reverse)
  for (let x = maxX; x >= minX; x--) {
    for (let y = maxY; y >= minY; y--) {
      if (selected[y * w + x]) {
        edgePoints.push({ x, y: y + 1 });
        break;
      }
    }
  }
  // Left edge (reverse)
  for (let y = maxY; y >= minY; y--) {
    for (let x = minX; x <= maxX; x++) {
      if (selected[y * w + x]) {
        edgePoints.push({ x, y });
        break;
      }
    }
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    path: edgePoints.length > 2 ? { points: edgePoints } : undefined,
  };
}

/**
 * Renders a selection path (polygon) as marching ants on a canvas context.
 */
export function renderSelectionPath(
  ctx: CanvasRenderingContext2D,
  path: SelectionPath,
  zoom: number
) {
  if (path.points.length < 3) return;
  ctx.save();
  ctx.strokeStyle = "#3ECF8E";
  ctx.lineWidth = 1.5 / zoom;
  ctx.setLineDash([6 / zoom, 4 / zoom]);
  ctx.lineDashOffset = -(Date.now() / 80) % 20;
  ctx.beginPath();
  ctx.moveTo(path.points[0].x, path.points[0].y);
  for (let i = 1; i < path.points.length; i++) {
    ctx.lineTo(path.points[i].x, path.points[i].y);
  }
  ctx.closePath();
  ctx.stroke();

  // Light fill
  ctx.fillStyle = "rgba(62, 207, 142, 0.06)";
  ctx.fill();
  ctx.setLineDash([]);
  ctx.restore();
}