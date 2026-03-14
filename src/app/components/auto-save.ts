import { useEffect, useRef } from "react";
import { useEditor } from "./editor-store";
import { serializeProject, type ProjectFile } from "./project-io";

const AUTO_SAVE_KEY = "ai-canvas:auto-save:v1";
const AUTO_SAVE_INTERVAL_MS = 60_000;

interface AutoSavePayload {
  project: ProjectFile;
  savedAt: string;
}

export function getAutoSavedProject(): AutoSavePayload | null {
  try {
    const raw = localStorage.getItem(AUTO_SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AutoSavePayload;
    if (!parsed?.project?.canvas || !Array.isArray(parsed?.project?.layers)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearAutoSavedProject() {
  localStorage.removeItem(AUTO_SAVE_KEY);
}

export function useAutoSave() {
  const { layers, canvasWidth, canvasHeight, activeLayerId, selection } = useEditor();
  const latestStateRef = useRef({
    layers,
    canvasWidth,
    canvasHeight,
    activeLayerId,
    selection,
  });
  const projectNameRef = useRef("AI Canvas Project");

  useEffect(() => {
    latestStateRef.current = {
      layers,
      canvasWidth,
      canvasHeight,
      activeLayerId,
      selection,
    };
  }, [layers, canvasWidth, canvasHeight, activeLayerId, selection]);

  useEffect(() => {
    const onProjectName = (event: Event) => {
      const nextName = (event as CustomEvent<string>).detail;
      if (nextName && typeof nextName === "string") {
        projectNameRef.current = nextName;
      }
    };

    window.addEventListener("project-name-changed", onProjectName);
    return () => window.removeEventListener("project-name-changed", onProjectName);
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      try {
        const current = latestStateRef.current;
        const project = serializeProject(
          projectNameRef.current,
          current.layers,
          current.canvasWidth,
          current.canvasHeight,
          current.activeLayerId,
          current.selection,
        );
        const savedAt = new Date().toISOString();
        localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify({ project, savedAt }));
        console.log(`[AutoSave] Saved at ${savedAt}`);
      } catch (error) {
        console.error("[AutoSave] Failed to save project", error);
      }
    }, AUTO_SAVE_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, []);
}
