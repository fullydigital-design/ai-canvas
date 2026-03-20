/**
 * Project save/load — serializes the full editor state to a .aicproj JSON file
 * and restores it back. Image data is embedded as base64 data URLs.
 */
import type { Layer, Selection, LayerSourceMetadata } from "./editor-store";
import { getLayerImageDataUrl, getLayerMaskDataUrl } from "./editor-store";
import { imageCache as globalImageCache, generateImageRef } from "./image-cache";

const PROJECT_VERSION = 1;
const FILE_EXTENSION = ".aicproj";

export interface ProjectFile {
  version: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  canvas: {
    width: number;
    height: number;
  };
  layers: Layer[];
  activeLayerId: string | null;
  selection: Selection | null;
}

// ─── Save ──────────────────────────────────────────────────────────

export function serializeProject(
  name: string,
  layers: Layer[],
  canvasWidth: number,
  canvasHeight: number,
  activeLayerId: string | null,
  selection: Selection | null,
): ProjectFile {
  // Materialize cache refs back to inline base64 for portable JSON
  const serializedLayers = layers.map((l) => {
    const copy: any = { ...l };
    // Resolve imageRef → imageData for the file
    const imgUrl = getLayerImageDataUrl(l);
    if (imgUrl) copy.imageData = imgUrl;
    delete copy.imageRef;
    // Resolve maskRef → maskData for the file
    const maskUrl = getLayerMaskDataUrl(l);
    if (maskUrl) copy.maskData = maskUrl;
    delete copy.maskRef;
    return copy as Layer;
  });

  return {
    version: PROJECT_VERSION,
    name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    canvas: { width: canvasWidth, height: canvasHeight },
    layers: serializedLayers,
    activeLayerId,
    selection,
  };
}

export function downloadProject(project: ProjectFile) {
  const json = JSON.stringify(project);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitizeFilename(project.name)}${FILE_EXTENSION}`;
  a.click();
  URL.revokeObjectURL(url);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-. ]/g, "_").slice(0, 64) || "untitled";
}

// ─── Load ──────────────────────────────────────────────────────────

export function loadProjectFromFile(): Promise<ProjectFile> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = FILE_EXTENSION + ",.json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        reject(new Error("No file selected"));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const text = reader.result as string;
          const project = parseProjectJson(text);
          resolve(project);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsText(file);
    };
    // Handle cancel
    input.addEventListener("cancel", () => reject(new Error("Cancelled")));
    input.click();
  });
}

function parseProjectJson(text: string): ProjectFile {
  const data = JSON.parse(text);

  if (!data.version || !data.layers || !data.canvas) {
    throw new Error("Invalid project file format");
  }

  if (data.version > PROJECT_VERSION) {
    throw new Error(
      `Project version ${data.version} is newer than supported (${PROJECT_VERSION})`
    );
  }

  // Validate layers and populate image cache from inline base64
  const layers: Layer[] = data.layers.map((l: any) => {
    let imageRef: string | undefined;
    if (l.imageData) {
      imageRef = generateImageRef();
      globalImageCache.putSync(l.imageData, imageRef);
    }
    let maskRef: string | undefined;
    if (l.maskData) {
      maskRef = generateImageRef();
      globalImageCache.putSync(l.maskData, maskRef);
    }
    const metadataEntries: [string, string | number | boolean | null][] =
      l.sourceMetadata && typeof l.sourceMetadata === "object" && !Array.isArray(l.sourceMetadata)
        ? (Object.entries(l.sourceMetadata).flatMap(([key, value]) =>
            value === null || ["string", "number", "boolean"].includes(typeof value)
              ? [[key, value as string | number | boolean | null]]
              : []
          ) as [string, string | number | boolean | null][])
        : [];
    const metadata: LayerSourceMetadata | undefined = metadataEntries.length
      ? (Object.fromEntries(metadataEntries) as LayerSourceMetadata)
      : undefined;
    const passType =
      typeof l.blenderPassType === "string" &&
      ["beauty", "depth", "normal", "albedo", "object_id", "material_id", "custom"].includes(l.blenderPassType)
        ? (l.blenderPassType as Layer["blenderPassType"])
        : undefined;

    return {
      id: l.id || `layer-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: l.name || "Untitled",
      visible: l.visible ?? true,
      locked: l.locked ?? false,
      opacity: l.opacity ?? 100,
      type: l.type || "fill",
      imageRef,
      blendMode: l.blendMode || "normal",
      x: l.x ?? 0,
      y: l.y ?? 0,
      width: l.width ?? data.canvas.width,
      height: l.height ?? data.canvas.height,
      maskRef,
      maskEnabled: l.maskEnabled ?? undefined,
      fillColor: l.fillColor || undefined,
      adjustments: l.adjustments || undefined,
      // Text layer properties
      textContent: l.textContent || undefined,
      textFont: l.textFont || undefined,
      textSize: l.textSize ?? undefined,
      textColor: l.textColor || undefined,
      textAlign: l.textAlign || undefined,
      textBold: l.textBold ?? undefined,
      textItalic: l.textItalic ?? undefined,
      textLineHeight: l.textLineHeight ?? undefined,
      blenderImportId: typeof l.blenderImportId === "string" ? l.blenderImportId : undefined,
      blenderGroupId: typeof l.blenderGroupId === "string" ? l.blenderGroupId : undefined,
      blenderGroupName: typeof l.blenderGroupName === "string" ? l.blenderGroupName : undefined,
      blenderPassType: passType,
      sourceMetadata: metadata,
    };
  });

  return {
    version: data.version,
    name: data.name || "Untitled",
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: data.updatedAt || new Date().toISOString(),
    canvas: {
      width: data.canvas.width || 1024,
      height: data.canvas.height || 1024,
    },
    layers,
    activeLayerId: data.activeLayerId || null,
    selection: data.selection || null,
  };
}
