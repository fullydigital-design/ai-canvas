import { useRef, useEffect, useCallback, useState } from "react";
import { useEditorSelector, getLayerImageDataUrl, getLayerMaskDataUrl, layerHasImage, layerHasMask } from "./editor-store";
import { imageCache as globalImageCache } from "./image-cache";
import { magicWandSelect, DEFAULT_MAGIC_WAND } from "./selection-tools";
import { flattenLayers } from "./canvas-utils";
import { renderCanvas, type RenderContext } from "./canvas-renderer";
import { useShallow } from "zustand/react/shallow";
import { useWheelZoom } from "./canvas-interactions/use-wheel-zoom";
import { useCropInteractions } from "./canvas-interactions/use-crop-interactions";
import { useSelectionInteractions } from "./canvas-interactions/use-selection-interactions";

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
    brushSize,
    brushColor,
    brushHardness,
    editingMaskLayerId,
    magicWandTolerance,
    magicWandContiguous,
    pushHistory,
    setBrushColor,
    setLayers,
    gradientEndColor,
    gradientMode,
    cropAspectRatio,
    setCanvasDimensions,
    updateLayerSilent,
    updateLayerImage,
    updateLayerMask,
  } = useEditorSelector(
    useShallow((s) => ({
      layers: s.layers,
      activeTool: s.activeTool,
      selection: s.selection,
      setSelection: s.setSelection,
      canvasOffset: s.canvasOffset,
      setCanvasOffset: s.setCanvasOffset,
      canvasZoom: s.canvasZoom,
      setCanvasZoom: s.setCanvasZoom,
      canvasWidth: s.canvasWidth,
      canvasHeight: s.canvasHeight,
      activeLayerId: s.activeLayerId,
      brushSize: s.brushSize,
      brushColor: s.brushColor,
      brushHardness: s.brushHardness,
      editingMaskLayerId: s.editingMaskLayerId,
      magicWandTolerance: s.magicWandTolerance,
      magicWandContiguous: s.magicWandContiguous,
      pushHistory: s.pushHistory,
      setBrushColor: s.setBrushColor,
      setLayers: s.setLayers,
      gradientEndColor: s.gradientEndColor,
      gradientMode: s.gradientMode,
      cropAspectRatio: s.cropAspectRatio,
      setCanvasDimensions: s.setCanvasDimensions,
      updateLayerSilent: s.updateLayerSilent,
      updateLayerImage: s.updateLayerImage,
      updateLayerMask: s.updateLayerMask,
    }))
  );

  const [isDragging, setIsDragging] = useState(false);
  // Keep drag origin in refs so rapid mousemove events don't compound stale state deltas.
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragLayerOriginRef = useRef<{ x: number; y: number } | null>(null);
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

  // Gradient tool state
  const [gradientStart, setGradientStart] = useState<{ x: number; y: number } | null>(null);
  const [gradientEnd, setGradientEnd] = useState<{ x: number; y: number } | null>(null);

  const {
    selectionStart,
    currentSelection,
    lassoDrawing,
    lassoPointsRef,
    startRectangleSelection,
    updateRectangleSelection,
    finalizeRectangleSelection,
    startLasso,
    appendLassoPoint,
    finalizeLasso,
  } = useSelectionInteractions();

  const {
    cropRect,
    cropStart,
    showCropConfirm,
    beginCrop,
    updateCropRect,
    finalizeCropDrag,
    applyCrop,
    cancelCrop,
  } = useCropInteractions({
    cropAspectRatio,
    setLayers,
    setCanvasDimensions,
  });

  // Clone stamp state
  const cloneSourceRef = useRef<{ x: number; y: number; layerId: string } | null>(null);
  // Clone stamp offscreen: holds the target layer's working canvas during a paint stroke
  const cloneOffscreenRef = useRef<HTMLCanvasElement | null>(null);
  const cloneOffscreenLayerIdRef = useRef<string | null>(null);
  const cloneRasterScaleRef = useRef<{ x: number; y: number }>({ x: 1, y: 1 });
  // Snapshot of all layers flattened at the moment painting started (source pixels)
  const cloneSourceSnapshotRef = useRef<HTMLCanvasElement | null>(null);
  const cloneSourceMappingRef = useRef<{
    mode: "document" | "layer";
    scaleX: number;
    scaleY: number;
    layerX: number;
    layerY: number;
  }>({
    mode: "document",
    scaleX: 1,
    scaleY: 1,
    layerX: 0,
    layerY: 0,
  });
  // Offset between source and first destination click
  const cloneOffsetRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  // Eyedropper snapshot ref for continuous sampling during drag
  const eyedropperSnapshotRef = useRef<HTMLCanvasElement | null>(null);

  // Brush / Eraser offscreen canvas (working surface for a stroke)
  const brushOffscreenRef = useRef<HTMLCanvasElement | null>(null);
  const brushOffscreenLayerIdRef = useRef<string | null>(null);
  const brushRasterScaleRef = useRef<{ x: number; y: number }>({ x: 1, y: 1 });

  // Preserve source quality while editing image layers.
  const getLayerRasterSpace = useCallback(
    (layer: { id: string; width: number; height: number }) => {
      const img = imageCache.get(layer.id);
      if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
        const rw = img.naturalWidth;
        const rh = img.naturalHeight;
        return {
          width: rw,
          height: rh,
          scaleX: rw / Math.max(1, layer.width),
          scaleY: rh / Math.max(1, layer.height),
        };
      }
      return { width: layer.width, height: layer.height, scaleX: 1, scaleY: 1 };
    },
    [imageCache],
  );

  // Load images for layers — supports both imageRef (global cache) and legacy imageData
  useEffect(() => {
    const newCache = new Map(imageCache);
    let changed = false;
    layers.forEach((layer) => {
      if (layer.imageRef) {
        // imageRef layers use the global ImageCache; populate component cache from it
        const globalEl = globalImageCache.getElement(layer.imageRef);
        if (globalEl && globalEl.complete) {
          const existing = newCache.get(layer.id);
          if (existing !== globalEl) {
            newCache.set(layer.id, globalEl);
            changed = true;
          }
        } else {
          // Image is still loading in global cache — subscribe for re-render
          const dataUrl = globalImageCache.getDataUrl(layer.imageRef);
          if (dataUrl) {
            const img = new Image();
            img.onload = () => {
              setImageCache((prev) => new Map(prev).set(layer.id, img));
            };
            img.src = dataUrl;
          }
        }
      } else if (layer.imageData) {
        // Legacy: load directly from base64
        const cached = newCache.get(layer.id);
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

  // Load mask images for ALL layers — supports maskRef (global cache) and legacy maskData
  useEffect(() => {
    const cache = maskImageCacheRef.current;
    layers.forEach((layer) => {
      const maskDataUrl = getLayerMaskDataUrl(layer);
      if (maskDataUrl) {
        const existing = cache.get(layer.id);
        if (!existing || existing.getAttribute("data-src") !== maskDataUrl) {
          // For maskRef layers, try global cache first
          if (layer.maskRef) {
            const globalEl = globalImageCache.getElement(layer.maskRef);
            if (globalEl && globalEl.complete) {
              cache.set(layer.id, globalEl);
              setRenderTick((t) => t + 1);
              return;
            }
          }
          const img = new Image();
          img.setAttribute("data-src", maskDataUrl);
          img.onload = () => {
            cache.set(layer.id, img);
            setRenderTick((t) => t + 1);
          };
          img.src = maskDataUrl;
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
        updateLayerMask(maskOffscreenLayerIdRef.current, dataUrl);
      }
      maskOffscreenRef.current = null;
      maskOffscreenLayerIdRef.current = null;
      return;
    }

    const layer = layers.find((l) => l.id === editingMaskLayerId);
    if (!layer || !layerHasMask(layer)) return;

    const maskDataUrl = getLayerMaskDataUrl(layer);
    if (!maskDataUrl) return;

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
    img.src = maskDataUrl;
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
    updateLayerMask(layerId, dataUrl);
  }, [updateLayerMask]);

  // === BRUSH / ERASER PAINT STROKE ===
  const paintBrushStroke = useCallback(
    (x: number, y: number, prevX: number | null, prevY: number | null) => {
      const offscreen = brushOffscreenRef.current;
      if (!offscreen || !brushOffscreenLayerIdRef.current) return;
      const layer = layers.find((l) => l.id === brushOffscreenLayerIdRef.current);
      if (!layer) return;

      const ctx = offscreen.getContext("2d")!;
      const scaleX = brushRasterScaleRef.current.x;
      const scaleY = brushRasterScaleRef.current.y;
      const brushScale = (scaleX + scaleY) / 2;
      const scaledBrushSize = brushSize * brushScale;
      const lx = (x - layer.x) * scaleX;
      const ly = (y - layer.y) * scaleY;
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
      ctx.lineWidth = scaledBrushSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const softness = (100 - brushHardness) / 100;
      if (!isEraser && softness > 0.01) {
        ctx.shadowBlur = scaledBrushSize * softness * 0.5;
        ctx.shadowColor = brushColor;
      }

      if (prevX !== null && prevY !== null) {
        const plx = (prevX - layer.x) * scaleX;
        const ply = (prevY - layer.y) * scaleY;
        const dist = Math.hypot(lx - plx, ly - ply);
        const step = Math.max(1, scaledBrushSize * 0.15);
        if (dist > step) {
          ctx.beginPath();
          ctx.moveTo(plx, ply);
          ctx.lineTo(lx, ly);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(lx, ly, scaledBrushSize / 2, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.beginPath();
        ctx.arc(lx, ly, scaledBrushSize / 2, 0, Math.PI * 2);
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
    updateLayerImage(layerId, dataUrl);
    brushOffscreenRef.current = null;
    brushOffscreenLayerIdRef.current = null;
    brushRasterScaleRef.current = { x: 1, y: 1 };
  }, [updateLayerImage]);

  // === CLONE STAMP DAB ===
  // Paints source pixels from the flattened snapshot onto the target layer offscreen
  const cloneStampDab = useCallback((destX: number, destY: number, layer: { x: number; y: number; width: number; height: number }) => {
    const snapshot = cloneSourceSnapshotRef.current;
    const offscreen = cloneOffscreenRef.current;
    if (!snapshot || !offscreen) return;

    const octx = offscreen.getContext("2d", { willReadFrequently: true })!;
    const { dx, dy } = cloneOffsetRef.current;
    const { x: scaleX, y: scaleY } = cloneRasterScaleRef.current;
    const brushScale = (scaleX + scaleY) / 2;
    const mappedBrushSize = Math.max(1, Math.round(brushSize * brushScale));
    const isHealing = activeTool === "healing-brush";
    const sourceMap = cloneSourceMappingRef.current;

    // Source position in document coordinates
    const srcX = destX + dx;
    const srcY = destY + dy;

    // Local coordinates on the target layer's offscreen
    const localX = (destX - layer.x) * scaleX;
    const localY = (destY - layer.y) * scaleY;

    const radius = mappedBrushSize / 2;
    const softness = (100 - brushHardness) / 100;

    // Extract a circular patch from the flattened snapshot at the source position
    const patchSize = mappedBrushSize;
    const patchCanvas = document.createElement("canvas");
    patchCanvas.width = patchSize;
    patchCanvas.height = patchSize;
    const pctx = patchCanvas.getContext("2d", { willReadFrequently: true })!;
    pctx.imageSmoothingEnabled = true;
    pctx.imageSmoothingQuality = "high";

    // Map source sampling coordinates to the snapshot space.
    const mappedSrcX =
      sourceMap.mode === "layer"
        ? (srcX - sourceMap.layerX) * sourceMap.scaleX
        : srcX * sourceMap.scaleX;
    const mappedSrcY =
      sourceMap.mode === "layer"
        ? (srcY - sourceMap.layerY) * sourceMap.scaleY
        : srcY * sourceMap.scaleY;

    // Draw circular clip from snapshot
    pctx.beginPath();
    pctx.arc(patchSize / 2, patchSize / 2, radius, 0, Math.PI * 2);
    pctx.clip();
    pctx.drawImage(
      snapshot,
      mappedSrcX - radius, mappedSrcY - radius, patchSize, patchSize,
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
    updateLayerImage(layerId, dataUrl);
    cloneOffscreenRef.current = null;
    cloneOffscreenLayerIdRef.current = null;
    cloneSourceSnapshotRef.current = null;
    cloneRasterScaleRef.current = { x: 1, y: 1 };
    cloneSourceMappingRef.current = {
      mode: "document",
      scaleX: 1,
      scaleY: 1,
      layerX: 0,
      layerY: 0,
    };
  }, [updateLayerImage]);

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

  // luminanceToAlpha is now in canvas-renderer.ts

  // === RENDER ===
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rc: RenderContext = {
      canvas,
      container,
      layers,
      imageCache,
      canvasOffset,
      canvasZoom,
      canvasWidth,
      canvasHeight,
      selection,
      currentSelection,
      editingMaskLayerId,
      getMaskSource,
      activeTool,
      activeLayerId,
      lassoDrawing,
      lassoPoints: lassoPointsRef.current,
      cloneSource: cloneSourceRef.current,
      gradientStart,
      gradientEnd,
      brushColor,
      gradientEndColor,
      gradientMode,
      cropRect,
      isPainting,
      brushOffscreen: brushOffscreenRef.current,
      brushOffscreenLayerId: brushOffscreenLayerIdRef.current,
      cloneOffscreen: cloneOffscreenRef.current,
      cloneOffscreenLayerId: cloneOffscreenLayerIdRef.current,
    };
    renderCanvas(rc);
  }, [
    layers, canvasOffset, canvasZoom, canvasWidth, canvasHeight,
    selection, currentSelection, imageCache, editingMaskLayerId,
    renderTick, getMaskSource, activeTool, activeLayerId,
    lassoDrawing, gradientStart, gradientEnd, brushColor,
    gradientEndColor, gradientMode, cropRect, isPainting,
  ]);

  // Render loop — use rAF for smooth animation (marching ants)
  useEffect(() => {
    let running = true;
    const shouldAnimate =
      !!editingMaskLayerId ||
      isPainting ||
      !!transformHandle ||
      lassoDrawing ||
      !!cropStart;
    const loop = () => {
      if (!running) return;
      render();
      if (shouldAnimate) {
        requestAnimationFrame(loop);
      }
    };
    const frame = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(frame);
    };
  }, [render, editingMaskLayerId, isPainting, transformHandle, lassoDrawing, cropStart]);

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
      // While crop confirmation is visible, ignore canvas tool interactions.
      // This prevents button clicks from being consumed by crop tool mousedown logic.
      if (showCropConfirm) return;

      const coords = getCanvasCoords(e.clientX, e.clientY);

      // Eyedropper — sample pixel color from flattened canvas
      if (activeTool === "eyedropper") {
        setIsPainting(true); // Enable continuous sampling during drag
        (async () => {
          try {
            const flat = await flattenLayers(layers, canvasWidth, canvasHeight, {
              preferMainThread: true,
            });
            eyedropperSnapshotRef.current = flat;
            const ctx2 = flat.getContext("2d", { willReadFrequently: true })!;
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
        beginCrop(coords);
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
        startRectangleSelection(coords);
        return;
      }

      // Lasso tool — start drawing freehand path
      if (activeTool === "lasso") {
        startLasso(coords);
        setIsPainting(true); // reuse for animation loop
        return;
      }

      // Magic Wand — click to flood-fill select
      if (activeTool === "magic-wand") {
        (async () => {
          try {
            const flat = await flattenLayers(layers, canvasWidth, canvasHeight, {
              preferMainThread: true,
            });
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
          const layer = layers.find((l) => l.id === activeLayerId);
          if (!layer) return;
          const raster = getLayerRasterSpace(layer);

          // Calculate offset from source to this first click point
          cloneOffsetRef.current = {
            dx: cloneSourceRef.current.x - coords.x,
            dy: cloneSourceRef.current.y - coords.y,
          };

          const initTargetOffscreen = () => {
            const offscreen = document.createElement("canvas");
            offscreen.width = raster.width;
            offscreen.height = raster.height;
            const octx = offscreen.getContext("2d", { willReadFrequently: true })!;
            octx.imageSmoothingEnabled = true;
            octx.imageSmoothingQuality = "high";
            if (layerHasImage(layer)) {
              const img = imageCache.get(layer.id);
              if (img && img.complete) {
                octx.drawImage(img, 0, 0, raster.width, raster.height);
              }
            } else if (layer.type === "fill") {
              octx.fillStyle = layer.fillColor || "#ffffff";
              octx.fillRect(0, 0, raster.width, raster.height);
            } else if (layer.type === "text" && layer.textContent) {
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
                layer.textAlign === "center" ? raster.width / 2
                : layer.textAlign === "right" ? raster.width : 0;
              layer.textContent.split("\n").forEach((line, lineIdx) => {
                octx.fillText(line, textX, lineIdx * lineHeight);
              });
            }
            cloneOffscreenRef.current = offscreen;
            cloneOffscreenLayerIdRef.current = layer.id;
            cloneRasterScaleRef.current = { x: raster.scaleX, y: raster.scaleY };
          };

          // High-quality source when cloning from the same active layer:
          // sample in original raster space instead of flattened display resolution.
          if (cloneSourceRef.current.layerId === layer.id) {
            const sourceCanvas = document.createElement("canvas");
            sourceCanvas.width = raster.width;
            sourceCanvas.height = raster.height;
            const sctx = sourceCanvas.getContext("2d", { willReadFrequently: true })!;
            sctx.imageSmoothingEnabled = true;
            sctx.imageSmoothingQuality = "high";
            if (layerHasImage(layer)) {
              const img = imageCache.get(layer.id);
              if (img && img.complete) {
                sctx.drawImage(img, 0, 0, raster.width, raster.height);
              }
            } else if (layer.type === "fill") {
              sctx.fillStyle = layer.fillColor || "#ffffff";
              sctx.fillRect(0, 0, raster.width, raster.height);
            } else if (layer.type === "text" && layer.textContent) {
              const fontSize = layer.textSize || 32;
              const fontFamily = layer.textFont || "Inter";
              const weight = layer.textBold ? "bold" : "normal";
              const style = layer.textItalic ? "italic" : "normal";
              const lineHeight = (layer.textLineHeight || 1.4) * fontSize;
              sctx.fillStyle = layer.textColor || "#000000";
              sctx.font = `${style} ${weight} ${fontSize}px ${fontFamily}, sans-serif`;
              sctx.textBaseline = "top";
              sctx.textAlign = layer.textAlign || "left";
              const textX =
                layer.textAlign === "center" ? raster.width / 2
                : layer.textAlign === "right" ? raster.width : 0;
              layer.textContent.split("\n").forEach((line, lineIdx) => {
                sctx.fillText(line, textX, lineIdx * lineHeight);
              });
            }
            cloneSourceSnapshotRef.current = sourceCanvas;
            cloneSourceMappingRef.current = {
              mode: "layer",
              scaleX: raster.scaleX,
              scaleY: raster.scaleY,
              layerX: layer.x,
              layerY: layer.y,
            };
            initTargetOffscreen();
            cloneStampDab(coords.x, coords.y, layer);
            setIsPainting(true);
            lastPaintPointRef.current = coords;
            return;
          }

          // Fallback source: flattened document snapshot in canvas space.
          flattenLayers(layers, canvasWidth, canvasHeight, {
            preferMainThread: true,
          }).then((snap) => {
            cloneSourceSnapshotRef.current = snap;
            cloneSourceMappingRef.current = {
              mode: "document",
              scaleX: 1,
              scaleY: 1,
              layerX: 0,
              layerY: 0,
            };
            initTargetOffscreen();
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
        const layer = layers.find((l) => l.id === activeLayerId);
        if (!layer) return;
        pushHistory(); // Push history once at start of move drag
        dragStartRef.current = coords;
        dragLayerOriginRef.current = { x: layer.x, y: layer.y };
        setIsDragging(true);
        return;
      }

      // Brush / Eraser — start painting
      if (activeTool === "brush" || activeTool === "eraser") {
        const layer = layers.find((l) => l.id === activeLayerId);
        if (!layer) return;
        const raster = getLayerRasterSpace(layer);
        const offscreen = document.createElement("canvas");
        offscreen.width = raster.width;
        offscreen.height = raster.height;
        const octx = offscreen.getContext("2d")!;
        octx.imageSmoothingEnabled = true;
        octx.imageSmoothingQuality = "high";
        // Rasterize existing layer content to the offscreen canvas first
        if (layerHasImage(layer)) {
          const img = imageCache.get(layer.id);
          if (img && img.complete) {
            octx.drawImage(img, 0, 0, raster.width, raster.height);
          }
        } else if (layer.type === "fill") {
          octx.fillStyle = layer.fillColor || "#ffffff";
          octx.fillRect(0, 0, raster.width, raster.height);
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
            layer.textAlign === "center" ? raster.width / 2
            : layer.textAlign === "right" ? raster.width : 0;
          layer.textContent.split("\n").forEach((line, lineIdx) => {
            octx.fillText(line, textX, lineIdx * lineHeight);
          });
        }
        brushOffscreenRef.current = offscreen;
        brushOffscreenLayerIdRef.current = layer.id;
        brushRasterScaleRef.current = { x: raster.scaleX, y: raster.scaleY };
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
      getLayerRasterSpace,
      cloneStampDab,
      canvasWidth,
      canvasHeight,
      brushColor,
      paintBrushStroke,
      setBrushColor,
      beginCrop,
      startRectangleSelection,
      startLasso,
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
          const ctx2 = eyedropperSnapshotRef.current.getContext("2d", {
            willReadFrequently: true,
          })!;
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
        updateCropRect(canvasCoords);
        return;
      }

      if (selectionStart && activeTool === "rectangle-select") {
        updateRectangleSelection(canvasCoords);
        return;
      }

      // Lasso tool — draw freehand path
      if (lassoDrawing) {
        appendLassoPoint(canvasCoords);
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
        const dragStart = dragStartRef.current;
        const dragOrigin = dragLayerOriginRef.current;
        if (!dragStart || !dragOrigin) return;

        const dx = coords.x - dragStart.x;
        const dy = coords.y - dragStart.y;
        updateLayerSilent(activeLayerId, {
          x: dragOrigin.x + dx,
          y: dragOrigin.y + dy,
        });
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
      cropStart,
      gradientStart,
      showCropConfirm,
      updateCropRect,
      updateRectangleSelection,
      appendLassoPoint,
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
        const raster = getLayerRasterSpace(layer);
        const canvas = document.createElement("canvas");
        canvas.width = raster.width;
        canvas.height = raster.height;
        const gctx = canvas.getContext("2d")!;
        gctx.imageSmoothingEnabled = true;
        gctx.imageSmoothingQuality = "high";

        // Draw existing layer content first
        if (layerHasImage(layer)) {
          const img = imageCache.get(layer.id);
          if (img && img.complete) {
            gctx.drawImage(img, 0, 0, raster.width, raster.height);
          }
        } else if (layer.type === "fill") {
          gctx.fillStyle = layer.fillColor || "#ffffff";
          gctx.fillRect(0, 0, raster.width, raster.height);
        }

        // Create and apply gradient
        const x0 = (gradientStart.x - layer.x) * raster.scaleX;
        const y0 = (gradientStart.y - layer.y) * raster.scaleY;
        const x1 = (gradientEnd.x - layer.x) * raster.scaleX;
        const y1 = (gradientEnd.y - layer.y) * raster.scaleY;
        let grad: CanvasGradient;
        if (gradientMode === "radial") {
          const radius = Math.hypot(x1 - x0, y1 - y0);
          grad = gctx.createRadialGradient(x0, y0, 0, x0, y0, Math.max(1, radius));
        } else {
          grad = gctx.createLinearGradient(x0, y0, x1, y1);
        }
        grad.addColorStop(0, brushColor);
        grad.addColorStop(1, gradientEndColor);
        // Respect active selection: apply gradient only inside selection bounds/path.
        const hasSelection =
          !!selection && selection.width > 0 && selection.height > 0;
        if (hasSelection) {
          gctx.save();
          gctx.beginPath();
          if (selection.path && selection.path.points.length > 2) {
            const [first, ...rest] = selection.path.points;
            gctx.moveTo(
              (first.x - layer.x) * raster.scaleX,
              (first.y - layer.y) * raster.scaleY,
            );
            for (const point of rest) {
              gctx.lineTo(
                (point.x - layer.x) * raster.scaleX,
                (point.y - layer.y) * raster.scaleY,
              );
            }
            gctx.closePath();
          } else {
            gctx.rect(
              (selection.x - layer.x) * raster.scaleX,
              (selection.y - layer.y) * raster.scaleY,
              selection.width * raster.scaleX,
              selection.height * raster.scaleY,
            );
          }
          gctx.clip();
        }

        gctx.fillStyle = grad;
        gctx.fillRect(0, 0, raster.width, raster.height);

        if (hasSelection) {
          gctx.restore();
        }

        updateLayerImage(layer.id, canvas.toDataURL("image/png"));
      }
      setGradientStart(null);
      setGradientEnd(null);
      return;
    }

    // Crop tool — show confirm overlay
    if (activeTool === "crop") {
      finalizeCropDrag();
      return;
    }

    // Lasso tool — finalize selection (before isPainting check since lasso reuses isPainting)
    if (lassoDrawing) {
      setIsPainting(false);
      finalizeLasso(setSelection);
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
    finalizeRectangleSelection(setSelection);
    dragStartRef.current = null;
    dragLayerOriginRef.current = null;
    setIsDragging(false);
  }, [isPanning, isPainting, setSelection, commitMask, transformHandle, lassoDrawing, activeTool, commitCloneStamp, commitBrushStroke, gradientStart, gradientEnd, brushColor, gradientEndColor, gradientMode, activeLayerId, layers, imageCache, selection, getLayerRasterSpace, finalizeCropDrag, finalizeLasso, finalizeRectangleSelection]);

  useWheelZoom({
    containerRef,
    canvasZoom,
    canvasOffset,
    setCanvasZoom,
    setCanvasOffset,
  });

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
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 bg-card/95 backdrop-blur-sm border border-primary/30 rounded-md px-3 py-2 text-xs flex items-center gap-3 z-20 shadow-lg"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="text-foreground">
            Crop to {Math.round(cropRect.w)} x {Math.round(cropRect.h)}?
          </span>
          <button
            onClick={() => {
              applyCrop(layers);
            }}
            className="px-3 py-1 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Apply
          </button>
          <button
            onClick={() => {
              cancelCrop();
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
