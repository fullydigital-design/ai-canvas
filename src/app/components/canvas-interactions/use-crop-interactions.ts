import { useCallback, useState } from "react";
import type { Layer } from "../editor-store";

type Point = { x: number; y: number };
export type CropRect = { x: number; y: number; w: number; h: number };

interface UseCropInteractionsParams {
  cropAspectRatio: number | null;
  setLayers: (layers: Layer[]) => void;
  setCanvasDimensions: (width: number, height: number) => void;
}

interface UseCropInteractionsResult {
  cropRect: CropRect | null;
  cropStart: Point | null;
  showCropConfirm: boolean;
  beginCrop: (coords: Point) => void;
  updateCropRect: (coords: Point) => void;
  finalizeCropDrag: () => boolean;
  applyCrop: (layers: Layer[]) => boolean;
  cancelCrop: () => void;
}

const MIN_CROP_SIZE = 4;

export function useCropInteractions({
  cropAspectRatio,
  setLayers,
  setCanvasDimensions,
}: UseCropInteractionsParams): UseCropInteractionsResult {
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [cropStart, setCropStart] = useState<Point | null>(null);
  const [showCropConfirm, setShowCropConfirm] = useState(false);

  const beginCrop = useCallback((coords: Point) => {
    setCropStart(coords);
    setCropRect(null);
    setShowCropConfirm(false);
  }, []);

  const updateCropRect = useCallback(
    (coords: Point) => {
      if (!cropStart) return;

      let w = Math.abs(coords.x - cropStart.x);
      let h = Math.abs(coords.y - cropStart.y);
      if (cropAspectRatio !== null && cropAspectRatio > 0) {
        if (w / cropAspectRatio > h) {
          h = w / cropAspectRatio;
        } else {
          w = h * cropAspectRatio;
        }
      }

      const x = coords.x >= cropStart.x ? cropStart.x : cropStart.x - w;
      const y = coords.y >= cropStart.y ? cropStart.y : cropStart.y - h;
      setCropRect({ x, y, w, h });
    },
    [cropAspectRatio, cropStart]
  );

  const finalizeCropDrag = useCallback(() => {
    if (
      cropStart &&
      cropRect &&
      cropRect.w > MIN_CROP_SIZE &&
      cropRect.h > MIN_CROP_SIZE
    ) {
      setCropStart(null);
      setShowCropConfirm(true);
      return true;
    }

    setCropStart(null);
    return false;
  }, [cropRect, cropStart]);

  const applyCrop = useCallback(
    (layers: Layer[]) => {
      if (
        !cropRect ||
        cropRect.w <= MIN_CROP_SIZE ||
        cropRect.h <= MIN_CROP_SIZE
      ) {
        return false;
      }

      const cx = Math.round(cropRect.x);
      const cy = Math.round(cropRect.y);
      const cw = Math.round(cropRect.w);
      const ch = Math.round(cropRect.h);

      if (cw <= MIN_CROP_SIZE || ch <= MIN_CROP_SIZE) {
        return false;
      }

      const newLayers = layers.map((l) => ({
        ...l,
        x: l.x - cx,
        y: l.y - cy,
        ...(l.id === "bg-1" && l.type === "fill"
          ? { x: 0, y: 0, width: cw, height: ch }
          : {}),
      }));

      setLayers(newLayers);
      setCanvasDimensions(cw, ch);
      setCropRect(null);
      setShowCropConfirm(false);
      return true;
    },
    [cropRect, setCanvasDimensions, setLayers]
  );

  const cancelCrop = useCallback(() => {
    setCropStart(null);
    setCropRect(null);
    setShowCropConfirm(false);
  }, []);

  return {
    cropRect,
    cropStart,
    showCropConfirm,
    beginCrop,
    updateCropRect,
    finalizeCropDrag,
    applyCrop,
    cancelCrop,
  };
}
