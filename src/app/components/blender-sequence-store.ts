import { create } from "zustand";

export type SequenceFramePreviewState = "idle" | "loading" | "ready" | "error";

export type BlenderSequenceTimelineFrame = BlenderSequenceFrameSummary & {
  previewState: SequenceFramePreviewState;
  dataUrl?: string;
  error?: string;
};

export type BlenderSequenceTimelineClip = Omit<BlenderSequenceMessage, "frames"> & {
  frames: BlenderSequenceTimelineFrame[];
};

type BlenderSequenceTimelineState = {
  clips: BlenderSequenceTimelineClip[];
  activeSequenceId: string | null;
  activeFrameIndex: number;
};

type BlenderSequenceTimelineActions = {
  upsertSequence: (message: BlenderSequenceMessage) => void;
  setSequences: (messages: BlenderSequenceMessage[]) => void;
  setActiveSequence: (sequenceId: string | null) => void;
  setActiveFrameIndex: (frameIndex: number) => void;
  setFrameLoading: (sequenceId: string, frameIndex: number) => void;
  setFrameData: (sequenceId: string, frameIndex: number, dataUrl: string) => void;
  setFrameError: (sequenceId: string, frameIndex: number, error: string) => void;
  clear: () => void;
};

export type BlenderSequenceTimelineStore = BlenderSequenceTimelineState & BlenderSequenceTimelineActions;

function normalizeClip(message: BlenderSequenceMessage): BlenderSequenceTimelineClip {
  return {
    ...message,
    frames: (message.frames || []).map((frame) => ({
      ...frame,
      previewState: "idle",
      dataUrl: undefined,
      error: undefined,
    })),
  };
}

function upsertClip(clips: BlenderSequenceTimelineClip[], message: BlenderSequenceMessage) {
  const normalized = normalizeClip(message);
  const existingIndex = clips.findIndex((clip) => clip.sequenceId === normalized.sequenceId);
  if (existingIndex >= 0) {
    const next = [...clips];
    next[existingIndex] = normalized;
    return next;
  }
  return [normalized, ...clips].slice(0, 8);
}

function clampFrameIndex(clip: BlenderSequenceTimelineClip | undefined, frameIndex: number) {
  if (!clip || !clip.frames.length) return 0;
  return Math.max(0, Math.min(frameIndex, clip.frames.length - 1));
}

export const useBlenderSequenceStore = create<BlenderSequenceTimelineStore>((set, get) => ({
  clips: [],
  activeSequenceId: null,
  activeFrameIndex: 0,

  upsertSequence: (message) => {
    set((state) => {
      const clips = upsertClip(state.clips, message);
      const activeSequenceId = state.activeSequenceId || message.sequenceId;
      const activeClip = clips.find((clip) => clip.sequenceId === activeSequenceId);
      return {
        clips,
        activeSequenceId,
        activeFrameIndex: clampFrameIndex(activeClip, state.activeFrameIndex),
      };
    });
  },

  setSequences: (messages) => {
    const clips = (messages || []).map(normalizeClip).slice(0, 8);
    const nextActiveId = clips.length ? clips[0].sequenceId : null;
    const activeClip = clips.find((clip) => clip.sequenceId === nextActiveId);
    set({
      clips,
      activeSequenceId: nextActiveId,
      activeFrameIndex: clampFrameIndex(activeClip, 0),
    });
  },

  setActiveSequence: (sequenceId) => {
    set((state) => {
      const activeClip = state.clips.find((clip) => clip.sequenceId === sequenceId);
      return {
        activeSequenceId: activeClip ? activeClip.sequenceId : null,
        activeFrameIndex: clampFrameIndex(activeClip, state.activeFrameIndex),
      };
    });
  },

  setActiveFrameIndex: (frameIndex) => {
    const { clips, activeSequenceId } = get();
    const activeClip = clips.find((clip) => clip.sequenceId === activeSequenceId);
    set({
      activeFrameIndex: clampFrameIndex(activeClip, frameIndex),
    });
  },

  setFrameLoading: (sequenceId, frameIndex) => {
    set((state) => ({
      clips: state.clips.map((clip) => {
        if (clip.sequenceId !== sequenceId) return clip;
        return {
          ...clip,
          frames: clip.frames.map((frame) =>
            frame.index === frameIndex
              ? { ...frame, previewState: "loading", error: undefined }
              : frame,
          ),
        };
      }),
    }));
  },

  setFrameData: (sequenceId, frameIndex, dataUrl) => {
    set((state) => ({
      clips: state.clips.map((clip) => {
        if (clip.sequenceId !== sequenceId) return clip;
        return {
          ...clip,
          frames: clip.frames.map((frame) =>
            frame.index === frameIndex
              ? { ...frame, previewState: "ready", dataUrl, error: undefined }
              : frame,
          ),
        };
      }),
    }));
  },

  setFrameError: (sequenceId, frameIndex, error) => {
    set((state) => ({
      clips: state.clips.map((clip) => {
        if (clip.sequenceId !== sequenceId) return clip;
        return {
          ...clip,
          frames: clip.frames.map((frame) =>
            frame.index === frameIndex
              ? { ...frame, previewState: "error", error }
              : frame,
          ),
        };
      }),
    }));
  },

  clear: () => {
    set({
      clips: [],
      activeSequenceId: null,
      activeFrameIndex: 0,
    });
  },
}));
