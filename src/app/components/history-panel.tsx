/**
 * History Panel — visual representation of the undo/redo stack.
 * Shows a list of actions the user can navigate through.
 * Click any entry to jump to that point in history.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import {
  History,
  Undo2,
  Redo2,
  Trash2,
  ChevronRight,
  CircleDot,
} from "lucide-react";
import { useEditor } from "./editor-store";

interface HistoryEntry {
  id: number;
  label: string;
  timestamp: number;
  layerCount: number;
  /** The index in the editor store's internal history stack that this entry maps to */
  historyStackIndex: number;
}

export function HistoryPanel() {
  const {
    layers,
    canUndo,
    canRedo,
    undo,
    redo,
    historyIndex,
    historyLength,
    jumpToHistory,
  } = useEditor();

  const [entries, setEntries] = useState<HistoryEntry[]>([
    {
      id: 0,
      label: "Initial State",
      timestamp: Date.now(),
      layerCount: 1,
      historyStackIndex: 0,
    },
  ]);
  const [currentEntryIdx, setCurrentEntryIdx] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Track layer changes to auto-generate history descriptions
  const prevLayerRef = useState({ count: 1, names: ["Background"] })[0];
  const prevHistoryIndexRef = useRef(0);

  const detectChange = useCallback(() => {
    const count = layers.length;
    const names = layers.map((l) => l.name);
    let label = "Edit";

    if (count > prevLayerRef.count) {
      const newNames = names.filter((n) => !prevLayerRef.names.includes(n));
      label = newNames.length > 0 ? `Add: ${newNames[0]}` : "Add Layer";
    } else if (count < prevLayerRef.count) {
      const removed = prevLayerRef.names.filter((n) => !names.includes(n));
      label = removed.length > 0 ? `Delete: ${removed[0]}` : "Delete Layer";
    } else {
      // Same count — check for modifications
      for (let i = 0; i < layers.length; i++) {
        const l = layers[i];
        if (l.imageData && !prevLayerRef.names.includes("__img_" + l.id)) {
          label = `Paint: ${l.name}`;
          break;
        }
      }
      // Could be opacity, blend mode, position, etc.
      if (label === "Edit") {
        label = "Modify Layer";
      }
    }

    prevLayerRef.count = count;
    prevLayerRef.names = [...names];

    return label;
  }, [layers, prevLayerRef]);

  // Watch for layer state changes and sync with the real history stack
  useEffect(() => {
    const label = detectChange();
    const currentHIdx = historyIndex;
    const wasNavigation = currentHIdx !== prevHistoryIndexRef.current;
    prevHistoryIndexRef.current = currentHIdx;

    // If user navigated (undo/redo/jump), find and highlight the matching entry
    if (wasNavigation) {
      // Find entry matching this history index
      const matchIdx = entries.findIndex(
        (e) => e.historyStackIndex === currentHIdx
      );
      if (matchIdx >= 0) {
        setCurrentEntryIdx(matchIdx);
        return;
      }
      // If no matching entry (navigation to a state with no entry), fall through to add one
    }

    setEntries((prev) => {
      // Only add if something actually changed
      const last = prev[prev.length - 1];
      if (
        last &&
        last.layerCount === layers.length &&
        label === "Modify Layer"
      ) {
        // Debounce rapid edits — update last entry instead
        const timeDiff = Date.now() - last.timestamp;
        if (timeDiff < 300) {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...last,
            timestamp: Date.now(),
            historyStackIndex: currentHIdx,
          };
          return updated;
        }
      }

      const newEntry: HistoryEntry = {
        id: Date.now(),
        label,
        timestamp: Date.now(),
        layerCount: layers.length,
        historyStackIndex: currentHIdx,
      };

      // If we navigated back and then made a new edit, truncate future entries
      const insertIdx = prev.findIndex(
        (e) => e.historyStackIndex > currentHIdx
      );
      let next: HistoryEntry[];
      if (insertIdx >= 0) {
        next = [...prev.slice(0, insertIdx), newEntry];
      } else {
        next = [...prev, newEntry];
      }
      // Keep max 50 entries visible
      if (next.length > 50) next.shift();
      setCurrentEntryIdx(next.length - 1);
      return next;
    });
  }, [layers, historyIndex]);

  // Auto-scroll to current entry
  useEffect(() => {
    if (scrollRef.current) {
      const items = scrollRef.current.children;
      if (items[currentEntryIdx]) {
        (items[currentEntryIdx] as HTMLElement).scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        });
      }
    }
  }, [currentEntryIdx]);

  const handleEntryClick = useCallback(
    (entry: HistoryEntry, idx: number) => {
      if (idx === currentEntryIdx) return;
      jumpToHistory(entry.historyStackIndex);
      setCurrentEntryIdx(idx);
    },
    [currentEntryIdx, jumpToHistory]
  );

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <History className="w-3.5 h-3.5" />
          <span className="text-xs uppercase tracking-wider">History</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={undo}
            disabled={!canUndo}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
            title="Redo (Ctrl+Y)"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              setEntries([
                {
                  id: Date.now(),
                  label: "History Cleared",
                  timestamp: Date.now(),
                  layerCount: layers.length,
                  historyStackIndex: historyIndex,
                },
              ]);
              setCurrentEntryIdx(0);
            }}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-destructive transition-colors"
            title="Clear history display"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* History list */}
      <div className="flex-1 overflow-y-auto" ref={scrollRef}>
        {entries.map((entry, index) => {
          const isCurrent = index === currentEntryIdx;
          const isPast = index < currentEntryIdx;
          const isFuture = index > currentEntryIdx;

          return (
            <div
              key={entry.id}
              onClick={() => handleEntryClick(entry, index)}
              className={`flex items-center gap-2 px-3 py-1.5 border-b border-border/30 transition-colors select-none ${
                isCurrent
                  ? "bg-primary/10 border-l-2 border-l-primary cursor-default"
                  : isPast
                  ? "opacity-70 hover:bg-accent/30 cursor-pointer"
                  : "opacity-40 hover:bg-accent/20 cursor-pointer"
              }`}
              title={
                isCurrent
                  ? "Current state"
                  : `Click to jump to "${entry.label}"`
              }
            >
              <div className="shrink-0">
                {isCurrent ? (
                  <CircleDot className="w-3 h-3 text-primary" />
                ) : (
                  <ChevronRight
                    className={`w-3 h-3 ${
                      isFuture
                        ? "text-muted-foreground/30"
                        : "text-muted-foreground/50"
                    }`}
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs truncate">{entry.label}</div>
                <div className="text-[9px] text-muted-foreground/60">
                  {formatTime(entry.timestamp)}
                </div>
              </div>
              <div className="text-[9px] text-muted-foreground/50 shrink-0">
                {entry.layerCount}L
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer stats */}
      <div className="px-3 py-1.5 border-t border-border text-[10px] text-muted-foreground flex items-center justify-between">
        <span>
          {entries.length} entries | {historyLength} snapshots
        </span>
        <span>Click to jump</span>
      </div>
    </div>
  );
}
