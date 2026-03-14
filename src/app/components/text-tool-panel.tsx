/**
 * Text Tool Panel — appears in the toolbar area when the text tool is active.
 * Allows creating and editing text layers with font, size, color, alignment.
 */
import { useState } from "react";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  Plus,
  Type,
} from "lucide-react";
import { useEditor, type Layer } from "./editor-store";

const FONT_OPTIONS = [
  "Inter",
  "Arial",
  "Helvetica",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Verdana",
  "Trebuchet MS",
  "Impact",
  "Comic Sans MS",
  "Palatino",
  "Garamond",
  "Bookman",
  "monospace",
  "sans-serif",
  "serif",
];

export function TextToolPanel() {
  const {
    layers,
    activeLayerId,
    updateLayer,
    addLayer,
    canvasWidth,
    canvasHeight,
    selection,
    brushColor,
  } = useEditor();

  const [newText, setNewText] = useState("Type here...");

  const activeLayer = layers.find((l) => l.id === activeLayerId);
  const isTextLayer = activeLayer?.type === "text";

  const createTextLayer = () => {
    const layer: Layer = {
      id: `text-${Date.now()}`,
      name: `Text: ${newText.slice(0, 15)}`,
      visible: true,
      locked: false,
      opacity: 100,
      type: "text",
      blendMode: "normal",
      x: selection?.x ?? Math.round(canvasWidth / 2 - 150),
      y: selection?.y ?? Math.round(canvasHeight / 2 - 30),
      width: selection?.width || 300,
      height: selection?.height || 60,
      textContent: newText,
      textFont: "Inter",
      textSize: 32,
      textColor: brushColor || "#000000",
      textAlign: "left",
      textBold: false,
      textItalic: false,
      textLineHeight: 1.4,
    };
    addLayer(layer);
    setNewText("Type here...");
  };

  return (
    <div className="space-y-2">
      {/* Create new text layer */}
      <div className="space-y-1.5">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          New Text
        </div>
        <textarea
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          rows={2}
          className="w-full bg-secondary text-foreground text-xs rounded-md px-2 py-1.5 border border-border focus:border-primary focus:outline-none resize-none"
          placeholder="Enter text..."
        />
        <button
          onClick={createTextLayer}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 text-xs transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add Text Layer
        </button>
      </div>

      {/* Edit selected text layer */}
      {isTextLayer && (
        <div className="space-y-2 border-t border-border pt-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Edit Text Layer
          </div>

          {/* Content */}
          <textarea
            value={activeLayer.textContent || ""}
            onChange={(e) =>
              updateLayer(activeLayerId!, { textContent: e.target.value })
            }
            rows={3}
            className="w-full bg-secondary text-foreground text-xs rounded-md px-2 py-1.5 border border-border focus:border-primary focus:outline-none resize-none"
          />

          {/* Font family */}
          <select
            value={activeLayer.textFont || "Inter"}
            onChange={(e) =>
              updateLayer(activeLayerId!, { textFont: e.target.value })
            }
            className="w-full bg-secondary text-foreground text-xs rounded-md px-2 py-1 border border-border"
            style={{ fontFamily: activeLayer.textFont || "Inter" }}
          >
            {FONT_OPTIONS.map((font) => (
              <option key={font} value={font} style={{ fontFamily: font }}>
                {font}
              </option>
            ))}
          </select>

          {/* Size + Color row */}
          <div className="flex gap-1.5">
            <div className="flex-1">
              <label className="text-[10px] text-muted-foreground">Size</label>
              <input
                type="number"
                min={8}
                max={400}
                value={activeLayer.textSize || 32}
                onChange={(e) =>
                  updateLayer(activeLayerId!, {
                    textSize: Math.max(8, Number(e.target.value)),
                  })
                }
                className="w-full bg-secondary text-foreground text-xs rounded-md px-2 py-1 border border-border"
              />
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-muted-foreground">Line Height</label>
              <input
                type="number"
                min={0.8}
                max={3}
                step={0.1}
                value={activeLayer.textLineHeight || 1.4}
                onChange={(e) =>
                  updateLayer(activeLayerId!, {
                    textLineHeight: Number(e.target.value),
                  })
                }
                className="w-full bg-secondary text-foreground text-xs rounded-md px-2 py-1 border border-border"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Color</label>
              <input
                type="color"
                value={activeLayer.textColor || "#000000"}
                onChange={(e) =>
                  updateLayer(activeLayerId!, { textColor: e.target.value })
                }
                className="w-8 h-7 rounded border border-border cursor-pointer bg-secondary"
              />
            </div>
          </div>

          {/* Alignment + Bold/Italic */}
          <div className="flex gap-1">
            {(["left", "center", "right"] as const).map((align) => {
              const Icon =
                align === "left"
                  ? AlignLeft
                  : align === "center"
                  ? AlignCenter
                  : AlignRight;
              return (
                <button
                  key={align}
                  onClick={() => updateLayer(activeLayerId!, { textAlign: align })}
                  className={`flex-1 flex items-center justify-center py-1.5 rounded-md border transition-colors ${
                    activeLayer.textAlign === align
                      ? "bg-primary/15 border-primary/30 text-primary"
                      : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                </button>
              );
            })}
            <button
              onClick={() =>
                updateLayer(activeLayerId!, { textBold: !activeLayer.textBold })
              }
              className={`flex-1 flex items-center justify-center py-1.5 rounded-md border transition-colors ${
                activeLayer.textBold
                  ? "bg-primary/15 border-primary/30 text-primary"
                  : "bg-secondary border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() =>
                updateLayer(activeLayerId!, {
                  textItalic: !activeLayer.textItalic,
                })
              }
              className={`flex-1 flex items-center justify-center py-1.5 rounded-md border transition-colors ${
                activeLayer.textItalic
                  ? "bg-primary/15 border-primary/30 text-primary"
                  : "bg-secondary border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <Italic className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
