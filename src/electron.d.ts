export {};

declare global {
  type BlenderPassType =
    | 'beauty'
    | 'depth'
    | 'normal'
    | 'albedo'
    | 'object_id'
    | 'material_id'
    | 'custom';

  type BlenderIntegrationStatus =
    | 'not_installed'
    | 'ready'
    | 'launching'
    | 'embedded'
    | 'detached'
    | 'error';

  type BlenderProcessState = {
    status: BlenderIntegrationStatus;
    executablePath: string;
    isRunning: boolean;
    pid: number | null;
    version: string | null;
    lastError: string | null;
    lastExitCode: number | null;
    lastExitSignal: string | null;
    startedAt: string | null;
    lastRecoveryNote?: string | null;
    updatedAt: string;
  };

  type BlenderEmbedState = {
    embedded: boolean;
    pid: number | null;
    bounds: {
      x: number;
      y: number;
      width: number;
      height: number;
    } | null;
    lastError: string | null;
    updatedAt: string;
  };

  type BlenderBridgePassPayload = {
    passType: BlenderPassType;
    name: string;
    dataUrl: string;
  };

  type BlenderBridgeImportMetadata = {
    scene?: string;
    camera?: string;
    frame?: number;
    width?: number;
    height?: number;
    resolution?: {
      width: number;
      height: number;
      percentage?: number;
    };
    engine?: string;
    seed?: number | string;
    [key: string]: unknown;
  };

  type BlenderBridgeImportMessage = {
    importId: string;
    passSetId?: string;
    source: string;
    kind: string;
    layerName: string | null;
    groupName?: string | null;
    dataUrl: string;
    passes?: BlenderBridgePassPayload[];
    metadata: BlenderBridgeImportMetadata;
    receivedAt: string;
  };

  type BlenderCameraSnapshot = {
    name: string;
    camera: string | null;
    frame: number | null;
    lens: number | null;
    location: [number, number, number] | null;
    rotation_euler: [number, number, number] | null;
    resolution: {
      width: number;
      height: number;
      percentage?: number;
    } | null;
  };

  type BlenderCameraStatesMessage = {
    source: string;
    scene: string | null;
    activeCamera: string | null;
    states: BlenderCameraSnapshot[];
    receivedAt: string;
  };

  type BlenderSequenceFrameSummary = {
    index: number;
    frame: number;
    timeMs: number;
    label: string;
    width: number | null;
    height: number | null;
    hasDataUrl: boolean;
  };

  type BlenderSequenceMessage = {
    sequenceId: string;
    source: string;
    kind: "sequence";
    sequenceName: string;
    scene: string | null;
    camera: string | null;
    fps: number;
    startFrame: number;
    endFrame: number;
    frameCount: number;
    frames: BlenderSequenceFrameSummary[];
    metadata: BlenderBridgeImportMetadata;
    receivedAt: string;
  };

  type BlenderSequenceFrameData = {
    sequenceId: string;
    sequenceName: string;
    frameIndex: number;
    frame: number;
    timeMs: number;
    label: string;
    dataUrl: string;
    width: number | null;
    height: number | null;
  };

  interface Window {
    electronAPI?: {
      saveFile: (options: {
        data: string | ArrayBuffer;
        defaultName?: string;
        filters?: { name: string; extensions: string[] }[];
      }) => Promise<{ success: boolean; path?: string }>;
      openFile: (options?: {
        filters?: { name: string; extensions: string[] }[];
      }) => Promise<{
        success: boolean;
        type?: 'image' | 'project';
        data?: string;
        path?: string;
      }>;
      getAppInfo: () => Promise<{
        version: string;
        name: string;
        platform: string;
        isPackaged: boolean;
      }>;
      onMenuAction: (callback: (action: string) => void) => void;
      removeMenuActionListeners: () => void;
      setTitle: (title: string) => void;
      runBlenderEmbedSpike: () => Promise<{
        ok: boolean;
        mode?: string;
        steps?: string[];
        error?: string;
        reason?: string;
      }>;
      blenderGetProcessState: () => Promise<BlenderProcessState>;
      blenderSetExecutablePath: (executablePath: string) => Promise<BlenderProcessState>;
      blenderValidateExecutablePath: (executablePath?: string) => Promise<{
        ok: boolean;
        code: string;
        message: string;
        version?: string | null;
      }>;
      blenderStartProcess: (options?: { path?: string }) => Promise<{
        ok: boolean;
        alreadyRunning?: boolean;
        error?: string;
        code?: string;
        state: BlenderProcessState;
      }>;
      blenderStopProcess: () => Promise<{
        ok: boolean;
        alreadyStopped?: boolean;
        state: BlenderProcessState;
      }>;
      blenderRestartProcess: () => Promise<{
        ok: boolean;
        alreadyRunning?: boolean;
        error?: string;
        code?: string;
        state: BlenderProcessState;
      }>;
      blenderGetEmbedState: () => Promise<BlenderEmbedState>;
      blenderAttachEmbed: (bounds: {
        x: number;
        y: number;
        width: number;
        height: number;
      }) => Promise<{
        ok: boolean;
        error?: string;
        info?: Record<string, unknown>;
        state: BlenderEmbedState;
      }>;
      blenderSyncEmbedBounds: (bounds: {
        x: number;
        y: number;
        width: number;
        height: number;
      }) => Promise<{
        ok: boolean;
        error?: string;
        state: BlenderEmbedState;
      }>;
      blenderFocusEmbed: () => Promise<{
        ok: boolean;
        error?: string;
        state: BlenderEmbedState;
      }>;
      blenderDetachEmbed: () => Promise<{
        ok: boolean;
        alreadyDetached?: boolean;
        state: BlenderEmbedState;
      }>;
      blenderBridgeGetState: () => Promise<{
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
      }>;
      blenderBridgeSetCameraSnapshot: (snapshot: Partial<BlenderCameraSnapshot> & {
        name?: string;
        camera?: string | null;
        frame?: number | null;
        lens?: number | null;
        location?: [number, number, number] | null;
        rotation_euler?: [number, number, number] | null;
        resolution?: { width: number; height: number; percentage?: number } | null;
      }) => Promise<{
        ok: boolean;
        pendingSnapshot: BlenderCameraSnapshot;
        pendingUpdatedAt: string;
      }>;
      blenderBridgeGetCameraState: () => Promise<{
        pendingSnapshot: BlenderCameraSnapshot | null;
        pendingUpdatedAt: string | null;
        pendingConsumedAt: string | null;
        lastCameraStatesAt: string | null;
        lastCameraStatesCount: number;
        lastCameraScene: string | null;
        lastCameraActive: string | null;
      }>;
      blenderBridgeGetSequences: () => Promise<{
        ok: boolean;
        sequences: BlenderSequenceMessage[];
      }>;
      blenderBridgeGetSequenceFrame: (args: {
        sequenceId: string;
        frameIndex: number;
      }) => Promise<{
        ok: boolean;
        frame?: BlenderSequenceFrameData;
        error?: string;
      }>;
      onBlenderBridgeImport: (callback: (payload: BlenderBridgeImportMessage) => void) => () => void;
      onBlenderBridgeCameraStates: (callback: (payload: BlenderCameraStatesMessage) => void) => () => void;
      onBlenderBridgeSequence: (callback: (payload: BlenderSequenceMessage) => void) => () => void;
      isElectron: boolean;
    };
  }
}
