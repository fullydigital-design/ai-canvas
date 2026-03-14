import { useRef, useEffect, useCallback, useState } from "react";
import { useEditor, type Selection } from "./editor-store";
import { applyAllAdjustments, hasActiveAdjustments } from "./adjustment-utils";
import { lassoPathToSelection, magicWandSelect, renderSelectionPath, DEFAULT_MAGIC_WAND } from "./selection-tools";
import { flattenLayers } from "./canvas-utils";

const isDarkMode = () => document.documentElement.classList.contains("dark");

export function InfiniteCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    layers,
    activeTool,
    selection,
    setSelection,
    canvasOffset,
    setCanvasOffset,
    canvasZoom,
    setCanvasZoom,
    canvasWidth,
    canvasHeight,
    activeLayerId,
    updateLayer,
    brushSize,
    brushColor,
    brushHardness,
    editingMaskLayerId,
    magicWandTolerance,
    magicWandContiguous,
    pushHistory,
    setBrushColor,
    setLayers,
    addLayer,
    gradientEndColor,
    gradientMode,
    cropAspectRatio,
    setCanvasDimensions,
    updateLayerSilent,
  } = useEditor();

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [selectionStart, setSelectionStart] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [currentSelection, setCurrentSelection] = useState<Selection | null>(
    null
  );
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [imageCache, setImageCache] = useState<Map<string, HTMLImageElement>>(
    new Map()
  );
  const [isPainting, setIsPainting] = useState(false);
  const lastPaintPointRef = useRef<{ x: number; y: number } | null>(null);

  // Transform tool state
  type TransformHandle = "tl" | "tc" | "tr" | "mr" | "br" | "bc" | "bl" | "ml" | "body" | null;
  const [transformHandle, setTransformHandle] = useState<TransformHandle>(null);
  const [transformOrigin, setTransformOrigin] = useState({ x: 0, y: 0, lx: 0, ly: 0, lw: 0, lh: 0 });

  // Mouse position for brush cursor
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [mouseInCanvas, setMouseInCanvas] = useState(false);

  // Persistent offscreen canvas for the mask currently being edited
  const maskOffscreenRef = useRef<HTMLCanvasElement | null>(null);
  // Track which layer the offscreen belongs to
  const maskOffscreenLayerIdRef = useRef<string | null>(null);

  // Separate cache for mask images (not being actively painted)
  const maskImageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  // Force re-render counter
  const [renderTick, setRenderTick] = useState(0);

  // Lasso tool state
  const lassoPointsRef = useRef<{ x: number; y: number }[]>([]);
  const [lassoDrawing, setLassoDrawing] = useState(false);

  // Gradient tool state
  const [gradientStart, setGradientStart] = useState<{ x: number; y: number } | null>(null);
  const [gradientEnd, setGradientEnd] = useState<{ x: number; y: number } | null>(null);

  // Crop tool state
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [cropStart, setCropStart] = useState<{ x: number; y: number } | null>(null);
  const [showCropConfirm, setShowCropConfirm] = useState(false);

  // Clone stamp state
  const cloneSourceRef = useRef<{ x: number; y: number; layerId: string } | null>(null);
  // Clone stamp offscreen: holds the target layer's working canvas during a paint stroke
  const cloneOffscreenRef = useRef<HTMLCanvasElement | null>(null);
  const cloneOffscreenLayerIdRef = useRef<string | null>(null);
  // Snapshot of all layers flattened at the moment painting started (source pixels)
  const cloneSourceSnapshotRef = useRef<HTMLCanvasElement | null>(null);
  // Offset between source and first destination click
  const cloneOffsetRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  // Eyedropper snapshot ref for continuous sampling during drag
  const eyedropperSnapshotRef = useRef<HTMLCanvasElement | null>(null);

  // Brush / Eraser offscreen canvas (working surface for a stroke)
  const brushOffscreenRef = useRef<HTMLCanvasElement | null>(null);
  const brushOffscreenLayerIdRef = useRef<string | null>(null);

  // Load images for layers — also refresh when imageData changes
  useEffect(() => {
    const newCache = new Map(imageCache);
    let changed = false;
    layers.forEach((layer) => {
      if (layer.imageData) {
        const cached = newCache.get(layer.id);
        // Re-load if no cache entry or if the stored src doesn't match current imageData
        const cachedSrc = cached?.getAttribute("data-src");
        if (!cached || cachedSrc !== layer.imageData) {
          const img = new Image();
          img.setAttribute("data-src", layer.imageData);
          img.onload = () => {
            setImageCache((prev) => new Map(prev).set(layer.id, img));
          };
          img.src = layer.imageData;
          changed = true;
        }
      }
    });
    newCache.forEach((_, key) => {
      if (!layers.find((l) => l.id === key)) {
        newCache.delete(key);
        changed = true;
      }
    });
    if (changed) setImageCache(newCache);
  }, [layers]);

  // Load mask images for ALL layers (including the one being edited as fallback)
  useEffect(() => {
    const cache = maskImageCacheRef.current;
    layers.forEach((layer) => {
      if (layer.maskData) {
        const existing = cache.get(layer.id);
        if (!existing || existing.getAttribute("data-src") !== layer.maskData) {
          const img = new Image();
          img.setAttribute("data-src", layer.maskData);
          img.onload = () => {
            cache.set(layer.id, img);
            setRenderTick((t) => t + 1);
          };
          img.src = layer.maskData;
        }
      }
    });
    // Clean removed layers
    cache.forEach((_, key) => {
      if (!layers.find((l) => l.id === key)) {
        cache.delete(key);
      }
    });
  }, [layers]);

  // Initialize offscreen mask canvas when entering mask edit mode
  useEffect(() => {
    if (!editingMaskLayerId) {
      // Leaving mask edit mode — commit offscreen to state if needed
      if (maskOffscreenRef.current && maskOffscreenLayerIdRef.current) {
        const dataUrl = maskOffscreenRef.current.toDataURL("image/png");
        updateLayer(maskOffscreenLayerIdRef.current, { maskData: dataUrl });
      }
      maskOffscreenRef.current = null;
      maskOffscreenLayerIdRef.current = null;
      return;
    }

    const layer = layers.find((l) => l.id === editingMaskLayerId);
    if (!layer || !layer.maskData) return;

    const offscreen = document.createElement("canvas");
    offscreen.width = layer.width;
    offscreen.height = layer.height;
    const ctx = offscreen.getContext("2d")!;
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, layer.width, layer.height);
      maskOffscreenRef.current = offscreen;
      maskOffscreenLayerIdRef.current = editingMaskLayerId;
      setRenderTick((t) => t + 1);
    };
    img.src = layer.maskData;
  }, [editingMaskLayerId]);

  const getCanvasCoords = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (clientX - rect.left - canvasOffset.x) / canvasZoom,
        y: (clientY - rect.top - canvasOffset.y) / canvasZoom,
      };
    },
    [canvasOffset, canvasZoom]
  );

  // Paint a stroke segment on the offscreen mask canvas (no state update!)
  const paintStroke = useCallback(
    (
      x: number,
      y: number,
      prevX: number | null,
      prevY: number | null
    ) => {
      const offscreen = maskOffscreenRef.current;
      if (!offscreen || !editingMaskLayerId) return;
      const layer = layers.find((l) => l.id === editingMaskLayerId);
      if (!layer) return;

      const ctx = offscreen.getContext("2d")!;
      const lx = x - layer.x;
      const ly = y - layer.y;
      const isBrush = activeTool === "mask-brush";
      const color = isBrush ? "#ffffff" : "#000000";

      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = brushSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // Soft edge
      const softness = (100 - brushHardness) / 100;
      if (softness > 0.01) {
        ctx.shadowBlur = brushSize * softness * 0.5;
        ctx.shadowColor = color;
      }

      if (prevX !== null && prevY !== null) {
        const plx = prevX - layer.x;
        const ply = prevY - layer.y;

        // Interpolate points for smooth strokes
        const dist = Math.hypot(lx - plx, ly - ply);
        const step = Math.max(1, brushSize * 0.15);

        if (dist > step) {
          ctx.beginPath();
          ctx.moveTo(plx, ply);
          ctx.lineTo(lx, ly);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(lx, ly, brushSize / 2, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.beginPath();
        ctx.arc(lx, ly, brushSize / 2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
      // Trigger render without saving to state
      setRenderTick((t) => t + 1);
    },
    [editingMaskLayerId, layers, activeTool, brushSize, brushHardness]
  );

  // Commit the offscreen mask to layer state (called on mouseUp)
  const commitMask = useCallback(() => {
    const offscreen = maskOffscreenRef.current;
    const layerId = maskOffscreenLayerIdRef.current;
    if (!offscreen || !layerId) return;
    const dataUrl = offscreen.toDataURL("image/png");
    updateLayer(layerId, { maskData: dataUrl });
  }, [updateLayer]);

  // === BRUSH / ERASER PAINT STROKE ===
  const paintBrushStroke = useCallback(
    (x: number, y: number, prevX: number | null, prevY: number | null) => {
      const offscreen = brushOffscreenRef.current;
      if (!offscreen || !brushOffscreenLayerIdRef.current) return;
      const layer = layers.find((l) => l.id === brushOffscreenLayerIdRef.current);
      if (!layer) return;

      const ctx = offscreen.getContext("2d")!;
      const lx = x - layer.x;
      const ly = y - layer.y;
      const isEraser = activeTool === "eraser";

      ctx.save();
      if (isEraser) {
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = "rgba(0,0,0,1)";
        ctx.strokeStyle = "rgba(0,0,0,1)";
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = brushColor;
        ctx.strokeStyle = brushColor;
      }
      ctx.lineWidth = brushSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const softness = (100 - brushHardness) / 100;
      if (!isEraser && softness > 0.01) {
        ctx.shadowBlur = brushSize * softness * 0.5;
        ctx.shadowColor = brushColor;
      }

      if (prevX !== null && prevY !== null) {
        const plx = prevX - layer.x;
        const ply = prevY - layer.y;
        const dist = Math.hypot(lx - plx, ly - ply);
        const step = Math.max(1, brushSize * 0.15);
        if (dist > step) {
          ctx.beginPath();
          ctx.moveTo(plx, ply);
          ctx.lineTo(lx, ly);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(lx, ly, brushSize / 2, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.beginPath();
        ctx.arc(lx, ly, brushSize / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      setRenderTick((t) => t + 1);
    },
    [layers, activeTool, brushSize, brushHardness, brushColor]
  );

  // Commit brush/eraser offscreen to layer imageData
  const commitBrushStroke = useCallback(() => {
    const offscreen = brushOffscreenRef.current;
    const layerId = brushOffscreenLayerIdRef.current;
    if (!offscreen || !layerId) return;
    const dataUrl = offscreen.toDataURL("image/png");
    updateLayer(layerId, { imageData: dataUrl, type: "image" });
    brushOffscreenRef.current = null;
    brushOffscreenLayerIdRef.current = null;
  }, [updateLayer]);

  // === CLONE STAMP DAB ===
  // Paints source pixels from the flattened snapshot onto the target layer offscreen
  const cloneStampDab = useCallback((destX: number, destY: number, layer: { x: number; y: number; width: number; height: number }) => {
    const snapshot = cloneSourceSnapshotRef.current;
    const offscreen = cloneOffscreenRef.current;
    if (!snapshot || !offscreen) return;

    const octx = offscreen.getContext("2d")!;
    const { dx, dy } = cloneOffsetRef.current;
    const isHealing = activeTool === "healing-brush";

    // Source position in document coordinates
    const srcX = destX + dx;
    const srcY = destY + dy;

    // Local coordinates on the target layer's offscreen
    const localX = destX - layer.x;
    const localY = destY - layer.y;

    const radius = brushSize / 2;
    const softness = (100 - brushHardness) / 100;

    // Extract a circular patch from the flattened snapshot at the source position
    const patchSize = brushSize;
    const patchCanvas = document.createElement("canvas");
    patchCanvas.width = patchSize;
    patchCanvas.height = patchSize;
    const pctx = patchCanvas.getContext("2d")!;

    // Draw circular clip from snapshot
    pctx.beginPath();
    pctx.arc(patchSize / 2, patchSize / 2, radius, 0, Math.PI * 2);
    pctx.clip();
    pctx.drawImage(
      snapshot,
      srcX - radius, srcY - radius, patchSize, patchSize,
      0, 0, patchSize, patchSize
    );

    if (isHealing) {
      // Healing brush: blend patch with existing destination pixels
      // Read destination pixels under the dab
      const destData = octx.getImageData(
        Math.max(0, Math.floor(localX - radius)),
        Math.max(0, Math.floor(localY - radius)),
        patchSize, patchSize
      );
      const srcData = pctx.getImageData(0, 0, patchSize, patchSize);
      const dd = destData.data;
      const sd = srcData.data;

      // Calculate average color difference and apply it
      let totalDr = 0, totalDg = 0, totalDb = 0, count = 0;
      for (let i = 0; i < sd.length; i += 4) {
        if (sd[i + 3] > 0 && dd[i + 3] > 0) {
          totalDr += dd[i] - sd[i];
          totalDg += dd[i + 1] - sd[i + 1];
          totalDb += dd[i + 2] - sd[i + 2];
          count++;
        }
      }
      if (count > 0) {
        const avgDr = totalDr / count;
        const avgDg = totalDg / count;
        const avgDb = totalDb / count;
        for (let i = 0; i < sd.length; i += 4) {
          if (sd[i + 3] > 0) {
            sd[i] = Math.max(0, Math.min(255, sd[i] + avgDr));
            sd[i + 1] = Math.max(0, Math.min(255, sd[i + 1] + avgDg));
            sd[i + 2] = Math.max(0, Math.min(255, sd[i + 2] + avgDb));
          }
        }
        pctx.putImageData(srcData, 0, 0);
      }
    }

    // Apply soft edge via radial gradient alpha
    if (softness > 0.01) {
      const alphaCanvas = document.createElement("canvas");
      alphaCanvas.width = patchSize;
      alphaCanvas.height = patchSize;
      const actx = alphaCanvas.getContext("2d")!;
      const grad = actx.createRadialGradient(
        patchSize / 2, patchSize / 2, radius * (1 - softness),
        patchSize / 2, patchSize / 2, radius
      );
      grad.addColorStop(0, "white");
      grad.addColorStop(1, "transparent");
      actx.fillStyle = grad;
      actx.fillRect(0, 0, patchSize, patchSize);

      pctx.globalCompositeOperation = "destination-in";
      pctx.drawImage(alphaCanvas, 0, 0);
    }

    // Stamp the patch onto the target offscreen
    octx.drawImage(patchCanvas, localX - radius, localY - radius);
    setRenderTick((t) => t + 1);
  }, [activeTool, brushSize, brushHardness]);

  // Commit clone stamp offscreen to layer imageData
  const commitCloneStamp = useCallback(() => {
    const offscreen = cloneOffscreenRef.current;
    const layerId = cloneOffscreenLayerIdRef.current;
    if (!offscreen || !layerId) return;
    const dataUrl = offscreen.toDataURL("image/png");
    // Use raw setter to avoid double-pushing history (we already pushed before painting)
    updateLayer(layerId, { imageData: dataUrl, type: "image" });
    cloneOffscreenRef.current = null;
    cloneOffscreenLayerIdRef.current = null;
    cloneSourceSnapshotRef.current = null;
  }, [updateLayer]);

  // Get the mask source for rendering a layer
  const getMaskSource = useCallback(
    (layerId: string): HTMLCanvasElement | HTMLImageElement | null => {
      // If this layer is the one being actively painted, use the offscreen canvas directly
      if (layerId === maskOffscreenLayerIdRef.current && maskOffscreenRef.current) {
        return maskOffscreenRef.current;
      }
      // Otherwise use the cached image
      return maskImageCacheRef.current.get(layerId) || null;
    },
    []
  );

  // Convert a luminance mask (white=show, black=hide) into an alpha mask
  // where the alpha channel represents visibility
  const luminanceToAlpha = useCallback(
    (src: HTMLCanvasElement | HTMLImageElement, w: number, h: number): HTMLCanvasElement => {
      const temp = document.createElement("canvas");
      temp.width = w;
      temp.height = h;
      const tctx = temp.getContext("2d")!;
      tctx.drawImage(src, 0, 0, w, h);
      const imgData = tctx.getImageData(0, 0, w, h);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        // Use the red channel (grayscale) as alpha; set RGB to white
        const lum = d[i]; // red channel (mask is grayscale so r≈g≈b)
        d[i + 3] = lum;   // alpha = luminance
        d[i] = 255;
        d[i + 1] = 255;
        d[i + 2] = 255;
      }
      tctx.putImageData(imgData, 0, 0);
      return temp;
    },
    []
  );

  // === RENDER ===
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, cw, ch);

    const dark = isDarkMode();

    // Draw infinite workspace grid dots (behind everything)
    ctx.save();
    const gridSize = 50 * canvasZoom;
    if (gridSize > 8) {
      const startX = canvasOffset.x % gridSize;
      const startY = canvasOffset.y % gridSize;
      ctx.fillStyle = dark
        ? "rgba(255, 255, 255, 0.06)"
        : "rgba(0, 0, 0, 0.08)";
      for (let x = startX; x < cw; x += gridSize) {
        for (let y = startY; y < ch; y += gridSize) {
          ctx.beginPath();
          ctx.arc(x, y, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();

    ctx.save();
    ctx.translate(canvasOffset.x, canvasOffset.y);
    ctx.scale(canvasZoom, canvasZoom);

    const docW = canvasWidth;
    const docH = canvasHeight;

    // Checkerboard background for the document area
    const tileSize = 16;
    for (let y = 0; y < docH; y += tileSize) {
      for (let x = 0; x < docW; x += tileSize) {
        const isEven = (x / tileSize + y / tileSize) % 2 === 0;
        ctx.fillStyle = dark
          ? isEven
            ? "#2a2a2a"
            : "#222222"
          : isEven
          ? "#e8e8e8"
          : "#d8d8d8";
        ctx.fillRect(x, y, tileSize, tileSize);
      }
    }

    // Draw layers bottom-to-top
    const reversedLayers = [...layers].reverse();
    for (const layer of reversedLayers) {
      if (!layer.visible) continue;

      ctx.save();
      ctx.globalAlpha = layer.opacity / 100;
      // Apply blend mode ("normal" maps to "source-over" in Canvas API)
      ctx.globalCompositeOperation =
        layer.blendMode === "normal" ? "source-over" : layer.blendMode as GlobalCompositeOperation;

      // Check if this layer has an active mask
      const hasMask = layer.maskData && layer.maskEnabled;
      const maskSrc = hasMask ? getMaskSource(layer.id) : null;

      if (hasMask && maskSrc) {
        // Composite layer + mask on an offscreen canvas
        const comp = document.createElement("canvas");
        comp.width = layer.width;
        comp.height = layer.height;
        const cctx = comp.getContext("2d")!;

        // 1) Draw the layer content
        if (layer.type === "fill") {
          cctx.fillStyle = layer.fillColor || "#ffffff";
          cctx.fillRect(0, 0, layer.width, layer.height);
        } else if (layer.type === "text" && layer.textContent) {
          const fontSize = layer.textSize || 32;
          const fontFamily = layer.textFont || "Inter";
          const weight = layer.textBold ? "bold" : "normal";
          const style = layer.textItalic ? "italic" : "normal";
          const lineHeight = (layer.textLineHeight || 1.4) * fontSize;
          cctx.fillStyle = layer.textColor || "#000000";
          cctx.font = `${style} ${weight} ${fontSize}px ${fontFamily}, sans-serif`;
          cctx.textBaseline = "top";
          cctx.textAlign = layer.textAlign || "left";
          const lines = layer.textContent.split("\n");
          const textX =
            layer.textAlign === "center"
              ? layer.width / 2
              : layer.textAlign === "right"
              ? layer.width
              : 0;
          lines.forEach((line, lineIdx) => {
            cctx.fillText(line, textX, lineIdx * lineHeight);
          });
        } else if (layer.imageData) {
          const img = imageCache.get(layer.id);
          if (img && img.complete) {
            cctx.drawImage(img, 0, 0, layer.width, layer.height);
          }
        }

        // 1b) Apply adjustments if any
        if (hasActiveAdjustments(layer.adjustments)) {
          const adjData = cctx.getImageData(0, 0, layer.width, layer.height);
          applyAllAdjustments(adjData, layer.adjustments!);
          cctx.putImageData(adjData, 0, 0);
        }

        // 2) Convert luminance mask to alpha mask, then apply with destination-in
        const alphaMask = luminanceToAlpha(maskSrc, layer.width, layer.height);
        cctx.globalCompositeOperation = "destination-in";
        cctx.drawImage(alphaMask, 0, 0, layer.width, layer.height);

        // 3) Draw composited result
        ctx.drawImage(comp, layer.x, layer.y, layer.width, layer.height);
      } else {
        // No mask — draw layer directly

        // ── Brush/Eraser live preview: override rendering while painting ──
        if (brushOffscreenRef.current && brushOffscreenLayerIdRef.current === layer.id) {
          ctx.drawImage(brushOffscreenRef.current, layer.x, layer.y, layer.width, layer.height);
          ctx.restore();
          continue;
        }

        if (layer.type === "fill") {
          // For fill layers with adjustments, use offscreen canvas
          if (hasActiveAdjustments(layer.adjustments)) {
            const comp = document.createElement("canvas");
            comp.width = layer.width;
            comp.height = layer.height;
            const cctx = comp.getContext("2d")!;
            cctx.fillStyle = layer.fillColor || "#ffffff";
            cctx.fillRect(0, 0, layer.width, layer.height);
            const adjData = cctx.getImageData(0, 0, layer.width, layer.height);
            applyAllAdjustments(adjData, layer.adjustments!);
            cctx.putImageData(adjData, 0, 0);
            ctx.drawImage(comp, layer.x, layer.y, layer.width, layer.height);
          } else {
            ctx.fillStyle = layer.fillColor || "#ffffff";
            ctx.fillRect(layer.x, layer.y, layer.width, layer.height);
          }
        } else if (layer.type === "text" && layer.textContent) {
          // Text layers always use an offscreen canvas for proper rendering
          const tcomp = document.createElement("canvas");
          tcomp.width = layer.width;
          tcomp.height = layer.height;
          const tctx = tcomp.getContext("2d")!;
          const fontSize = layer.textSize || 32;
          const fontFamily = layer.textFont || "Inter";
          const weight = layer.textBold ? "bold" : "normal";
          const style = layer.textItalic ? "italic" : "normal";
          const lineHeight = (layer.textLineHeight || 1.4) * fontSize;
          tctx.fillStyle = layer.textColor || "#000000";
          tctx.font = `${style} ${weight} ${fontSize}px ${fontFamily}, sans-serif`;
          tctx.textBaseline = "top";
          tctx.textAlign = layer.textAlign || "left";
          const lines = layer.textContent.split("\n");
          const textX =
            layer.textAlign === "center"
              ? layer.width / 2
              : layer.textAlign === "right"
              ? layer.width
              : 0;
          lines.forEach((line, lineIdx) => {
            tctx.fillText(line, textX, lineIdx * lineHeight);
          });
          if (hasActiveAdjustments(layer.adjustments)) {
            const adjData = tctx.getImageData(0, 0, layer.width, layer.height);
            applyAllAdjustments(adjData, layer.adjustments!);
            tctx.putImageData(adjData, 0, 0);
          }
          ctx.drawImage(tcomp, layer.x, layer.y, layer.width, layer.height);
        } else if (layer.imageData || (cloneOffscreenRef.current && cloneOffscreenLayerIdRef.current === layer.id)) {
          // Use clone offscreen canvas if actively painting this layer
          const cloneActive = cloneOffscreenRef.current && cloneOffscreenLayerIdRef.current === layer.id;
          if (cloneActive) {
            ctx.drawImage(cloneOffscreenRef.current!, layer.x, layer.y, layer.width, layer.height);
          } else {
            const img = imageCache.get(layer.id);
            if (img && img.complete) {
              if (hasActiveAdjustments(layer.adjustments)) {
                const comp = document.createElement("canvas");
                comp.width = layer.width;
                comp.height = layer.height;
                const cctx2 = comp.getContext("2d")!;
                cctx2.drawImage(img, 0, 0, layer.width, layer.height);
                const adjData = cctx2.getImageData(0, 0, layer.width, layer.height);
                applyAllAdjustments(adjData, layer.adjustments!);
                cctx2.putImageData(adjData, 0, 0);
                ctx.drawImage(comp, layer.x, layer.y, layer.width, layer.height);
              } else {
                ctx.drawImage(img, layer.x, layer.y, layer.width, layer.height);
              }
            }
          }
        }
      }

      ctx.restore();
    }

    // === MASK EDITING OVERLAY ===
    if (editingMaskLayerId) {
      const maskLayer = layers.find((l) => l.id === editingMaskLayerId);
      const maskSrc = maskLayer ? getMaskSource(maskLayer.id) : null;

      if (maskLayer && maskSrc) {
        // Create an overlay that shows hidden areas (where mask is black) in red
        // Convert mask to alpha, then invert it for the overlay
        const overlay = document.createElement("canvas");
        overlay.width = maskLayer.width;
        overlay.height = maskLayer.height;
        const octx = overlay.getContext("2d")!;

        // Draw red fill
        octx.fillStyle = dark
          ? "rgba(255, 60, 60, 1)"
          : "rgba(255, 40, 40, 1)";
        octx.fillRect(0, 0, maskLayer.width, maskLayer.height);

        // Now we need to show red only where mask is BLACK (hidden)
        // Convert mask luminance to alpha and use destination-out to cut away visible areas
        const alphaMask = luminanceToAlpha(maskSrc, maskLayer.width, maskLayer.height);
        octx.globalCompositeOperation = "destination-out";
        octx.drawImage(alphaMask, 0, 0, maskLayer.width, maskLayer.height);

        // Draw the overlay with transparency
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.drawImage(
          overlay,
          maskLayer.x,
          maskLayer.y,
          maskLayer.width,
          maskLayer.height
        );
        ctx.restore();

        // Marching-ants-style border around the mask layer
        ctx.save();
        ctx.strokeStyle = "#ff6b6b";
        ctx.lineWidth = 2 / canvasZoom;
        ctx.setLineDash([8 / canvasZoom, 4 / canvasZoom]);
        ctx.lineDashOffset = -(Date.now() / 80) % 20;
        ctx.strokeRect(
          maskLayer.x,
          maskLayer.y,
          maskLayer.width,
          maskLayer.height
        );
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    // === SELECTION ===
    const sel = currentSelection || selection;
    if (sel) {
      // If the selection has a polygon path, render it
      if (sel.path && sel.path.points.length > 2) {
        renderSelectionPath(ctx, sel.path, canvasZoom);
      }

      ctx.strokeStyle = "#3ECF8E";
      ctx.lineWidth = 2 / canvasZoom;
      ctx.setLineDash([6 / canvasZoom, 4 / canvasZoom]);
      ctx.strokeRect(sel.x, sel.y, sel.width, sel.height);
      ctx.setLineDash([]);

      ctx.fillStyle = "rgba(62, 207, 142, 0.08)";
      ctx.fillRect(sel.x, sel.y, sel.width, sel.height);

      const handleSize = 6 / canvasZoom;
      ctx.fillStyle = "#3ECF8E";
      [
        { x: sel.x, y: sel.y },
        { x: sel.x + sel.width, y: sel.y },
        { x: sel.x, y: sel.y + sel.height },
        { x: sel.x + sel.width, y: sel.y + sel.height },
      ].forEach((c) => {
        ctx.fillRect(
          c.x - handleSize / 2,
          c.y - handleSize / 2,
          handleSize,
          handleSize
        );
      });
    }

    // Document border
    ctx.strokeStyle = dark
      ? "rgba(62, 207, 142, 0.25)"
      : "rgba(62, 207, 142, 0.35)";
    ctx.lineWidth = 1 / canvasZoom;
    ctx.setLineDash([]);
    ctx.strokeRect(0, 0, docW, docH);

    // === LASSO DRAWING PATH (live preview) ===
    if (lassoDrawing && lassoPointsRef.current.length > 1) {
      const pts = lassoPointsRef.current;
      ctx.save();
      ctx.strokeStyle = "#3ECF8E";
      ctx.lineWidth = 1.5 / canvasZoom;
      ctx.setLineDash([4 / canvasZoom, 3 / canvasZoom]);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.stroke();
      // Draw closing line to start (dashed)
      ctx.strokeStyle = "rgba(62, 207, 142, 0.4)";
      ctx.beginPath();
      ctx.moveTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.lineTo(pts[0].x, pts[0].y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // === CLONE SOURCE INDICATOR ===
    if (cloneSourceRef.current && (activeTool === "clone-stamp" || activeTool === "healing-brush")) {
      const src = cloneSourceRef.current;
      ctx.save();
      ctx.strokeStyle = activeTool === "clone-stamp" ? "#3ECF8E" : "#60A5FA";
      ctx.lineWidth = 1.5 / canvasZoom;
      const crossSize = 8 / canvasZoom;
      ctx.beginPath();
      ctx.moveTo(src.x - crossSize, src.y);
      ctx.lineTo(src.x + crossSize, src.y);
      ctx.moveTo(src.x, src.y - crossSize);
      ctx.lineTo(src.x, src.y + crossSize);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(src.x, src.y, crossSize * 1.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // === GRADIENT PREVIEW LINE ===
    if (activeTool === "gradient" && gradientStart && gradientEnd && isPainting) {
      ctx.save();
      if (gradientMode === "radial") {
        // Radial preview: show an ellipse from center to edge
        const radius = Math.hypot(gradientEnd.x - gradientStart.x, gradientEnd.y - gradientStart.y);
        const grad = ctx.createRadialGradient(
          gradientStart.x, gradientStart.y, 0,
          gradientStart.x, gradientStart.y, radius
        );
        grad.addColorStop(0, brushColor + "44");
        grad.addColorStop(1, gradientEndColor + "44");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(gradientStart.x, gradientStart.y, radius, 0, Math.PI * 2);
        ctx.fill();
        // Dashed circle outline
        ctx.strokeStyle = "rgba(62, 207, 142, 0.5)";
        ctx.lineWidth = 1.5 / canvasZoom;
        ctx.setLineDash([6 / canvasZoom, 4 / canvasZoom]);
        ctx.beginPath();
        ctx.arc(gradientStart.x, gradientStart.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        // Radius line
        ctx.strokeStyle = "rgba(62, 207, 142, 0.35)";
        ctx.lineWidth = 1 / canvasZoom;
        ctx.beginPath();
        ctx.moveTo(gradientStart.x, gradientStart.y);
        ctx.lineTo(gradientEnd.x, gradientEnd.y);
        ctx.stroke();
      } else {
        // Linear preview (existing behavior)
        const grad = ctx.createLinearGradient(
          gradientStart.x, gradientStart.y,
          gradientEnd.x, gradientEnd.y
        );
        grad.addColorStop(0, brushColor + "88");
        grad.addColorStop(1, gradientEndColor + "88");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 3 / canvasZoom;
        ctx.setLineDash([6 / canvasZoom, 4 / canvasZoom]);
        ctx.beginPath();
        ctx.moveTo(gradientStart.x, gradientStart.y);
        ctx.lineTo(gradientEnd.x, gradientEnd.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // Start dot
      ctx.fillStyle = brushColor;
      ctx.beginPath();
      ctx.arc(gradientStart.x, gradientStart.y, 4 / canvasZoom, 0, Math.PI * 2);
      ctx.fill();
      // End dot
      ctx.fillStyle = gradientEndColor;
      ctx.beginPath();
      ctx.arc(gradientEnd.x, gradientEnd.y, 4 / canvasZoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // === CROP TOOL OVERLAY ===
    if (activeTool === "crop" && cropRect && cropRect.w > 0 && cropRect.h > 0) {
      ctx.save();
      // Darken areas outside crop
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      // Top
      ctx.fillRect(0, 0, docW, cropRect.y);
      // Bottom
      ctx.fillRect(0, cropRect.y + cropRect.h, docW, docH - cropRect.y - cropRect.h);
      // Left
      ctx.fillRect(0, cropRect.y, cropRect.x, cropRect.h);
      // Right
      ctx.fillRect(cropRect.x + cropRect.w, cropRect.y, docW - cropRect.x - cropRect.w, cropRect.h);

      // Crop border
      ctx.strokeStyle = "#3ECF8E";
      ctx.lineWidth = 2 / canvasZoom;
      ctx.setLineDash([]);
      ctx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);

      // Rule of thirds lines
      ctx.strokeStyle = "rgba(62, 207, 142, 0.25)";
      ctx.lineWidth = 1 / canvasZoom;
      for (let i = 1; i <= 2; i++) {
        const rx = cropRect.x + (cropRect.w * i) / 3;
        const ry = cropRect.y + (cropRect.h * i) / 3;
        ctx.beginPath();
        ctx.moveTo(rx, cropRect.y);
        ctx.lineTo(rx, cropRect.y + cropRect.h);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cropRect.x, ry);
        ctx.lineTo(cropRect.x + cropRect.w, ry);
        ctx.stroke();
      }

      // Size label
      const cLabel = `${Math.round(cropRect.w)} x ${Math.round(cropRect.h)}`;
      const cFontSize = 10 / canvasZoom;
      ctx.fillStyle = "rgba(62, 207, 142, 0.9)";
      ctx.font = `${cFontSize}px Inter, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(cLabel, cropRect.x + cropRect.w / 2, cropRect.y - 6 / canvasZoom);

      // Corner handles
      const chs = 6 / canvasZoom;
      ctx.fillStyle = "#3ECF8E";
      [
        { x: cropRect.x, y: cropRect.y },
        { x: cropRect.x + cropRect.w, y: cropRect.y },
        { x: cropRect.x, y: cropRect.y + cropRect.h },
        { x: cropRect.x + cropRect.w, y: cropRect.y + cropRect.h },
      ].forEach((c) => {
        ctx.fillRect(c.x - chs / 2, c.y - chs / 2, chs, chs);
      });

      ctx.restore();
    }

    // === TRANSFORM TOOL HANDLES ===
    if (activeTool === "transform" && activeLayerId) {
      const tLayer = layers.find((l) => l.id === activeLayerId);
      if (tLayer) {
        const lx = tLayer.x;
        const ly = tLayer.y;
        const lw = tLayer.width;
        const lh = tLayer.height;

        // Bounding box
        ctx.strokeStyle = "#3ECF8E";
        ctx.lineWidth = 1.5 / canvasZoom;
        ctx.setLineDash([]);
        ctx.strokeRect(lx, ly, lw, lh);

        // Diagonal guide lines
        ctx.strokeStyle = "rgba(62, 207, 142, 0.15)";
        ctx.lineWidth = 0.5 / canvasZoom;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx + lw, ly + lh);
        ctx.moveTo(lx + lw, ly);
        ctx.lineTo(lx, ly + lh);
        ctx.stroke();

        // Handle positions: 8 handles (corners + edge midpoints)
        const hs = 7 / canvasZoom;
        const handles = [
          { x: lx, y: ly },                       // TL
          { x: lx + lw / 2, y: ly },              // TC
          { x: lx + lw, y: ly },                  // TR
          { x: lx + lw, y: ly + lh / 2 },         // MR
          { x: lx + lw, y: ly + lh },             // BR
          { x: lx + lw / 2, y: ly + lh },         // BC
          { x: lx, y: ly + lh },                  // BL
          { x: lx, y: ly + lh / 2 },              // ML
        ];

        handles.forEach((h) => {
          ctx.fillStyle = "#3ECF8E";
          ctx.strokeStyle = dark ? "#1a1a2e" : "#ffffff";
          ctx.lineWidth = 1.5 / canvasZoom;
          ctx.fillRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
          ctx.strokeRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
        });

        // Size label
        const label = `${Math.round(lw)} x ${Math.round(lh)}`;
        ctx.fillStyle = "rgba(62, 207, 142, 0.85)";
        const fontSize = 10 / canvasZoom;
        ctx.font = `${fontSize}px Inter, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(label, lx + lw / 2, ly - 6 / canvasZoom);
      }
    }

    ctx.restore();
  }, [
    layers,
    canvasOffset,
    canvasZoom,
    canvasWidth,
    canvasHeight,
    selection,
    currentSelection,
    imageCache,
    editingMaskLayerId,
    renderTick,
    getMaskSource,
    luminanceToAlpha,
    activeTool,
    activeLayerId,
    lassoDrawing,
    cloneSourceRef,
    gradientStart,
    gradientEnd,
    brushColor,
    gradientEndColor,
    gradientMode,
    cropRect,
    isPainting,
  ]);

  // Render loop — use rAF for smooth animation (marching ants)
  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      render();
      if (editingMaskLayerId || isPainting || transformHandle || lassoDrawing || cropStart || selection || currentSelection) {
        requestAnimationFrame(loop);
      }
    };
    const frame = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(frame);
    };
  }, [render, editingMaskLayerId, isPainting, transformHandle, lassoDrawing, cropStart, selection, currentSelection]);

  // Also re-render on any dependency change
  useEffect(() => {
    requestAnimationFrame(render);
  }, [render]);

  // Center canvas on mount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const centerX = (container.clientWidth - canvasWidth * canvasZoom) / 2;
    const centerY = (container.clientHeight - canvasHeight * canvasZoom) / 2;
    setCanvasOffset({ x: centerX, y: centerY });
  }, []);

  // === MOUSE HANDLERS ===
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const coords = getCanvasCoords(e.clientX, e.clientY);

      // Eyedropper — sample pixel color from flattened canvas
      if (activeTool === "eyedropper") {
        setIsPainting(true); // Enable continuous sampling during drag
        (async () => {
          try {
            const flat = await flattenLayers(layers, canvasWidth, canvasHeight);
            eyedropperSnapshotRef.current = flat;
            const ctx2 = flat.getContext("2d")!;
            const px = Math.round(coords.x);
            const py = Math.round(coords.y);
            if (px >= 0 && px < canvasWidth && py >= 0 && py < canvasHeight) {
              const pixel = ctx2.getImageData(px, py, 1, 1).data;
              const hex = `#${pixel[0].toString(16).padStart(2, "0")}${pixel[1].toString(16).padStart(2, "0")}${pixel[2].toString(16).padStart(2, "0")}`;
              setBrushColor(hex);
              window.dispatchEvent(
                new CustomEvent("canvas-mouse-position", {
                  detail: { x: coords.x, y: coords.y, sampledColor: hex },
                })
              );
            }
          } catch {}
        })();
        return;
      }

      // Gradient tool — start gradient drag
      if (activeTool === "gradient") {
        setGradientStart(coords);
        setGradientEnd(coords);
        setIsPainting(true);
        return;
      }

      // Crop tool — start crop rectangle drag
      if (activeTool === "crop") {
        setCropStart(coords);
        setCropRect(null);
        setShowCropConfirm(false);
        return;
      }

      if (activeTool === "hand" || e.button === 1) {
        setIsPanning(true);
        setPanStart({
          x: e.clientX - canvasOffset.x,
          y: e.clientY - canvasOffset.y,
        });
        return;
      }

      if (activeTool === "rectangle-select") {
        setSelectionStart(coords);
        setCurrentSelection(null);
        return;
      }

      // Lasso tool — start drawing freehand path
      if (activeTool === "lasso") {
        lassoPointsRef.current = [coords];
        setLassoDrawing(true);
        setIsPainting(true); // reuse for animation loop
        return;
      }

      // Magic Wand — click to flood-fill select
      if (activeTool === "magic-wand") {
        (async () => {
          try {
            const flat = await flattenLayers(layers, canvasWidth, canvasHeight);
            const result = magicWandSelect(flat, coords.x, coords.y, {
              ...DEFAULT_MAGIC_WAND,
              tolerance: magicWandTolerance,
              contiguous: magicWandContiguous,
            });
            if (result) {
              setSelection(result);
            }
          } catch {}
        })();
        return;
      }

      // Clone Stamp / Healing Brush — Alt+click sets source, normal click paints
      if (activeTool === "clone-stamp" || activeTool === "healing-brush") {
        if (e.altKey) {
          cloneSourceRef.current = { x: coords.x, y: coords.y, layerId: activeLayerId || "" };
          return;
        }
        if (cloneSourceRef.current && activeLayerId) {
          // Calculate offset from source to this first click point
          cloneOffsetRef.current = {
            dx: cloneSourceRef.current.x - coords.x,
            dy: cloneSourceRef.current.y - coords.y,
          };
          // Take a flattened snapshot of the current canvas as the source
          flattenLayers(layers, canvasWidth, canvasHeight).then((snap) => {
            cloneSourceSnapshotRef.current = snap;
            // Create an offscreen canvas for the target layer
            const layer = layers.find((l) => l.id === activeLayerId);
            if (!layer) return;
            const offscreen = document.createElement("canvas");
            offscreen.width = layer.width;
            offscreen.height = layer.height;
            const octx = offscreen.getContext("2d")!;
            // If the layer already has image data, draw it first
            if (layer.imageData) {
              const img = imageCache.get(layer.id);
              if (img && img.complete) {
                octx.drawImage(img, 0, 0, layer.width, layer.height);
              }
            } else if (layer.type === "fill") {
              octx.fillStyle = layer.fillColor || "#ffffff";
              octx.fillRect(0, 0, layer.width, layer.height);
            }
            cloneOffscreenRef.current = offscreen;
            cloneOffscreenLayerIdRef.current = layer.id;
            // Paint the first dab
            cloneStampDab(coords.x, coords.y, layer);
          });
          setIsPainting(true);
          lastPaintPointRef.current = coords;
          return;
        }
        return;
      }

      // Mask painting
      if (
        (activeTool === "mask-brush" || activeTool === "mask-eraser") &&
        editingMaskLayerId
      ) {
        setIsPainting(true);
        lastPaintPointRef.current = coords;
        paintStroke(coords.x, coords.y, null, null);
        return;
      }

      // Transform tool — detect handle or body click
      if (activeTool === "transform" && activeLayerId) {
        const layer = layers.find((l) => l.id === activeLayerId);
        if (layer) {
          const hitRadius = 10 / canvasZoom;
          const lx = layer.x;
          const ly = layer.y;
          const lw = layer.width;
          const lh = layer.height;

          // Check handles (order: TL, TC, TR, MR, BR, BC, BL, ML)
          const handleDefs: { handle: "tl" | "tc" | "tr" | "mr" | "br" | "bc" | "bl" | "ml"; x: number; y: number }[] = [
            { handle: "tl", x: lx, y: ly },
            { handle: "tc", x: lx + lw / 2, y: ly },
            { handle: "tr", x: lx + lw, y: ly },
            { handle: "mr", x: lx + lw, y: ly + lh / 2 },
            { handle: "br", x: lx + lw, y: ly + lh },
            { handle: "bc", x: lx + lw / 2, y: ly + lh },
            { handle: "bl", x: lx, y: ly + lh },
            { handle: "ml", x: lx, y: ly + lh / 2 },
          ];

          let hit: typeof transformHandle = null;
          for (const hd of handleDefs) {
            if (Math.abs(coords.x - hd.x) < hitRadius && Math.abs(coords.y - hd.y) < hitRadius) {
              hit = hd.handle;
              break;
            }
          }

          // If no handle hit, check if inside layer body
          if (!hit) {
            if (coords.x >= lx && coords.x <= lx + lw && coords.y >= ly && coords.y <= ly + lh) {
              hit = "body";
            }
          }

          if (hit) {
            pushHistory(); // Push history once at start of transform drag
            setTransformHandle(hit);
            setTransformOrigin({ x: coords.x, y: coords.y, lx, ly, lw, lh });
            return;
          }
        }
      }

      if (
        (activeTool === "move" || e.ctrlKey || e.metaKey) &&
        activeLayerId
      ) {
        pushHistory(); // Push history once at start of move drag
        setIsDragging(true);
        setDragStart(coords);
        return;
      }

      // Brush / Eraser — start painting
      if (activeTool === "brush" || activeTool === "eraser") {
        const layer = layers.find((l) => l.id === activeLayerId);
        if (!layer) return;
        const offscreen = document.createElement("canvas");
        offscreen.width = layer.width;
        offscreen.height = layer.height;
        const octx = offscreen.getContext("2d")!;
        // Rasterize existing layer content to the offscreen canvas first
        if (layer.imageData) {
          const img = imageCache.get(layer.id);
          if (img && img.complete) {
            octx.drawImage(img, 0, 0, layer.width, layer.height);
          }
        } else if (layer.type === "fill") {
          octx.fillStyle = layer.fillColor || "#ffffff";
          octx.fillRect(0, 0, layer.width, layer.height);
        } else if (layer.type === "text" && layer.textContent) {
          // Rasterize text so the brush can paint over it
          const fontSize = layer.textSize || 32;
          const fontFamily = layer.textFont || "Inter";
          const weight = layer.textBold ? "bold" : "normal";
          const style = layer.textItalic ? "italic" : "normal";
          const lineHeight = (layer.textLineHeight || 1.4) * fontSize;
          octx.fillStyle = layer.textColor || "#000000";
          octx.font = `${style} ${weight} ${fontSize}px ${fontFamily}, sans-serif`;
          octx.textBaseline = "top";
          octx.textAlign = layer.textAlign || "left";
          const textX =
            layer.textAlign === "center" ? layer.width / 2
            : layer.textAlign === "right" ? layer.width : 0;
          layer.textContent.split("\n").forEach((line, lineIdx) => {
            octx.fillText(line, textX, lineIdx * lineHeight);
          });
        }
        brushOffscreenRef.current = offscreen;
        brushOffscreenLayerIdRef.current = layer.id;
        setIsPainting(true);
        lastPaintPointRef.current = coords;
        paintBrushStroke(coords.x, coords.y, null, null);
        return;
      }
    },
    [
      activeTool,
      canvasOffset,
      canvasZoom,
      getCanvasCoords,
      activeLayerId,
      layers,
      editingMaskLayerId,
      paintStroke,
      magicWandTolerance,
      magicWandContiguous,
      pushHistory,
      imageCache,
      cloneStampDab,
      canvasWidth,
      canvasHeight,
      brushColor,
      paintBrushStroke,
      setBrushColor,
    ]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Track mouse for brush cursor
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }

      // Emit canvas position for the status bar
      const canvasCoords = getCanvasCoords(e.clientX, e.clientY);
      window.dispatchEvent(
        new CustomEvent("canvas-mouse-position", {
          detail: { x: canvasCoords.x, y: canvasCoords.y },
        })
      );

      if (isPanning) {
        setCanvasOffset({
          x: e.clientX - panStart.x,
          y: e.clientY - panStart.y,
        });
        return;
      }

      // Eyedropper — continuous sampling during drag
      if (activeTool === "eyedropper" && isPainting && eyedropperSnapshotRef.current) {
        const px = Math.round(canvasCoords.x);
        const py = Math.round(canvasCoords.y);
        if (px >= 0 && px < canvasWidth && py >= 0 && py < canvasHeight) {
          const ctx2 = eyedropperSnapshotRef.current.getContext("2d")!;
          const pixel = ctx2.getImageData(px, py, 1, 1).data;
          const hex = `#${pixel[0].toString(16).padStart(2, "0")}${pixel[1].toString(16).padStart(2, "0")}${pixel[2].toString(16).padStart(2, "0")}`;
          setBrushColor(hex);
          window.dispatchEvent(
            new CustomEvent("canvas-mouse-position", {
              detail: { x: canvasCoords.x, y: canvasCoords.y, sampledColor: hex },
            })
          );
        }
        return;
      }

      // Gradient tool — update end point
      if (activeTool === "gradient" && isPainting && gradientStart) {
        setGradientEnd(canvasCoords);
        return;
      }

      // Crop tool — update crop rectangle (with optional aspect ratio constraint)
      if (activeTool === "crop" && cropStart) {
        let w = Math.abs(canvasCoords.x - cropStart.x);
        let h = Math.abs(canvasCoords.y - cropStart.y);
        if (cropAspectRatio !== null && cropAspectRatio > 0) {
          // Constrain to aspect ratio: use the larger dimension as reference
          if (w / cropAspectRatio > h) {
            h = w / cropAspectRatio;
          } else {
            w = h * cropAspectRatio;
          }
        }
        const x = canvasCoords.x >= cropStart.x ? cropStart.x : cropStart.x - w;
        const y = canvasCoords.y >= cropStart.y ? cropStart.y : cropStart.y - h;
        setCropRect({ x, y, w, h });
        return;
      }

      if (selectionStart && activeTool === "rectangle-select") {
        const coords = getCanvasCoords(e.clientX, e.clientY);
        const x = Math.min(selectionStart.x, coords.x);
        const y = Math.min(selectionStart.y, coords.y);
        const width = Math.abs(coords.x - selectionStart.x);
        const height = Math.abs(coords.y - selectionStart.y);
        setCurrentSelection({ x, y, width, height });
        return;
      }

      // Lasso tool — draw freehand path
      if (lassoDrawing) {
        const coords = getCanvasCoords(e.clientX, e.clientY);
        lassoPointsRef.current.push(coords);
        return;
      }

      // Mask painting
      if (
        isPainting &&
        (activeTool === "mask-brush" || activeTool === "mask-eraser")
      ) {
        const coords = getCanvasCoords(e.clientX, e.clientY);
        const prev = lastPaintPointRef.current;
        paintStroke(
          coords.x,
          coords.y,
          prev?.x ?? null,
          prev?.y ?? null
        );
        lastPaintPointRef.current = coords;
        return;
      }

      // Clone stamp / Healing brush painting
      if (
        isPainting &&
        (activeTool === "clone-stamp" || activeTool === "healing-brush") &&
        cloneOffscreenRef.current &&
        cloneSourceSnapshotRef.current
      ) {
        const coords = getCanvasCoords(e.clientX, e.clientY);
        const prev = lastPaintPointRef.current;
        const layer = layers.find((l) => l.id === cloneOffscreenLayerIdRef.current);
        if (layer) {
          // Interpolate dabs along the stroke for smoothness
          if (prev) {
            const dist = Math.hypot(coords.x - prev.x, coords.y - prev.y);
            const step = Math.max(2, brushSize * 0.25);
            if (dist > step) {
              const steps = Math.ceil(dist / step);
              for (let i = 1; i <= steps; i++) {
                const t = i / steps;
                const ix = prev.x + (coords.x - prev.x) * t;
                const iy = prev.y + (coords.y - prev.y) * t;
                cloneStampDab(ix, iy, layer);
              }
            } else {
              cloneStampDab(coords.x, coords.y, layer);
            }
          } else {
            cloneStampDab(coords.x, coords.y, layer);
          }
        }
        lastPaintPointRef.current = coords;
        return;
      }

      // Transform tool dragging (silent — history was pushed on mouseDown)
      if (transformHandle && activeLayerId) {
        const coords = getCanvasCoords(e.clientX, e.clientY);
        const dx = coords.x - transformOrigin.x;
        const dy = coords.y - transformOrigin.y;
        const { lx, ly, lw, lh } = transformOrigin;
        const shiftKey = e.shiftKey; // proportional resize

        let nx = lx, ny = ly, nw = lw, nh = lh;

        switch (transformHandle) {
          case "body":
            nx = lx + dx;
            ny = ly + dy;
            break;
          case "br":
            nw = Math.max(16, lw + dx);
            nh = shiftKey ? nw * (lh / lw) : Math.max(16, lh + dy);
            break;
          case "bl":
            nw = Math.max(16, lw - dx);
            nh = shiftKey ? nw * (lh / lw) : Math.max(16, lh + dy);
            nx = lx + lw - nw;
            break;
          case "tr":
            nw = Math.max(16, lw + dx);
            nh = shiftKey ? nw * (lh / lw) : Math.max(16, lh - dy);
            ny = ly + lh - nh;
            break;
          case "tl":
            nw = Math.max(16, lw - dx);
            nh = shiftKey ? nw * (lh / lw) : Math.max(16, lh - dy);
            nx = lx + lw - nw;
            ny = ly + lh - nh;
            break;
          case "mr":
            nw = Math.max(16, lw + dx);
            break;
          case "ml":
            nw = Math.max(16, lw - dx);
            nx = lx + lw - nw;
            break;
          case "bc":
            nh = Math.max(16, lh + dy);
            break;
          case "tc":
            nh = Math.max(16, lh - dy);
            ny = ly + lh - nh;
            break;
        }

        updateLayerSilent(activeLayerId, {
          x: Math.round(nx),
          y: Math.round(ny),
          width: Math.round(nw),
          height: Math.round(nh),
        });
        return;
      }

      // Move tool dragging (silent — history was pushed on mouseDown)
      if (
        isDragging &&
        activeLayerId &&
        (e.ctrlKey || e.metaKey || activeTool === "move")
      ) {
        const coords = getCanvasCoords(e.clientX, e.clientY);
        const layer = layers.find((l) => l.id === activeLayerId);
        if (layer) {
          const dx = coords.x - dragStart.x;
          const dy = coords.y - dragStart.y;
          updateLayerSilent(activeLayerId, {
            x: layer.x + dx,
            y: layer.y + dy,
          });
          setDragStart(coords);
        }
      }

      // Brush / Eraser painting
      if (
        isPainting &&
        (activeTool === "brush" || activeTool === "eraser") &&
        brushOffscreenRef.current &&
        brushOffscreenLayerIdRef.current
      ) {
        const coords = getCanvasCoords(e.clientX, e.clientY);
        const prev = lastPaintPointRef.current;
        const layer = layers.find((l) => l.id === brushOffscreenLayerIdRef.current);
        if (layer) {
          // Interpolate dabs along the stroke for smoothness
          if (prev) {
            const dist = Math.hypot(coords.x - prev.x, coords.y - prev.y);
            const step = Math.max(2, brushSize * 0.25);
            if (dist > step) {
              const steps = Math.ceil(dist / step);
              for (let i = 1; i <= steps; i++) {
                const t = i / steps;
                const ix = prev.x + (coords.x - prev.x) * t;
                const iy = prev.y + (coords.y - prev.y) * t;
                paintBrushStroke(ix, iy, prev.x, prev.y);
              }
            } else {
              paintBrushStroke(coords.x, coords.y, prev.x, prev.y);
            }
          } else {
            paintBrushStroke(coords.x, coords.y, null, null);
          }
        }
        lastPaintPointRef.current = coords;
        return;
      }
    },
    [
      isPanning,
      panStart,
      selectionStart,
      activeTool,
      getCanvasCoords,
      isDragging,
      activeLayerId,
      layers,
      dragStart,
      updateLayer,
      updateLayerSilent,
      isPainting,
      paintStroke,
      transformHandle,
      transformOrigin,
      lassoDrawing,
      brushSize,
      cloneStampDab,
      brushColor,
      paintBrushStroke,
      setBrushColor,
      canvasWidth,
      canvasHeight,
      cropAspectRatio,
      cropStart,
      gradientStart,
    ]
  );

  const handleMouseUp = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    // Eyedropper — clean up snapshot
    if (activeTool === "eyedropper" && isPainting) {
      setIsPainting(false);
      eyedropperSnapshotRef.current = null;
      return;
    }

    // Gradient tool — apply gradient to active layer
    if (activeTool === "gradient" && gradientStart && gradientEnd) {
      setIsPainting(false);
      const layer = layers.find((l) => l.id === activeLayerId);
      if (layer) {
        const canvas = document.createElement("canvas");
        canvas.width = layer.width;
        canvas.height = layer.height;
        const gctx = canvas.getContext("2d")!;

        // Draw existing layer content first
        if (layer.imageData) {
          const img = imageCache.get(layer.id);
          if (img && img.complete) {
            gctx.drawImage(img, 0, 0, layer.width, layer.height);
          }
        } else if (layer.type === "fill") {
          gctx.fillStyle = layer.fillColor || "#ffffff";
          gctx.fillRect(0, 0, layer.width, layer.height);
        }

        // Create and apply gradient
        const x0 = gradientStart.x - layer.x;
        const y0 = gradientStart.y - layer.y;
        const x1 = gradientEnd.x - layer.x;
        const y1 = gradientEnd.y - layer.y;
        let grad: CanvasGradient;
        if (gradientMode === "radial") {
          const radius = Math.hypot(x1 - x0, y1 - y0);
          grad = gctx.createRadialGradient(x0, y0, 0, x0, y0, Math.max(1, radius));
        } else {
          grad = gctx.createLinearGradient(x0, y0, x1, y1);
        }
        grad.addColorStop(0, brushColor);
        grad.addColorStop(1, gradientEndColor);
        gctx.fillStyle = grad;
        gctx.fillRect(0, 0, layer.width, layer.height);

        updateLayer(layer.id, { imageData: canvas.toDataURL("image/png"), type: "image" });
      }
      setGradientStart(null);
      setGradientEnd(null);
      return;
    }

    // Crop tool — show confirm overlay
    if (activeTool === "crop" && cropStart && cropRect && cropRect.w > 4 && cropRect.h > 4) {
      setCropStart(null);
      setShowCropConfirm(true);
      return;
    }
    if (activeTool === "crop") {
      setCropStart(null);
      return;
    }

    // Lasso tool — finalize selection (before isPainting check since lasso reuses isPainting)
    if (lassoDrawing) {
      setIsPainting(false);
      setLassoDrawing(false);
      const path = lassoPointsRef.current;
      if (path.length > 2) {
        const sel = lassoPathToSelection(path);
        if (sel) setSelection(sel);
      }
      lassoPointsRef.current = [];
      return;
    }

    if (isPainting) {
      setIsPainting(false);
      lastPaintPointRef.current = null;
      if (activeTool === "clone-stamp" || activeTool === "healing-brush") {
        commitCloneStamp();
      } else if (activeTool === "brush" || activeTool === "eraser") {
        commitBrushStroke();
      } else {
        commitMask();
      }
      return;
    }
    if (transformHandle) {
      setTransformHandle(null);
      return;
    }
    if (selectionStart && currentSelection) {
      setSelection(currentSelection);
      setCurrentSelection(null);
    }
    setSelectionStart(null);
    setIsDragging(false);
  }, [isPanning, isPainting, selectionStart, currentSelection, setSelection, commitMask, transformHandle, lassoDrawing, activeTool, commitCloneStamp, commitBrushStroke, gradientStart, gradientEnd, brushColor, gradientEndColor, gradientMode, activeLayerId, layers, imageCache, cropRect, cropStart, updateLayer, pushHistory, setLayers, setCanvasDimensions]);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.1, Math.min(10, canvasZoom * delta));
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const newOffsetX =
          mouseX - (mouseX - canvasOffset.x) * (newZoom / canvasZoom);
        const newOffsetY =
          mouseY - (mouseY - canvasOffset.y) * (newZoom / canvasZoom);
        setCanvasOffset({ x: newOffsetX, y: newOffsetY });
      }
      setCanvasZoom(newZoom);
    },
    [canvasZoom, canvasOffset, setCanvasZoom, setCanvasOffset]
  );

  const getCursor = () => {
    if (
      activeTool === "mask-brush" ||
      activeTool === "mask-eraser" ||
      activeTool === "brush" ||
      activeTool === "eraser" ||
      activeTool === "clone-stamp" ||
      activeTool === "healing-brush"
    ) {
      return "none"; // We show a custom cursor
    }
    switch (activeTool) {
      case "hand":
        return isPanning ? "grabbing" : "grab";
      case "rectangle-select":
      case "lasso":
      case "magic-wand":
        return "crosshair";
      case "text":
        return "text";
      case "eyedropper":
        return "crosshair";
      case "gradient":
        return "crosshair";
      case "crop":
        return "crosshair";
      case "move":
        return "move";
      case "zoom":
        return "zoom-in";
      case "transform":
        if (transformHandle === "body") return "move";
        if (transformHandle === "tl" || transformHandle === "br") return "nwse-resize";
        if (transformHandle === "tr" || transformHandle === "bl") return "nesw-resize";
        if (transformHandle === "tc" || transformHandle === "bc") return "ns-resize";
        if (transformHandle === "ml" || transformHandle === "mr") return "ew-resize";
        return "default";
      default:
        return "default";
    }
  };

  const isBrushCursorTool =
    activeTool === "mask-brush" ||
    activeTool === "mask-eraser" ||
    activeTool === "brush" ||
    activeTool === "eraser" ||
    activeTool === "clone-stamp" ||
    activeTool === "healing-brush";

  const brushCursorSize = brushSize * canvasZoom;
  const isMaskMode = !!editingMaskLayerId;

  return (
    <div
      ref={containerRef}
      className="flex-1 relative overflow-hidden bg-background"
      style={{ cursor: getCursor() }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={(e) => {
        handleMouseUp();
        setMouseInCanvas(false);
      }}
      onMouseEnter={() => setMouseInCanvas(true)}
      onWheel={handleWheel}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Custom brush cursor */}
      {isBrushCursorTool && mouseInCanvas && (
        <div
          className="pointer-events-none absolute"
          style={{
            width: brushCursorSize,
            height: brushCursorSize,
            borderRadius: "50%",
            border: `1.5px solid ${
              activeTool === "mask-brush"
                ? "rgba(255,255,255,0.7)"
                : activeTool === "mask-eraser"
                ? "rgba(255,80,80,0.7)"
                : activeTool === "eraser"
                ? "rgba(200,120,120,0.8)"
                : activeTool === "brush"
                ? `${brushColor}cc`
                : "rgba(62,207,142,0.7)"
            }`,
            left: mousePos.x - brushCursorSize / 2,
            top: mousePos.y - brushCursorSize / 2,
            boxShadow:
              activeTool === "mask-brush"
                ? "0 0 4px rgba(255,255,255,0.3)"
                : activeTool === "mask-eraser"
                ? "0 0 4px rgba(255,0,0,0.3)"
                : activeTool === "eraser"
                ? "0 0 4px rgba(200,80,80,0.3)"
                : activeTool === "brush"
                ? `0 0 6px ${brushColor}55`
                : "0 0 4px rgba(62,207,142,0.3)",
          }}
        >
          {/* Center dot */}
          <div
            className="absolute rounded-full"
            style={{
              width: 3,
              height: 3,
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              backgroundColor:
                activeTool === "mask-brush"
                  ? "rgba(255,255,255,0.8)"
                  : activeTool === "mask-eraser"
                  ? "rgba(255,80,80,0.8)"
                  : activeTool === "eraser"
                  ? "rgba(200,100,100,0.9)"
                  : activeTool === "brush"
                  ? brushColor
                  : "rgba(62,207,142,0.8)",
            }}
          />
        </div>
      )}

      {/* Zoom indicator */}
      <div className="absolute bottom-3 left-3 bg-card/90 backdrop-blur-sm border border-border rounded-md px-2 py-1 text-muted-foreground text-xs">
        {Math.round(canvasZoom * 100)}%
      </div>

      {/* Canvas size indicator */}
      <div className="absolute bottom-3 right-3 bg-card/90 backdrop-blur-sm border border-border rounded-md px-2 py-1 text-muted-foreground text-xs">
        {canvasWidth} x {canvasHeight}
      </div>

      {/* Crop confirm overlay */}
      {showCropConfirm && cropRect && cropRect.w > 4 && cropRect.h > 4 && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-card/95 backdrop-blur-sm border border-primary/30 rounded-md px-3 py-2 text-xs flex items-center gap-3 z-20 shadow-lg">
          <span className="text-foreground">
            Crop to {Math.round(cropRect.w)} x {Math.round(cropRect.h)}?
          </span>
          <button
            onClick={() => {
              // Apply crop: resize canvas and reposition all layers
              const cx = Math.round(cropRect.x);
              const cy = Math.round(cropRect.y);
              const cw = Math.round(cropRect.w);
              const ch = Math.round(cropRect.h);
              
              // Update all layers: shift positions and clip content
              // setLayers pushes history once; setCanvasDimensions is lightweight (no history)
              const newLayers = layers.map((l) => ({
                ...l,
                x: l.x - cx,
                y: l.y - cy,
                // Resize background fill layer to match new canvas
                ...(l.id === "bg-1" ? { width: cw, height: ch, x: 0, y: 0 } : {}),
              }));
              setLayers(newLayers);
              setCanvasDimensions(cw, ch);
              
              setCropRect(null);
              setShowCropConfirm(false);
            }}
            className="px-3 py-1 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Apply
          </button>
          <button
            onClick={() => {
              setCropRect(null);
              setShowCropConfirm(false);
            }}
            className="px-3 py-1 bg-secondary text-foreground rounded-md hover:bg-accent transition-colors border border-border"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Mask mode indicator */}
      {isMaskMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-card/90 backdrop-blur-sm border border-primary/30 rounded-md px-3 py-1.5 text-xs flex items-center gap-2 z-10">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-primary">Mask Editing</span>
          <span className="text-muted-foreground/70">|</span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm border border-border"
              style={{ background: "white" }}
            />
            <span className="text-muted-foreground">Reveal</span>
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm border border-border"
              style={{ background: "black" }}
            />
            <span className="text-muted-foreground">Hide</span>
          </span>
          <span className="text-muted-foreground/70">|</span>
          <span className="text-red-400/70 flex items-center gap-1">
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm"
              style={{ background: "rgba(255,60,60,0.5)" }}
            />
            Hidden areas
          </span>
        </div>
      )}
    </div>
  );
}