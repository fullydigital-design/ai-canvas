import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useEditorStore, type Layer } from "./editor-store";
import { generateImageRef, imageCache } from "./image-cache";
import { useBlenderSequenceStore } from "./blender-sequence-store";

type StateMeta = {
  label: string;
  className: string;
};

const STATE_META: Record<BlenderIntegrationStatus, StateMeta> = {
  not_installed: {
    label: "Not installed",
    className: "text-amber-400",
  },
  ready: {
    label: "Ready",
    className: "text-primary",
  },
  launching: {
    label: "Launching",
    className: "text-sky-400",
  },
  embedded: {
    label: "Embedded",
    className: "text-emerald-400",
  },
  detached: {
    label: "Detached",
    className: "text-muted-foreground",
  },
  error: {
    label: "Error",
    className: "text-destructive",
  },
};

const DEFAULT_CAMERA_SNAPSHOT: BlenderCameraSnapshot = {
  name: "AI Canvas Snapshot",
  camera: null,
  frame: 1,
  lens: 50,
  location: [0, 0, 0],
  rotation_euler: [0, 0, 0],
  resolution: { width: 1024, height: 1024, percentage: 100 },
};

function toNumber(value: string, fallback: number) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return next;
}

function formatTimeMs(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function Blender3DPanel() {
  const hostRef = useRef<HTMLDivElement>(null);
  const lastSyncedBoundsKeyRef = useRef("");
  const [blenderPathInput, setBlenderPathInput] = useState("");
  const [processState, setProcessState] = useState<BlenderProcessState | null>(null);
  const [embedState, setEmbedState] = useState<BlenderEmbedState | null>(null);
  const [statusMessage, setStatusMessage] = useState("Set Blender executable path to continue.");
  const [validationResult, setValidationResult] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [isPathDirty, setIsPathDirty] = useState(false);
  const [cameraDraft, setCameraDraft] = useState<BlenderCameraSnapshot>(DEFAULT_CAMERA_SNAPSHOT);
  const [cameraBridgeState, setCameraBridgeState] = useState<{
    pendingSnapshot: BlenderCameraSnapshot | null;
    pendingUpdatedAt: string | null;
    pendingConsumedAt: string | null;
    lastCameraStatesAt: string | null;
    lastCameraStatesCount: number;
    lastCameraScene: string | null;
    lastCameraActive: string | null;
  } | null>(null);
  const [cameraStates, setCameraStates] = useState<BlenderCameraSnapshot[]>([]);
  const [cameraMessage, setCameraMessage] = useState("");
  const [sequenceMessage, setSequenceMessage] = useState("");
  const [bridgeState, setBridgeState] = useState<{
    running: boolean;
    host: string;
    port: number;
    lastError: string | null;
    importsCount: number;
    lastImportAt: string | null;
    lastImportId: string | null;
    lastPassCount?: number | null;
    lastPassTypes?: string[] | null;
    sequencesCount?: number | null;
    lastSequenceImportAt?: string | null;
    lastSequenceImportId?: string | null;
    lastSequenceFrameCount?: number | null;
  } | null>(null);
  const clips = useBlenderSequenceStore((state) => state.clips);
  const activeSequenceId = useBlenderSequenceStore((state) => state.activeSequenceId);
  const activeFrameIndex = useBlenderSequenceStore((state) => state.activeFrameIndex);
  const upsertSequence = useBlenderSequenceStore((state) => state.upsertSequence);
  const setSequences = useBlenderSequenceStore((state) => state.setSequences);
  const setActiveSequence = useBlenderSequenceStore((state) => state.setActiveSequence);
  const setActiveFrameIndex = useBlenderSequenceStore((state) => state.setActiveFrameIndex);
  const setFrameLoading = useBlenderSequenceStore((state) => state.setFrameLoading);
  const setFrameData = useBlenderSequenceStore((state) => state.setFrameData);
  const setFrameError = useBlenderSequenceStore((state) => state.setFrameError);
  const addLayer = useEditorStore((state) => state.addLayer);
  const setActiveLayerId = useEditorStore((state) => state.setActiveLayerId);
  const canvasWidth = useEditorStore((state) => state.canvasWidth);
  const canvasHeight = useEditorStore((state) => state.canvasHeight);

  const isElectron = !!window.electronAPI?.isElectron;
  const canRunSpike = isElectron && typeof window.electronAPI?.runBlenderEmbedSpike === "function";
  const canManageProcess =
    isElectron &&
    !!window.electronAPI?.blenderGetProcessState &&
    !!window.electronAPI?.blenderSetExecutablePath &&
    !!window.electronAPI?.blenderValidateExecutablePath &&
    !!window.electronAPI?.blenderStartProcess &&
    !!window.electronAPI?.blenderStopProcess &&
    !!window.electronAPI?.blenderRestartProcess;
  const canEmbed =
    isElectron &&
    !!window.electronAPI?.blenderGetEmbedState &&
    !!window.electronAPI?.blenderAttachEmbed &&
    !!window.electronAPI?.blenderSyncEmbedBounds &&
    !!window.electronAPI?.blenderFocusEmbed &&
    !!window.electronAPI?.blenderDetachEmbed;
  const canBridgeState = isElectron && !!window.electronAPI?.blenderBridgeGetState;
  const canCameraRoundtrip =
    isElectron &&
    !!window.electronAPI?.blenderBridgeSetCameraSnapshot &&
    !!window.electronAPI?.blenderBridgeGetCameraState &&
    !!window.electronAPI?.onBlenderBridgeCameraStates;
  const canSequenceRoundtrip =
    isElectron &&
    !!window.electronAPI?.blenderBridgeGetSequences &&
    !!window.electronAPI?.blenderBridgeGetSequenceFrame &&
    !!window.electronAPI?.onBlenderBridgeSequence;

  const effectiveStatus = useMemo<BlenderIntegrationStatus>(() => {
    if (embedState?.embedded) return "embedded";
    return processState?.status || "not_installed";
  }, [embedState?.embedded, processState?.status]);

  const statusMeta = useMemo(() => STATE_META[effectiveStatus], [effectiveStatus]);
  const activeSequence = useMemo(
    () => clips.find((clip) => clip.sequenceId === activeSequenceId) || null,
    [clips, activeSequenceId],
  );
  const activeFrame = useMemo(() => {
    if (!activeSequence) return null;
    if (!activeSequence.frames.length) return null;
    const safeIndex = Math.max(0, Math.min(activeFrameIndex, activeSequence.frames.length - 1));
    return activeSequence.frames[safeIndex] || null;
  }, [activeFrameIndex, activeSequence]);

  const getHostBounds = useCallback(() => {
    const rect = hostRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const width = Math.max(64, Math.round(rect.width));
    const height = Math.max(64, Math.round(rect.height));
    return {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width,
      height,
    };
  }, []);

  const refreshProcessState = useCallback(async () => {
    if (!canManageProcess) return;
    const latest = await window.electronAPI!.blenderGetProcessState();
    setProcessState(latest);
    if (!isPathDirty) {
      setBlenderPathInput(latest.executablePath || "");
    }
    if (latest.status === "not_installed") {
      setStatusMessage("Set Blender executable path to continue.");
      return;
    }
    if (latest.status === "error") {
      setStatusMessage(latest.lastError || "Blender process manager reported an error.");
      return;
    }
    if (latest.isRunning) {
      setStatusMessage(
        embedState?.embedded
          ? "Blender is embedded in the 3D host area."
          : "Blender process is running in detached mode.",
      );
      return;
    }
    setStatusMessage("Blender process manager ready.");
  }, [canManageProcess, embedState?.embedded, isPathDirty]);

  const refreshEmbedState = useCallback(async () => {
    if (!canEmbed) return;
    const latest = await window.electronAPI!.blenderGetEmbedState();
    setEmbedState(latest);
  }, [canEmbed]);

  const refreshBridgeState = useCallback(async () => {
    if (!canBridgeState) return;
    const next = await window.electronAPI!.blenderBridgeGetState();
    setBridgeState(next);
  }, [canBridgeState]);

  const refreshCameraBridgeState = useCallback(async () => {
    if (!canCameraRoundtrip) return;
    const next = await window.electronAPI!.blenderBridgeGetCameraState();
    setCameraBridgeState(next);
  }, [canCameraRoundtrip]);

  const refreshSequenceSummaries = useCallback(async () => {
    if (!canSequenceRoundtrip) return;
    const response = await window.electronAPI!.blenderBridgeGetSequences();
    if (response?.ok) {
      setSequences(Array.isArray(response.sequences) ? response.sequences : []);
    }
  }, [canSequenceRoundtrip, setSequences]);

  useEffect(() => {
    if (!canManageProcess) {
      setStatusMessage("3D process manager is available only in Electron runtime.");
      return;
    }

    let disposed = false;
    void refreshProcessState();
    void refreshEmbedState();
    void refreshBridgeState();
    void refreshCameraBridgeState();
    void refreshSequenceSummaries();

    const timer = window.setInterval(() => {
      if (disposed) return;
      void refreshProcessState();
      void refreshEmbedState();
      void refreshBridgeState();
      void refreshCameraBridgeState();
      void refreshSequenceSummaries();
    }, 2000);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [
    canManageProcess,
    refreshBridgeState,
    refreshCameraBridgeState,
    refreshEmbedState,
    refreshProcessState,
    refreshSequenceSummaries,
  ]);

  useEffect(() => {
    if (!canCameraRoundtrip) return;
    const unsubscribe = window.electronAPI!.onBlenderBridgeCameraStates((payload) => {
      const states = Array.isArray(payload?.states) ? payload.states : [];
      setCameraStates(states);
      setCameraMessage(
        `Received ${states.length} camera state(s)${
          payload.scene ? ` from scene "${payload.scene}"` : ""
        }.`,
      );
      void refreshCameraBridgeState();
    });
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [canCameraRoundtrip, refreshCameraBridgeState]);

  useEffect(() => {
    if (!canSequenceRoundtrip) return;
    const unsubscribe = window.electronAPI!.onBlenderBridgeSequence((payload) => {
      if (!payload?.sequenceId) return;
      upsertSequence(payload);
      setActiveSequence(payload.sequenceId);
      setActiveFrameIndex(0);
      setSequenceMessage(
        `Imported sequence "${payload.sequenceName}" (${payload.frameCount} frames @ ${payload.fps} fps).`,
      );
      void refreshBridgeState();
    });
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [canSequenceRoundtrip, refreshBridgeState, setActiveFrameIndex, setActiveSequence, upsertSequence]);

  useEffect(() => {
    return () => {
      if (canEmbed) {
        void window.electronAPI!.blenderDetachEmbed();
      }
    };
  }, [canEmbed]);

  useEffect(() => {
    if (!canSequenceRoundtrip || !activeSequence || !activeFrame) return;
    if (activeFrame.previewState === "ready" || activeFrame.previewState === "loading") return;
    let cancelled = false;
    const loadFrame = async () => {
      setFrameLoading(activeSequence.sequenceId, activeFrame.index);
      try {
        const response = await window.electronAPI!.blenderBridgeGetSequenceFrame({
          sequenceId: activeSequence.sequenceId,
          frameIndex: activeFrame.index,
        });
        if (cancelled) return;
        if (!response?.ok || !response.frame?.dataUrl) {
          setFrameError(
            activeSequence.sequenceId,
            activeFrame.index,
            response?.error || "Failed to load sequence frame.",
          );
          return;
        }
        setFrameData(activeSequence.sequenceId, activeFrame.index, response.frame.dataUrl);
      } catch (error) {
        if (cancelled) return;
        setFrameError(
          activeSequence.sequenceId,
          activeFrame.index,
          error instanceof Error ? error.message : "Failed to load sequence frame.",
        );
      }
    };
    void loadFrame();
    return () => {
      cancelled = true;
    };
  }, [activeFrame, activeSequence, canSequenceRoundtrip, setFrameData, setFrameError, setFrameLoading]);

  const savePath = async () => {
    if (!canManageProcess) return;
    setIsBusy(true);
    try {
      const nextState = await window.electronAPI!.blenderSetExecutablePath(blenderPathInput.trim());
      setProcessState(nextState);
      setIsPathDirty(false);
      setValidationResult("");
      setStatusMessage(blenderPathInput.trim() ? "Blender path saved." : "Blender path cleared.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to save path.");
    } finally {
      setIsBusy(false);
    }
  };

  const clearPath = async () => {
    if (!canManageProcess) return;
    setIsBusy(true);
    try {
      setBlenderPathInput("");
      setIsPathDirty(false);
      setValidationResult("");
      const nextState = await window.electronAPI!.blenderSetExecutablePath("");
      setProcessState(nextState);
      await refreshEmbedState();
      setStatusMessage("Blender path cleared.");
    } finally {
      setIsBusy(false);
    }
  };

  const validatePath = async () => {
    if (!canManageProcess) return;
    setIsBusy(true);
    try {
      const response = await window.electronAPI!.blenderValidateExecutablePath(blenderPathInput.trim());
      if (!response.ok) {
        setValidationResult(`Validation failed: ${response.message}`);
        setStatusMessage(response.message);
        return;
      }
      setValidationResult(`Validation passed${response.version ? ` (${response.version})` : ""}.`);
      setStatusMessage("Blender executable validated.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Validation failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const startProcess = async () => {
    if (!canManageProcess) return;
    setIsBusy(true);
    setStatusMessage("Launching Blender...");
    try {
      const result = await window.electronAPI!.blenderStartProcess({
        path: blenderPathInput.trim() || undefined,
      });
      setProcessState(result.state);
      setEmbedState((prev) => (prev ? { ...prev, embedded: false, pid: null, bounds: null } : prev));
      setIsPathDirty(false);
      if (!result.ok) {
        setStatusMessage(result.error || "Failed to launch Blender.");
        return;
      }
      setStatusMessage(result.alreadyRunning ? "Blender is already running." : "Blender launched.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Launch failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const stopProcess = async () => {
    if (!canManageProcess) return;
    setIsBusy(true);
    setStatusMessage("Stopping Blender...");
    try {
      const result = await window.electronAPI!.blenderStopProcess();
      setProcessState(result.state);
      await refreshEmbedState();
      setStatusMessage(result.alreadyStopped ? "Blender is already stopped." : "Blender stopped.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Stop failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const restartProcess = async () => {
    if (!canManageProcess) return;
    setIsBusy(true);
    setStatusMessage("Restarting Blender...");
    try {
      const result = await window.electronAPI!.blenderRestartProcess();
      setProcessState(result.state);
      await refreshEmbedState();
      setStatusMessage(result.ok ? "Blender restarted." : result.error || "Restart failed.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Restart failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const attachEmbed = async () => {
    if (!canEmbed || !processState?.isRunning) {
      setStatusMessage("Start Blender process first, then attach.");
      return;
    }
    const bounds = getHostBounds();
    if (!bounds) {
      setStatusMessage("3D host bounds are not available yet.");
      return;
    }
    setIsBusy(true);
    setStatusMessage("Attaching Blender to 3D host...");
    try {
      const result = await window.electronAPI!.blenderAttachEmbed(bounds);
      setEmbedState(result.state);
      if (!result.ok) {
        setStatusMessage(result.error || "Attach failed.");
        return;
      }
      lastSyncedBoundsKeyRef.current = `${bounds.x}:${bounds.y}:${bounds.width}:${bounds.height}`;
      setStatusMessage("Blender attached to 3D host.");
      await refreshProcessState();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Attach failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const detachEmbed = async () => {
    if (!canEmbed) return;
    setIsBusy(true);
    setStatusMessage("Detaching Blender...");
    try {
      const result = await window.electronAPI!.blenderDetachEmbed();
      setEmbedState(result.state);
      setStatusMessage("Blender detached from host.");
      await refreshProcessState();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Detach failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const runEmbedSpike = async () => {
    if (!canRunSpike) return;
    setIsBusy(true);
    setStatusMessage("Running attach/detach spike...");
    try {
      const result = await window.electronAPI!.runBlenderEmbedSpike();
      if (!result.ok) {
        setStatusMessage(result.error || result.reason || "Spike failed.");
        return;
      }
      setStatusMessage("Spike completed successfully.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Spike failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const updateVectorField = (
    key: "location" | "rotation_euler",
    axis: 0 | 1 | 2,
    raw: string,
  ) => {
    setCameraDraft((prev) => {
      const current = prev[key] || [0, 0, 0];
      const next = [...current] as [number, number, number];
      next[axis] = toNumber(raw, current[axis] ?? 0);
      return { ...prev, [key]: next };
    });
  };

  const updateResolutionField = (key: "width" | "height" | "percentage", raw: string) => {
    setCameraDraft((prev) => {
      const current = prev.resolution || { width: 1024, height: 1024, percentage: 100 };
      const fallback = key === "percentage" ? current.percentage || 100 : current[key];
      const value = toNumber(raw, fallback || 0);
      return {
        ...prev,
        resolution: {
          ...current,
          [key]: Math.max(1, Math.round(value)),
        },
      };
    });
  };

  const sendCameraSnapshot = async () => {
    if (!canCameraRoundtrip) return;
    setIsBusy(true);
    setCameraMessage("Sending camera snapshot to bridge...");
    try {
      const payload: BlenderCameraSnapshot = {
        name: (cameraDraft.name || "AI Canvas Snapshot").trim() || "AI Canvas Snapshot",
        camera: cameraDraft.camera && cameraDraft.camera.trim() ? cameraDraft.camera.trim() : null,
        frame: cameraDraft.frame ?? null,
        lens: cameraDraft.lens ?? null,
        location: cameraDraft.location || null,
        rotation_euler: cameraDraft.rotation_euler || null,
        resolution: cameraDraft.resolution || null,
      };
      const response = await window.electronAPI!.blenderBridgeSetCameraSnapshot(payload);
      setCameraBridgeState((prev) => ({
        pendingSnapshot: response.pendingSnapshot,
        pendingUpdatedAt: response.pendingUpdatedAt,
        pendingConsumedAt: prev?.pendingConsumedAt || null,
        lastCameraStatesAt: prev?.lastCameraStatesAt || null,
        lastCameraStatesCount: prev?.lastCameraStatesCount || 0,
        lastCameraScene: prev?.lastCameraScene || null,
        lastCameraActive: prev?.lastCameraActive || null,
      }));
      setCameraMessage(`Snapshot "${response.pendingSnapshot.name}" queued for Blender add-on.`);
    } catch (error) {
      setCameraMessage(error instanceof Error ? error.message : "Failed to send camera snapshot.");
    } finally {
      setIsBusy(false);
    }
  };

  const loadCameraState = (state: BlenderCameraSnapshot) => {
    setCameraDraft({
      name: state.name || "Imported Camera",
      camera: state.camera || null,
      frame: state.frame ?? 1,
      lens: state.lens ?? 50,
      location: state.location || [0, 0, 0],
      rotation_euler: state.rotation_euler || [0, 0, 0],
      resolution: state.resolution || { width: 1024, height: 1024, percentage: 100 },
    });
    setCameraMessage(`Loaded camera state "${state.name}" into snapshot form.`);
  };

  const importCurrentSequenceFrame = async () => {
    if (!activeSequence || !activeFrame?.dataUrl) return;
    setIsBusy(true);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to decode sequence frame."));
        img.src = activeFrame.dataUrl!;
      });

      const imageRef = generateImageRef();
      await imageCache.put(activeFrame.dataUrl, imageRef);
      const imgAspect = img.width / img.height;
      let layerWidth = canvasWidth;
      let layerHeight = Math.round(layerWidth / imgAspect);
      if (layerHeight > canvasHeight) {
        layerHeight = canvasHeight;
        layerWidth = Math.round(layerHeight * imgAspect);
      }
      const x = Math.round((canvasWidth - layerWidth) / 2);
      const y = Math.round((canvasHeight - layerHeight) / 2);

      const layer: Layer = {
        id: `seq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: `${activeSequence.sequenceName} · Frame ${activeFrame.frame}`,
        visible: true,
        locked: false,
        opacity: 100,
        type: "image",
        blendMode: "normal",
        x,
        y,
        width: layerWidth,
        height: layerHeight,
        imageRef,
        sourceMetadata: {
          source: "blender-sequence",
          sequenceId: activeSequence.sequenceId,
          sequenceName: activeSequence.sequenceName,
          frame: activeFrame.frame,
          frameIndex: activeFrame.index,
          fps: activeSequence.fps,
        },
      };
      addLayer(layer);
      setActiveLayerId(layer.id);
      setSequenceMessage(`Imported frame ${activeFrame.frame} from "${activeSequence.sequenceName}" as a new layer.`);
    } catch (error) {
      setSequenceMessage(error instanceof Error ? error.message : "Failed to import sequence frame.");
    } finally {
      setIsBusy(false);
    }
  };

  useEffect(() => {
    if (!canEmbed || !embedState?.embedded) return;
    let disposed = false;

    const syncBounds = async () => {
      if (disposed) return;
      const bounds = getHostBounds();
      if (!bounds) return;
      const key = `${bounds.x}:${bounds.y}:${bounds.width}:${bounds.height}`;
      if (key === lastSyncedBoundsKeyRef.current) return;
      lastSyncedBoundsKeyRef.current = key;
      const result = await window.electronAPI!.blenderSyncEmbedBounds(bounds);
      setEmbedState(result.state);
      if (!result.ok && !disposed) {
        setStatusMessage(result.error || "Failed to sync embed bounds.");
      }
    };

    const onLayoutChange = () => {
      void syncBounds();
    };

    const observer = new ResizeObserver(() => {
      void syncBounds();
    });
    if (hostRef.current) {
      observer.observe(hostRef.current);
    }
    window.addEventListener("resize", onLayoutChange);
    window.addEventListener("scroll", onLayoutChange, true);

    const timer = window.setInterval(() => {
      void syncBounds();
    }, 600);

    void syncBounds();

    return () => {
      disposed = true;
      window.clearInterval(timer);
      observer.disconnect();
      window.removeEventListener("resize", onLayoutChange);
      window.removeEventListener("scroll", onLayoutChange, true);
    };
  }, [canEmbed, embedState?.embedded, getHostBounds]);

  return (
    <div className="h-full overflow-auto p-3 space-y-3">
      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground">3D Blender Bridge</h3>
          <span className={`text-xs ${statusMeta.className}`}>{statusMeta.label}</span>
        </div>

        <p className="text-xs text-muted-foreground">
          Phase 9d native embedding is active. Attach Blender into the host area below.
        </p>

        <div className="space-y-1.5">
          <label className="text-[11px] text-muted-foreground">Blender executable path</label>
          <input
            type="text"
            value={blenderPathInput}
            onChange={(e) => {
              setBlenderPathInput(e.target.value);
              setIsPathDirty(true);
            }}
            placeholder="C:\\Program Files\\Blender Foundation\\Blender 4.5\\blender.exe"
            className="w-full h-8 px-2 rounded border border-border bg-background text-xs outline-none focus:border-primary"
          />
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void savePath()}
              disabled={isBusy || !canManageProcess}
              className="h-7 px-2 rounded bg-primary text-primary-foreground text-xs hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Path
            </button>
            <button
              onClick={() => void clearPath()}
              disabled={isBusy || !canManageProcess}
              className="h-7 px-2 rounded border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Clear
            </button>
            <button
              onClick={() => void validatePath()}
              disabled={isBusy || !canManageProcess}
              className="h-7 px-2 rounded border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Validate
            </button>
          </div>
        </div>

        <div className="rounded-md border border-border bg-background/40 p-2 text-[11px] text-muted-foreground">
          Runtime: {isElectron ? "Electron" : "Web"} | Process manager:{" "}
          {canManageProcess ? "available" : "unavailable"} | Embed manager:{" "}
          {canEmbed ? "available" : "unavailable"} | Bridge server: {canBridgeState ? "available" : "unavailable"} | Sequence API:{" "}
          {canSequenceRoundtrip ? "available" : "unavailable"} | Spike API: {canRunSpike ? "available" : "unavailable"}
        </div>

        {bridgeState && (
          <div className="rounded-md border border-border bg-background/30 p-2 text-[11px] text-muted-foreground space-y-1">
            <div>
              Bridge endpoint: <span className="text-foreground">http://{bridgeState.host}:{bridgeState.port}</span>
            </div>
            <div>
              Status: {bridgeState.running ? "Running" : "Stopped"} | Imports: {bridgeState.importsCount}
            </div>
            <div>
              Last import: {bridgeState.lastImportId || "-"} {bridgeState.lastImportAt ? `(${new Date(bridgeState.lastImportAt).toLocaleTimeString()})` : ""}
            </div>
            {(typeof bridgeState.lastPassCount === "number" || bridgeState.lastPassTypes?.length) && (
              <div>
                Passes: {bridgeState.lastPassCount ?? "-"}{" "}
                {bridgeState.lastPassTypes?.length ? `(${bridgeState.lastPassTypes.join(", ")})` : ""}
              </div>
            )}
            {(typeof bridgeState.sequencesCount === "number" || bridgeState.lastSequenceImportId) && (
              <div>
                Sequences: {bridgeState.sequencesCount ?? "-"} | Last: {bridgeState.lastSequenceImportId || "-"}
                {bridgeState.lastSequenceFrameCount ? ` (${bridgeState.lastSequenceFrameCount} frames)` : ""}
              </div>
            )}
            {bridgeState.lastError && <div className="text-destructive">Bridge error: {bridgeState.lastError}</div>}
          </div>
        )}

        {validationResult && (
          <div className="rounded-md border border-border bg-background/40 p-2 text-[11px] text-muted-foreground">
            {validationResult}
          </div>
        )}

        {processState && (
          <div className="grid grid-cols-2 gap-1 text-[11px] text-muted-foreground rounded-md border border-border bg-background/20 p-2">
            <div>PID: {processState.pid ?? "-"}</div>
            <div>Running: {processState.isRunning ? "Yes" : "No"}</div>
            <div className="col-span-2 truncate">Version: {processState.version || "-"}</div>
            <div className="col-span-2">Updated: {new Date(processState.updatedAt).toLocaleTimeString()}</div>
            {processState.lastRecoveryNote && (
              <div className="col-span-2 text-amber-300">{processState.lastRecoveryNote}</div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void startProcess()}
            disabled={isBusy || !canManageProcess}
            className="h-7 px-2 rounded border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Start Blender
          </button>
          <button
            onClick={() => void stopProcess()}
            disabled={isBusy || !canManageProcess}
            className="h-7 px-2 rounded border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Stop Blender
          </button>
          <button
            onClick={() => void restartProcess()}
            disabled={isBusy || !canManageProcess}
            className="h-7 px-2 rounded border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Restart Blender
          </button>
          <button
            onClick={() => void attachEmbed()}
            disabled={isBusy || !canEmbed || !processState?.isRunning}
            className="h-7 px-2 rounded border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Attach Embed
          </button>
          <button
            onClick={() => void detachEmbed()}
            disabled={isBusy || !canEmbed}
            className="h-7 px-2 rounded border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Detach Embed
          </button>
          <button
            onClick={() => void runEmbedSpike()}
            disabled={isBusy || !canRunSpike}
            className="h-7 px-2 rounded border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isBusy ? "Working..." : "Run Spike"}
          </button>
        </div>

        <div className="flex items-start gap-2 text-xs">
          {effectiveStatus === "error" ? (
            <AlertCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
          ) : effectiveStatus === "launching" ? (
            <Loader2 className="w-3.5 h-3.5 text-sky-400 mt-0.5 animate-spin shrink-0" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
          )}
          <span className="text-muted-foreground">{statusMessage}</span>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Camera Roundtrip (Phase 9g)
        </h4>
        <div className="text-[11px] text-muted-foreground">
          Send a camera snapshot from AI Canvas to Blender add-on, then import named camera states back.
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground">Snapshot Name</label>
            <input
              value={cameraDraft.name}
              onChange={(e) => setCameraDraft((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full h-7 px-2 rounded border border-border bg-background text-xs outline-none focus:border-primary"
              placeholder="AI Canvas Snapshot"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground">Target Camera (optional)</label>
            <input
              value={cameraDraft.camera || ""}
              onChange={(e) => setCameraDraft((prev) => ({ ...prev, camera: e.target.value || null }))}
              className="w-full h-7 px-2 rounded border border-border bg-background text-xs outline-none focus:border-primary"
              placeholder="Camera.Main"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground">Frame</label>
            <input
              type="number"
              value={cameraDraft.frame ?? 1}
              onChange={(e) => setCameraDraft((prev) => ({ ...prev, frame: toNumber(e.target.value, prev.frame ?? 1) }))}
              className="w-full h-7 px-2 rounded border border-border bg-background text-xs outline-none focus:border-primary"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground">Lens (mm)</label>
            <input
              type="number"
              value={cameraDraft.lens ?? 50}
              onChange={(e) => setCameraDraft((prev) => ({ ...prev, lens: toNumber(e.target.value, prev.lens ?? 50) }))}
              className="w-full h-7 px-2 rounded border border-border bg-background text-xs outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {(["X", "Y", "Z"] as const).map((axis, idx) => (
            <div key={`loc-${axis}`} className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Loc {axis}</label>
              <input
                type="number"
                value={cameraDraft.location?.[idx] ?? 0}
                onChange={(e) => updateVectorField("location", idx as 0 | 1 | 2, e.target.value)}
                className="w-full h-7 px-2 rounded border border-border bg-background text-xs outline-none focus:border-primary"
              />
            </div>
          ))}
          {(["X", "Y", "Z"] as const).map((axis, idx) => (
            <div key={`rot-${axis}`} className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Rot {axis}</label>
              <input
                type="number"
                value={cameraDraft.rotation_euler?.[idx] ?? 0}
                onChange={(e) => updateVectorField("rotation_euler", idx as 0 | 1 | 2, e.target.value)}
                className="w-full h-7 px-2 rounded border border-border bg-background text-xs outline-none focus:border-primary"
              />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground">Res W</label>
            <input
              type="number"
              value={cameraDraft.resolution?.width ?? 1024}
              onChange={(e) => updateResolutionField("width", e.target.value)}
              className="w-full h-7 px-2 rounded border border-border bg-background text-xs outline-none focus:border-primary"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground">Res H</label>
            <input
              type="number"
              value={cameraDraft.resolution?.height ?? 1024}
              onChange={(e) => updateResolutionField("height", e.target.value)}
              className="w-full h-7 px-2 rounded border border-border bg-background text-xs outline-none focus:border-primary"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground">Res %</label>
            <input
              type="number"
              value={cameraDraft.resolution?.percentage ?? 100}
              onChange={(e) => updateResolutionField("percentage", e.target.value)}
              className="w-full h-7 px-2 rounded border border-border bg-background text-xs outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void sendCameraSnapshot()}
            disabled={isBusy || !canCameraRoundtrip}
            className="h-7 px-2 rounded bg-primary text-primary-foreground text-xs hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send Snapshot To Blender
          </button>
          <button
            onClick={() => void refreshCameraBridgeState()}
            disabled={isBusy || !canCameraRoundtrip}
            className="h-7 px-2 rounded border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Refresh Camera State
          </button>
        </div>

        {cameraBridgeState && (
          <div className="rounded-md border border-border bg-background/30 p-2 text-[11px] text-muted-foreground space-y-1">
            <div>
              Pending snapshot:{" "}
              <span className="text-foreground">
                {cameraBridgeState.pendingSnapshot?.name || "None"}
              </span>
            </div>
            <div>
              Pending updated: {cameraBridgeState.pendingUpdatedAt ? new Date(cameraBridgeState.pendingUpdatedAt).toLocaleTimeString() : "-"}
            </div>
            <div>
              Last consumed: {cameraBridgeState.pendingConsumedAt ? new Date(cameraBridgeState.pendingConsumedAt).toLocaleTimeString() : "-"}
            </div>
            <div>
              Last camera import: {cameraBridgeState.lastCameraStatesCount} state(s)
              {cameraBridgeState.lastCameraScene ? ` from ${cameraBridgeState.lastCameraScene}` : ""}
            </div>
          </div>
        )}

        {cameraMessage && (
          <div className="text-[11px] text-primary">{cameraMessage}</div>
        )}

        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Imported Camera States
          </div>
          {cameraStates.length === 0 ? (
            <div className="text-[11px] text-muted-foreground">No camera states received yet.</div>
          ) : (
            <div className="space-y-1 max-h-44 overflow-auto pr-1">
              {cameraStates.map((state, index) => (
                <div
                  key={`${state.name}-${index}`}
                  className="rounded border border-border px-2 py-1 flex items-center justify-between gap-2 text-[11px]"
                >
                  <div className="min-w-0">
                    <div className="text-foreground truncate">{state.name}</div>
                    <div className="text-muted-foreground truncate">
                      {state.camera || "No camera"} | Frame {state.frame ?? "-"} | Lens {state.lens ?? "-"}
                    </div>
                  </div>
                  <button
                    onClick={() => loadCameraState(state)}
                    className="h-6 px-2 rounded border border-border text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
                  >
                    Load
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Sequence Handoff (Phase 9h)
        </h4>
        <div className="text-[11px] text-muted-foreground">
          Imported Blender playblast/render sequences stay non-destructive and timeline-aware. Frames are loaded on demand.
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void refreshSequenceSummaries()}
            disabled={isBusy || !canSequenceRoundtrip}
            className="h-7 px-2 rounded border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Refresh Sequences
          </button>
          <button
            onClick={() => void importCurrentSequenceFrame()}
            disabled={isBusy || !activeSequence || !activeFrame?.dataUrl}
            className="h-7 px-2 rounded bg-primary text-primary-foreground text-xs hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Import Current Frame To Canvas
          </button>
        </div>

        {clips.length === 0 ? (
          <div className="text-[11px] text-muted-foreground">
            No sequence imported yet. In Blender add-on use "Send Sequence Frames".
          </div>
        ) : (
          <div className="space-y-2">
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Sequence</label>
              <select
                value={activeSequence?.sequenceId || ""}
                onChange={(e) => setActiveSequence(e.target.value || null)}
                className="w-full h-8 px-2 rounded border border-border bg-background text-xs outline-none focus:border-primary"
              >
                {clips.map((clip) => (
                  <option key={clip.sequenceId} value={clip.sequenceId}>
                    {clip.sequenceName} ({clip.frameCount}f @ {clip.fps}fps)
                  </option>
                ))}
              </select>
            </div>

            {activeSequence && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                  <div>Scene: {activeSequence.scene || "-"}</div>
                  <div>Camera: {activeSequence.camera || "-"}</div>
                  <div>Frame range: {activeSequence.startFrame} - {activeSequence.endFrame}</div>
                  <div>Received: {new Date(activeSequence.receivedAt).toLocaleTimeString()}</div>
                </div>

                {activeFrame && (
                  <>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setActiveFrameIndex(Math.max(0, activeFrameIndex - 1))}
                        disabled={activeFrameIndex <= 0}
                        className="h-7 px-2 rounded border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Prev
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={Math.max(0, activeSequence.frames.length - 1)}
                        value={activeFrameIndex}
                        onChange={(e) => setActiveFrameIndex(toNumber(e.target.value, 0))}
                        className="flex-1"
                      />
                      <button
                        onClick={() =>
                          setActiveFrameIndex(Math.min(activeSequence.frames.length - 1, activeFrameIndex + 1))
                        }
                        disabled={activeFrameIndex >= activeSequence.frames.length - 1}
                        className="h-7 px-2 rounded border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>

                    <div className="text-[11px] text-muted-foreground">
                      Frame {activeFrame.frame} (index {activeFrame.index + 1}/{activeSequence.frames.length}) ·{" "}
                      {formatTimeMs(activeFrame.timeMs)} · {activeFrame.label}
                    </div>

                    <div className="rounded border border-border bg-black/40 min-h-[180px] flex items-center justify-center overflow-hidden">
                      {activeFrame.previewState === "loading" && (
                        <div className="text-[11px] text-muted-foreground">Loading frame preview...</div>
                      )}
                      {activeFrame.previewState === "error" && (
                        <div className="text-[11px] text-destructive px-2 text-center">
                          {activeFrame.error || "Frame failed to load."}
                        </div>
                      )}
                      {activeFrame.previewState === "ready" && activeFrame.dataUrl && (
                        <img
                          src={activeFrame.dataUrl}
                          alt={`${activeSequence.sequenceName} frame ${activeFrame.frame}`}
                          className="max-h-[260px] w-auto object-contain"
                        />
                      )}
                      {activeFrame.previewState === "idle" && (
                        <div className="text-[11px] text-muted-foreground">Frame not loaded yet.</div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {sequenceMessage && (
          <div className="text-[11px] text-primary">{sequenceMessage}</div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground">Embedded 3D Host</h4>
        <div
          ref={hostRef}
          onMouseDown={() => {
            if (canEmbed && embedState?.embedded) {
              void window.electronAPI!.blenderFocusEmbed();
            }
          }}
          className="relative h-[360px] rounded-md border border-border bg-black/65 overflow-hidden"
        >
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-2 left-2 text-[10px] px-1.5 py-1 rounded bg-black/60 text-muted-foreground">
              {embedState?.embedded ? "Blender embedded (live window)" : "Host waiting for Blender attach"}
            </div>
          </div>
        </div>
        <div className="text-[11px] text-muted-foreground">
          Click inside host area to focus Blender when embedded. Bounds auto-sync on resize and layout changes.
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground">State Model</h4>
        <div className="grid grid-cols-2 gap-1 text-xs">
          {Object.entries(STATE_META).map(([key, meta]) => (
            <div key={key} className="rounded border border-border px-2 py-1 flex justify-between items-center">
              <span className="text-muted-foreground">{key}</span>
              <span className={meta.className}>{meta.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
