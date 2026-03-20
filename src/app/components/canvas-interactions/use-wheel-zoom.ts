import { RefObject, useCallback, useEffect } from "react";

type Point = { x: number; y: number };

interface UseWheelZoomParams {
  containerRef: RefObject<HTMLDivElement>;
  canvasZoom: number;
  canvasOffset: Point;
  setCanvasZoom: (zoom: number) => void;
  setCanvasOffset: (offset: Point) => void;
}

export function useWheelZoom({
  containerRef,
  canvasZoom,
  canvasOffset,
  setCanvasZoom,
  setCanvasOffset,
}: UseWheelZoomParams) {
  const handleWheelZoom = useCallback(
    (clientX: number, clientY: number, deltaY: number) => {
      const delta = deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.1, Math.min(10, canvasZoom * delta));
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const mouseX = clientX - rect.left;
        const mouseY = clientY - rect.top;
        const newOffsetX =
          mouseX - (mouseX - canvasOffset.x) * (newZoom / canvasZoom);
        const newOffsetY =
          mouseY - (mouseY - canvasOffset.y) * (newZoom / canvasZoom);
        setCanvasOffset({ x: newOffsetX, y: newOffsetY });
      }
      setCanvasZoom(newZoom);
    },
    [canvasZoom, canvasOffset, containerRef, setCanvasZoom, setCanvasOffset]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      if (e.cancelable) e.preventDefault();
      handleWheelZoom(e.clientX, e.clientY, e.deltaY);
    };

    container.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", onWheel);
    };
  }, [containerRef, handleWheelZoom]);
}
