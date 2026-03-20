import { useCallback, useRef, useState, type MutableRefObject } from "react";
import type { Selection } from "../editor-store";
import { lassoPathToSelection } from "../selection-tools";

type Point = { x: number; y: number };

interface UseSelectionInteractionsResult {
  selectionStart: Point | null;
  currentSelection: Selection | null;
  lassoDrawing: boolean;
  lassoPointsRef: MutableRefObject<Point[]>;
  startRectangleSelection: (coords: Point) => void;
  updateRectangleSelection: (coords: Point) => void;
  finalizeRectangleSelection: (onSelect: (selection: Selection) => void) => void;
  startLasso: (coords: Point) => void;
  appendLassoPoint: (coords: Point) => void;
  finalizeLasso: (onSelect: (selection: Selection) => void) => void;
}

export function useSelectionInteractions(): UseSelectionInteractionsResult {
  const [selectionStart, setSelectionStart] = useState<Point | null>(null);
  const [currentSelection, setCurrentSelection] = useState<Selection | null>(
    null
  );
  const [lassoDrawing, setLassoDrawing] = useState(false);
  const lassoPointsRef = useRef<Point[]>([]);

  const startRectangleSelection = useCallback((coords: Point) => {
    setSelectionStart(coords);
    setCurrentSelection(null);
  }, []);

  const updateRectangleSelection = useCallback(
    (coords: Point) => {
      if (!selectionStart) return;
      const x = Math.min(selectionStart.x, coords.x);
      const y = Math.min(selectionStart.y, coords.y);
      const width = Math.abs(coords.x - selectionStart.x);
      const height = Math.abs(coords.y - selectionStart.y);
      setCurrentSelection({ x, y, width, height });
    },
    [selectionStart]
  );

  const finalizeRectangleSelection = useCallback(
    (onSelect: (selection: Selection) => void) => {
      if (selectionStart && currentSelection) {
        onSelect(currentSelection);
        setCurrentSelection(null);
      }
      setSelectionStart(null);
    },
    [currentSelection, selectionStart]
  );

  const startLasso = useCallback((coords: Point) => {
    lassoPointsRef.current = [coords];
    setLassoDrawing(true);
  }, []);

  const appendLassoPoint = useCallback((coords: Point) => {
    lassoPointsRef.current.push(coords);
  }, []);

  const finalizeLasso = useCallback((onSelect: (selection: Selection) => void) => {
    setLassoDrawing(false);
    const path = lassoPointsRef.current;
    if (path.length > 2) {
      const selection = lassoPathToSelection(path);
      if (selection) onSelect(selection);
    }
    lassoPointsRef.current = [];
  }, []);

  return {
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
  };
}
