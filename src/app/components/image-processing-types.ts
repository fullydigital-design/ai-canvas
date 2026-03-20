export interface WorkerCurvePoint {
  x: number;
  y: number;
}

export interface WorkerLevelsAdjustment {
  inputBlack: number;
  inputWhite: number;
  gamma: number;
  outputBlack: number;
  outputWhite: number;
}

export interface WorkerCurvesAdjustment {
  rgb: WorkerCurvePoint[];
  red: WorkerCurvePoint[];
  green: WorkerCurvePoint[];
  blue: WorkerCurvePoint[];
}

export interface WorkerColorBalanceAdjustment {
  shadowsCyanRed: number;
  shadowsMagentaGreen: number;
  shadowsYellowBlue: number;
  midtonesCyanRed: number;
  midtonesMagentaGreen: number;
  midtonesYellowBlue: number;
  highlightsCyanRed: number;
  highlightsMagentaGreen: number;
  highlightsYellowBlue: number;
}

export interface WorkerHueSaturationAdjustment {
  hue: number;
  saturation: number;
  lightness: number;
}

export interface WorkerBlurSharpenAdjustment {
  blurRadius: number;
  sharpenAmount: number;
  sharpenRadius: number;
}

export interface WorkerFilterPreset {
  id: string;
  type:
    | "blur"
    | "sharpen"
    | "noise"
    | "vignette"
    | "grain"
    | "sepia"
    | "invert"
    | "posterize"
    | "emboss"
    | "pixelate"
    | "chromatic-aberration"
    | "glow";
  enabled: boolean;
  intensity: number;
}

export interface WorkerLayerAdjustments {
  levels?: WorkerLevelsAdjustment;
  curves?: WorkerCurvesAdjustment;
  colorBalance?: WorkerColorBalanceAdjustment;
  hueSaturation?: WorkerHueSaturationAdjustment;
  blurSharpen?: WorkerBlurSharpenAdjustment;
  filters?: WorkerFilterPreset[];
}

export interface WorkerLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  type: "image" | "fill" | "ai-generated" | "mask" | "text";
  blendMode: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fillColor?: string;
  maskEnabled?: boolean;
  adjustments?: WorkerLayerAdjustments;
  textContent?: string;
  textFont?: string;
  textSize?: number;
  textColor?: string;
  textAlign?: "left" | "center" | "right";
  textBold?: boolean;
  textItalic?: boolean;
  textLineHeight?: number;
  imageDataUrl?: string;
  maskDataUrl?: string;
}

export type ImageWorkerRequest =
  | {
      id: number;
      type: "flatten";
      payload: {
        layers: WorkerLayer[];
        docW: number;
        docH: number;
      };
    }
  | {
      id: number;
      type: "extract-layer";
      payload: {
        layer: WorkerLayer;
      };
    };

export type ImageWorkerResponse =
  | { id: number; ok: true; blob: Blob }
  | { id: number; ok: false; error: string };
