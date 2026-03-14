/**
 * Built-in ComfyUI workflow presets for common AI tasks.
 * Each preset is a pre-configured workflow JSON with exposed parameters
 * and pre-mapped I/O nodes.
 */
import type { ComfyWorkflowData } from "./comfyui-workflow-modal";

export interface WorkflowPreset {
  id: string;
  name: string;
  description: string;
  category: "generate" | "transform" | "inpaint" | "enhance";
  icon: string; // emoji
  inputRequired: boolean;
  maskRequired: boolean;
  workflow: ComfyWorkflowData;
  inputNodeId: string | null;
  maskNodeId: string | null;
}

// ─── Txt2Img Preset ──────────────────────────────────────────────────
const txt2imgJson: Record<string, unknown> = {
  "3": {
    class_type: "KSampler",
    inputs: {
      seed: 42,
      steps: 20,
      cfg: 7.0,
      sampler_name: "euler",
      scheduler: "normal",
      denoise: 1.0,
      model: ["4", 0],
      positive: ["6", 0],
      negative: ["7", 0],
      latent_image: ["5", 0],
    },
  },
  "4": {
    class_type: "CheckpointLoaderSimple",
    inputs: { ckpt_name: "v1-5-pruned-emaonly.safetensors" },
  },
  "5": {
    class_type: "EmptyLatentImage",
    inputs: { width: 512, height: 512, batch_size: 1 },
  },
  "6": {
    class_type: "CLIPTextEncode",
    inputs: { text: "beautiful landscape, high quality", clip: ["4", 1] },
  },
  "7": {
    class_type: "CLIPTextEncode",
    inputs: { text: "ugly, blurry, low quality", clip: ["4", 1] },
  },
  "8": {
    class_type: "VAEDecode",
    inputs: { samples: ["3", 0], vae: ["4", 2] },
  },
  "9": {
    class_type: "SaveImage",
    inputs: { filename_prefix: "txt2img", images: ["8", 0] },
  },
};

const txt2imgPreset: WorkflowPreset = {
  id: "preset-txt2img",
  name: "Text to Image",
  description: "Generate images from text prompts using Stable Diffusion",
  category: "generate",
  icon: "🎨",
  inputRequired: false,
  maskRequired: false,
  inputNodeId: null,
  maskNodeId: null,
  workflow: {
    id: "preset-txt2img",
    name: "Text to Image",
    description: "Generate images from text prompts",
    nodes: Object.entries(txt2imgJson).map(([id, data]) => ({
      id,
      class_type: (data as any).class_type,
      inputs: (data as any).inputs,
    })),
    rawJson: txt2imgJson,
    exposedParams: [
      {
        nodeId: "6",
        nodeClass: "CLIPTextEncode",
        fieldName: "text",
        label: "Positive Prompt",
        type: "text",
        value: "beautiful landscape, high quality",
        defaultValue: "beautiful landscape, high quality",
        order: 0,
      },
      {
        nodeId: "7",
        nodeClass: "CLIPTextEncode",
        fieldName: "text",
        label: "Negative Prompt",
        type: "text",
        value: "ugly, blurry, low quality",
        defaultValue: "ugly, blurry, low quality",
        order: 1,
      },
      {
        nodeId: "4",
        nodeClass: "CheckpointLoaderSimple",
        fieldName: "ckpt_name",
        label: "Checkpoint",
        type: "select",
        value: "v1-5-pruned-emaonly.safetensors",
        defaultValue: "v1-5-pruned-emaonly.safetensors",
        options: ["v1-5-pruned-emaonly.safetensors"],
        order: 2,
      },
      {
        nodeId: "3",
        nodeClass: "KSampler",
        fieldName: "steps",
        label: "Steps",
        type: "slider",
        value: 20,
        defaultValue: 20,
        min: 1,
        max: 100,
        step: 1,
        order: 3,
      },
      {
        nodeId: "3",
        nodeClass: "KSampler",
        fieldName: "cfg",
        label: "CFG Scale",
        type: "slider",
        value: 7.0,
        defaultValue: 7.0,
        min: 1,
        max: 30,
        step: 0.5,
        order: 4,
      },
      {
        nodeId: "3",
        nodeClass: "KSampler",
        fieldName: "seed",
        label: "Seed",
        type: "seed",
        value: 42,
        defaultValue: 42,
        order: 5,
      },
      {
        nodeId: "3",
        nodeClass: "KSampler",
        fieldName: "sampler_name",
        label: "Sampler",
        type: "select",
        value: "euler",
        defaultValue: "euler",
        options: [
          "euler", "euler_ancestral", "heun", "dpm_2", "dpmpp_2m",
          "dpmpp_2m_sde", "dpmpp_3m_sde", "ddim", "uni_pc", "lcm",
        ],
        order: 6,
      },
      {
        nodeId: "5",
        nodeClass: "EmptyLatentImage",
        fieldName: "width",
        label: "Width",
        type: "slider",
        value: 512,
        defaultValue: 512,
        min: 64,
        max: 2048,
        step: 64,
        order: 7,
      },
      {
        nodeId: "5",
        nodeClass: "EmptyLatentImage",
        fieldName: "height",
        label: "Height",
        type: "slider",
        value: 512,
        defaultValue: 512,
        min: 64,
        max: 2048,
        step: 64,
        order: 8,
      },
    ],
  },
};

// ─── Img2Img Preset ──────────────────────────────────────────────────
const img2imgJson: Record<string, unknown> = {
  "1": {
    class_type: "LoadImage",
    inputs: { image: "input.png", upload: "image" },
  },
  "2": {
    class_type: "VAEEncode",
    inputs: { pixels: ["1", 0], vae: ["4", 2] },
  },
  "3": {
    class_type: "KSampler",
    inputs: {
      seed: 42,
      steps: 20,
      cfg: 7.0,
      sampler_name: "euler",
      scheduler: "normal",
      denoise: 0.6,
      model: ["4", 0],
      positive: ["6", 0],
      negative: ["7", 0],
      latent_image: ["2", 0],
    },
  },
  "4": {
    class_type: "CheckpointLoaderSimple",
    inputs: { ckpt_name: "v1-5-pruned-emaonly.safetensors" },
  },
  "6": {
    class_type: "CLIPTextEncode",
    inputs: { text: "high quality, detailed", clip: ["4", 1] },
  },
  "7": {
    class_type: "CLIPTextEncode",
    inputs: { text: "ugly, blurry, low quality", clip: ["4", 1] },
  },
  "8": {
    class_type: "VAEDecode",
    inputs: { samples: ["3", 0], vae: ["4", 2] },
  },
  "9": {
    class_type: "SaveImage",
    inputs: { filename_prefix: "img2img", images: ["8", 0] },
  },
};

const img2imgPreset: WorkflowPreset = {
  id: "preset-img2img",
  name: "Image to Image",
  description: "Refine/transform an existing image with text guidance",
  category: "transform",
  icon: "🔄",
  inputRequired: true,
  maskRequired: false,
  inputNodeId: "1",
  maskNodeId: null,
  workflow: {
    id: "preset-img2img",
    name: "Image to Image",
    description: "Img2img refinement",
    nodes: Object.entries(img2imgJson).map(([id, data]) => ({
      id,
      class_type: (data as any).class_type,
      inputs: (data as any).inputs,
    })),
    rawJson: img2imgJson,
    exposedParams: [
      {
        nodeId: "6",
        nodeClass: "CLIPTextEncode",
        fieldName: "text",
        label: "Positive Prompt",
        type: "text",
        value: "high quality, detailed",
        defaultValue: "high quality, detailed",
        order: 0,
      },
      {
        nodeId: "7",
        nodeClass: "CLIPTextEncode",
        fieldName: "text",
        label: "Negative Prompt",
        type: "text",
        value: "ugly, blurry, low quality",
        defaultValue: "ugly, blurry, low quality",
        order: 1,
      },
      {
        nodeId: "3",
        nodeClass: "KSampler",
        fieldName: "denoise",
        label: "Denoise Strength",
        type: "slider",
        value: 0.6,
        defaultValue: 0.6,
        min: 0,
        max: 1,
        step: 0.05,
        order: 2,
      },
      {
        nodeId: "3",
        nodeClass: "KSampler",
        fieldName: "steps",
        label: "Steps",
        type: "slider",
        value: 20,
        defaultValue: 20,
        min: 1,
        max: 100,
        step: 1,
        order: 3,
      },
      {
        nodeId: "3",
        nodeClass: "KSampler",
        fieldName: "cfg",
        label: "CFG Scale",
        type: "slider",
        value: 7.0,
        defaultValue: 7.0,
        min: 1,
        max: 30,
        step: 0.5,
        order: 4,
      },
      {
        nodeId: "3",
        nodeClass: "KSampler",
        fieldName: "seed",
        label: "Seed",
        type: "seed",
        value: 42,
        defaultValue: 42,
        order: 5,
      },
    ],
  },
};

// ─── Inpaint Preset ──────────────────────────────────────────────────
const inpaintJson: Record<string, unknown> = {
  "1": {
    class_type: "LoadImage",
    inputs: { image: "input.png", upload: "image" },
  },
  "2": {
    class_type: "LoadImage",
    inputs: { image: "mask.png", upload: "image" },
  },
  "3": {
    class_type: "VAEEncodeForInpaint",
    inputs: {
      pixels: ["1", 0],
      mask: ["2", 0],
      vae: ["5", 2],
      grow_mask_by: 6,
    },
  },
  "4": {
    class_type: "KSampler",
    inputs: {
      seed: 42,
      steps: 20,
      cfg: 7.0,
      sampler_name: "euler",
      scheduler: "normal",
      denoise: 0.85,
      model: ["5", 0],
      positive: ["6", 0],
      negative: ["7", 0],
      latent_image: ["3", 0],
    },
  },
  "5": {
    class_type: "CheckpointLoaderSimple",
    inputs: { ckpt_name: "v1-5-pruned-emaonly.safetensors" },
  },
  "6": {
    class_type: "CLIPTextEncode",
    inputs: { text: "clean, natural fill", clip: ["5", 1] },
  },
  "7": {
    class_type: "CLIPTextEncode",
    inputs: { text: "ugly, blurry", clip: ["5", 1] },
  },
  "8": {
    class_type: "VAEDecode",
    inputs: { samples: ["4", 0], vae: ["5", 2] },
  },
  "9": {
    class_type: "SaveImage",
    inputs: { filename_prefix: "inpaint", images: ["8", 0] },
  },
};

const inpaintPreset: WorkflowPreset = {
  id: "preset-inpaint",
  name: "Inpaint",
  description: "Fill masked areas with AI-generated content",
  category: "inpaint",
  icon: "🖌️",
  inputRequired: true,
  maskRequired: true,
  inputNodeId: "1",
  maskNodeId: "2",
  workflow: {
    id: "preset-inpaint",
    name: "Inpaint",
    description: "Inpaint masked regions",
    nodes: Object.entries(inpaintJson).map(([id, data]) => ({
      id,
      class_type: (data as any).class_type,
      inputs: (data as any).inputs,
    })),
    rawJson: inpaintJson,
    exposedParams: [
      {
        nodeId: "6",
        nodeClass: "CLIPTextEncode",
        fieldName: "text",
        label: "Fill Prompt",
        type: "text",
        value: "clean, natural fill",
        defaultValue: "clean, natural fill",
        order: 0,
      },
      {
        nodeId: "7",
        nodeClass: "CLIPTextEncode",
        fieldName: "text",
        label: "Negative Prompt",
        type: "text",
        value: "ugly, blurry",
        defaultValue: "ugly, blurry",
        order: 1,
      },
      {
        nodeId: "4",
        nodeClass: "KSampler",
        fieldName: "denoise",
        label: "Denoise Strength",
        type: "slider",
        value: 0.85,
        defaultValue: 0.85,
        min: 0,
        max: 1,
        step: 0.05,
        order: 2,
      },
      {
        nodeId: "4",
        nodeClass: "KSampler",
        fieldName: "steps",
        label: "Steps",
        type: "slider",
        value: 20,
        defaultValue: 20,
        min: 1,
        max: 100,
        step: 1,
        order: 3,
      },
      {
        nodeId: "4",
        nodeClass: "KSampler",
        fieldName: "cfg",
        label: "CFG Scale",
        type: "slider",
        value: 7.0,
        defaultValue: 7.0,
        min: 1,
        max: 30,
        step: 0.5,
        order: 4,
      },
      {
        nodeId: "4",
        nodeClass: "KSampler",
        fieldName: "seed",
        label: "Seed",
        type: "seed",
        value: 42,
        defaultValue: 42,
        order: 5,
      },
    ],
  },
};

// ─── Upscale Preset ──────────────────────────────────────────────────
const upscaleJson: Record<string, unknown> = {
  "1": {
    class_type: "LoadImage",
    inputs: { image: "input.png", upload: "image" },
  },
  "2": {
    class_type: "UpscaleModelLoader",
    inputs: { model_name: "RealESRGAN_x4plus.pth" },
  },
  "3": {
    class_type: "ImageUpscaleWithModel",
    inputs: { upscale_model: ["2", 0], image: ["1", 0] },
  },
  "4": {
    class_type: "SaveImage",
    inputs: { filename_prefix: "upscaled", images: ["3", 0] },
  },
};

const upscalePreset: WorkflowPreset = {
  id: "preset-upscale",
  name: "Upscale (RealESRGAN)",
  description: "Upscale images 4x using RealESRGAN model",
  category: "enhance",
  icon: "🔎",
  inputRequired: true,
  maskRequired: false,
  inputNodeId: "1",
  maskNodeId: null,
  workflow: {
    id: "preset-upscale",
    name: "Upscale 4x",
    description: "RealESRGAN 4x upscale",
    nodes: Object.entries(upscaleJson).map(([id, data]) => ({
      id,
      class_type: (data as any).class_type,
      inputs: (data as any).inputs,
    })),
    rawJson: upscaleJson,
    exposedParams: [
      {
        nodeId: "2",
        nodeClass: "UpscaleModelLoader",
        fieldName: "model_name",
        label: "Upscale Model",
        type: "select",
        value: "RealESRGAN_x4plus.pth",
        defaultValue: "RealESRGAN_x4plus.pth",
        options: [
          "RealESRGAN_x4plus.pth",
          "RealESRGAN_x4plus_anime_6B.pth",
          "RealESRGAN_x2plus.pth",
          "4x-UltraSharp.pth",
          "4x_NMKD-Superscale-SP_178000_G.pth",
        ],
        order: 0,
      },
    ],
  },
};

// ─── Face Restore Preset ─────────────────────────────────────────────
const faceRestoreJson: Record<string, unknown> = {
  "1": {
    class_type: "LoadImage",
    inputs: { image: "input.png", upload: "image" },
  },
  "2": {
    class_type: "FaceRestoreCFWithModel",
    inputs: {
      facedetection: "retinaface_resnet50",
      codeformer_fidelity: 0.5,
      facerestore_model: ["3", 0],
      image: ["1", 0],
    },
  },
  "3": {
    class_type: "FaceRestoreModelLoader",
    inputs: { model_name: "codeformer-v0.1.0.pth" },
  },
  "4": {
    class_type: "SaveImage",
    inputs: { filename_prefix: "face_restored", images: ["2", 0] },
  },
};

const faceRestorePreset: WorkflowPreset = {
  id: "preset-face-restore",
  name: "Face Restore",
  description: "Restore and enhance faces using CodeFormer",
  category: "enhance",
  icon: "😊",
  inputRequired: true,
  maskRequired: false,
  inputNodeId: "1",
  maskNodeId: null,
  workflow: {
    id: "preset-face-restore",
    name: "Face Restore",
    description: "CodeFormer face restoration",
    nodes: Object.entries(faceRestoreJson).map(([id, data]) => ({
      id,
      class_type: (data as any).class_type,
      inputs: (data as any).inputs,
    })),
    rawJson: faceRestoreJson,
    exposedParams: [
      {
        nodeId: "2",
        nodeClass: "FaceRestoreCFWithModel",
        fieldName: "codeformer_fidelity",
        label: "Fidelity (0=quality, 1=faithful)",
        type: "slider",
        value: 0.5,
        defaultValue: 0.5,
        min: 0,
        max: 1,
        step: 0.05,
        order: 0,
      },
    ],
  },
};

// ─── Style Transfer (Img2Img with high denoise) ──────────────────────
const styleTransferJson: Record<string, unknown> = {
  "1": {
    class_type: "LoadImage",
    inputs: { image: "input.png", upload: "image" },
  },
  "2": {
    class_type: "VAEEncode",
    inputs: { pixels: ["1", 0], vae: ["4", 2] },
  },
  "3": {
    class_type: "KSampler",
    inputs: {
      seed: 42,
      steps: 30,
      cfg: 12.0,
      sampler_name: "dpmpp_2m",
      scheduler: "karras",
      denoise: 0.75,
      model: ["4", 0],
      positive: ["6", 0],
      negative: ["7", 0],
      latent_image: ["2", 0],
    },
  },
  "4": {
    class_type: "CheckpointLoaderSimple",
    inputs: { ckpt_name: "v1-5-pruned-emaonly.safetensors" },
  },
  "6": {
    class_type: "CLIPTextEncode",
    inputs: {
      text: "oil painting style, artistic, masterpiece",
      clip: ["4", 1],
    },
  },
  "7": {
    class_type: "CLIPTextEncode",
    inputs: { text: "photo, realistic, ugly, blurry", clip: ["4", 1] },
  },
  "8": {
    class_type: "VAEDecode",
    inputs: { samples: ["3", 0], vae: ["4", 2] },
  },
  "9": {
    class_type: "SaveImage",
    inputs: { filename_prefix: "style_transfer", images: ["8", 0] },
  },
};

const styleTransferPreset: WorkflowPreset = {
  id: "preset-style-transfer",
  name: "Style Transfer",
  description: "Apply artistic style to your image",
  category: "transform",
  icon: "🎭",
  inputRequired: true,
  maskRequired: false,
  inputNodeId: "1",
  maskNodeId: null,
  workflow: {
    id: "preset-style-transfer",
    name: "Style Transfer",
    description: "Artistic style transfer",
    nodes: Object.entries(styleTransferJson).map(([id, data]) => ({
      id,
      class_type: (data as any).class_type,
      inputs: (data as any).inputs,
    })),
    rawJson: styleTransferJson,
    exposedParams: [
      {
        nodeId: "6",
        nodeClass: "CLIPTextEncode",
        fieldName: "text",
        label: "Style Description",
        type: "text",
        value: "oil painting style, artistic, masterpiece",
        defaultValue: "oil painting style, artistic, masterpiece",
        order: 0,
      },
      {
        nodeId: "7",
        nodeClass: "CLIPTextEncode",
        fieldName: "text",
        label: "Negative Prompt",
        type: "text",
        value: "photo, realistic, ugly, blurry",
        defaultValue: "photo, realistic, ugly, blurry",
        order: 1,
      },
      {
        nodeId: "3",
        nodeClass: "KSampler",
        fieldName: "denoise",
        label: "Style Strength",
        type: "slider",
        value: 0.75,
        defaultValue: 0.75,
        min: 0,
        max: 1,
        step: 0.05,
        order: 2,
      },
      {
        nodeId: "3",
        nodeClass: "KSampler",
        fieldName: "steps",
        label: "Steps",
        type: "slider",
        value: 30,
        defaultValue: 30,
        min: 1,
        max: 100,
        step: 1,
        order: 3,
      },
      {
        nodeId: "3",
        nodeClass: "KSampler",
        fieldName: "cfg",
        label: "CFG Scale",
        type: "slider",
        value: 12.0,
        defaultValue: 12.0,
        min: 1,
        max: 30,
        step: 0.5,
        order: 4,
      },
      {
        nodeId: "3",
        nodeClass: "KSampler",
        fieldName: "seed",
        label: "Seed",
        type: "seed",
        value: 42,
        defaultValue: 42,
        order: 5,
      },
    ],
  },
};

// ─── All Presets ─────────────────────────────────────────────────────
export const WORKFLOW_PRESETS: WorkflowPreset[] = [
  txt2imgPreset,
  img2imgPreset,
  inpaintPreset,
  upscalePreset,
  faceRestorePreset,
  styleTransferPreset,
];

export function getPresetsByCategory(category: WorkflowPreset["category"]) {
  return WORKFLOW_PRESETS.filter((p) => p.category === category);
}