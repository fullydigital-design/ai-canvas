import type { CurvesAdjustment, LayerAdjustments } from "./editor-store";

interface GLPipeline {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  buffer: WebGLBuffer;
  sourceTexture: WebGLTexture;
  rgbLUTTexture: WebGLTexture;
  redLUTTexture: WebGLTexture;
  greenLUTTexture: WebGLTexture;
  blueLUTTexture: WebGLTexture;
  aPos: number;
  aUv: number;
  uSource: WebGLUniformLocation;
  uRgbLUT: WebGLUniformLocation;
  uRedLUT: WebGLUniformLocation;
  uGreenLUT: WebGLUniformLocation;
  uBlueLUT: WebGLUniformLocation;
  uTexel: WebGLUniformLocation;
  uUseLevels: WebGLUniformLocation;
  uUseCurves: WebGLUniformLocation;
  uUseHueSat: WebGLUniformLocation;
  uInputBlack: WebGLUniformLocation;
  uInputWhite: WebGLUniformLocation;
  uInvGamma: WebGLUniformLocation;
  uOutputBlack: WebGLUniformLocation;
  uOutputWhite: WebGLUniformLocation;
  uHueShift: WebGLUniformLocation;
  uSatShift: WebGLUniformLocation;
  uLightShift: WebGLUniformLocation;
  uBlurRadius: WebGLUniformLocation;
}

const ENABLE_WEBGL_PREVIEW = true;

let _pipeline: GLPipeline | null = null;
let _webglInitFailed = false;

const IDENTITY_LUT = (() => {
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) lut[i] = i;
  return lut;
})();

function buildCurveLUT(points: { x: number; y: number }[]): Uint8Array {
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const lut = new Uint8Array(256);
  if (sorted.length < 2) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }
  for (let i = 0; i < 256; i++) {
    let lo = 0;
    let hi = sorted.length - 1;
    for (let j = 0; j < sorted.length - 1; j++) {
      if (i >= sorted[j].x && i <= sorted[j + 1].x) {
        lo = j;
        hi = j + 1;
        break;
      }
    }
    if (i <= sorted[0].x) {
      lut[i] = clampByte(sorted[0].y);
    } else if (i >= sorted[sorted.length - 1].x) {
      lut[i] = clampByte(sorted[sorted.length - 1].y);
    } else {
      const range = sorted[hi].x - sorted[lo].x;
      const t = range > 0 ? (i - sorted[lo].x) / range : 0;
      const st = t * t * (3 - 2 * t);
      lut[i] = clampByte(sorted[lo].y + st * (sorted[hi].y - sorted[lo].y));
    }
  }
  return lut;
}

function clampByte(v: number) {
  return (v < 0 ? 0 : v > 255 ? 255 : v) | 0;
}

function isCurvesIdentity(curves: CurvesAdjustment) {
  for (const ch of ["rgb", "red", "green", "blue"] as const) {
    const pts = curves[ch];
    if (pts.length !== 2) return false;
    if (pts[0].x !== 0 || pts[0].y !== 0 || pts[1].x !== 255 || pts[1].y !== 255) {
      return false;
    }
  }
  return true;
}

function isLevelsIdentity(levels: LayerAdjustments["levels"]) {
  if (!levels) return true;
  return (
    levels.inputBlack === 0 &&
    levels.inputWhite === 255 &&
    levels.gamma === 1 &&
    levels.outputBlack === 0 &&
    levels.outputWhite === 255
  );
}

function createShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(
  gl: WebGLRenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram | null {
  const vs = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vs || !fs) {
    if (vs) gl.deleteShader(vs);
    if (fs) gl.deleteShader(fs);
    return null;
  }
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return null;
  }
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

function createTexture(gl: WebGLRenderingContext): WebGLTexture | null {
  const texture = gl.createTexture();
  if (!texture) return null;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return texture;
}

function uploadLUT(
  gl: WebGLRenderingContext,
  texture: WebGLTexture,
  lut: Uint8Array,
) {
  const rgba = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const v = lut[i];
    const p = i * 4;
    rgba[p] = v;
    rgba[p + 1] = v;
    rgba[p + 2] = v;
    rgba[p + 3] = 255;
  }
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    256,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    rgba,
  );
}

function getPipeline(): GLPipeline | null {
  if (!ENABLE_WEBGL_PREVIEW || _webglInitFailed) return null;
  if (_pipeline) return _pipeline;

  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: false,
    preserveDrawingBuffer: true,
  });
  if (!gl) {
    _webglInitFailed = true;
    return null;
  }

  const vertexSource = `
    attribute vec2 aPos;
    attribute vec2 aUv;
    varying vec2 vUv;
    void main() {
      vUv = aUv;
      gl_Position = vec4(aPos, 0.0, 1.0);
    }
  `;

  const fragmentSource = `
    precision mediump float;

    varying vec2 vUv;
    uniform sampler2D uSource;
    uniform sampler2D uRgbLUT;
    uniform sampler2D uRedLUT;
    uniform sampler2D uGreenLUT;
    uniform sampler2D uBlueLUT;

    uniform vec2 uTexel;
    uniform float uUseLevels;
    uniform float uUseCurves;
    uniform float uUseHueSat;

    uniform float uInputBlack;
    uniform float uInputWhite;
    uniform float uInvGamma;
    uniform float uOutputBlack;
    uniform float uOutputWhite;

    uniform float uHueShift;
    uniform float uSatShift;
    uniform float uLightShift;
    uniform float uBlurRadius;

    float sampleLUT(sampler2D lutTex, float value) {
      return texture2D(lutTex, vec2(clamp(value, 0.0, 1.0), 0.5)).r;
    }

    vec3 rgbToHsl(vec3 c) {
      float maxC = max(max(c.r, c.g), c.b);
      float minC = min(min(c.r, c.g), c.b);
      float h = 0.0;
      float s = 0.0;
      float l = (maxC + minC) * 0.5;
      float d = maxC - minC;
      if (d > 0.00001) {
        s = l > 0.5 ? d / (2.0 - maxC - minC) : d / (maxC + minC);
        if (maxC == c.r) {
          h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
        } else if (maxC == c.g) {
          h = (c.b - c.r) / d + 2.0;
        } else {
          h = (c.r - c.g) / d + 4.0;
        }
        h /= 6.0;
      }
      return vec3(h, s, l);
    }

    float hue2rgb(float p, float q, float t) {
      if (t < 0.0) t += 1.0;
      if (t > 1.0) t -= 1.0;
      if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
      if (t < 1.0 / 2.0) return q;
      if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
      return p;
    }

    vec3 hslToRgb(vec3 hsl) {
      float h = hsl.x;
      float s = hsl.y;
      float l = hsl.z;
      if (s < 0.00001) return vec3(l, l, l);
      float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
      float p = 2.0 * l - q;
      return vec3(
        hue2rgb(p, q, h + 1.0 / 3.0),
        hue2rgb(p, q, h),
        hue2rgb(p, q, h - 1.0 / 3.0)
      );
    }

    vec3 applyColorOps(vec3 color) {
      if (uUseLevels > 0.5) {
        float inRange = max(0.0001, uInputWhite - uInputBlack);
        color = clamp((color - vec3(uInputBlack)) / inRange, 0.0, 1.0);
        color = pow(color, vec3(uInvGamma));
        color = color * (uOutputWhite - uOutputBlack) + uOutputBlack;
      }

      if (uUseCurves > 0.5) {
        float r = sampleLUT(uRedLUT, color.r);
        float g = sampleLUT(uGreenLUT, color.g);
        float b = sampleLUT(uBlueLUT, color.b);
        color = vec3(
          sampleLUT(uRgbLUT, r),
          sampleLUT(uRgbLUT, g),
          sampleLUT(uRgbLUT, b)
        );
      }

      if (uUseHueSat > 0.5) {
        vec3 hsl = rgbToHsl(color);
        hsl.x = fract(hsl.x + uHueShift);
        hsl.y = clamp(hsl.y + uSatShift * hsl.y, 0.0, 1.0);
        hsl.z = clamp(hsl.z + uLightShift * (uLightShift > 0.0 ? 1.0 - hsl.z : hsl.z), 0.0, 1.0);
        color = hslToRgb(hsl);
      }

      return clamp(color, 0.0, 1.0);
    }

    vec4 sampleBase(vec2 uv) {
      return texture2D(uSource, uv);
    }

    void main() {
      if (uBlurRadius <= 0.001) {
        vec4 src = sampleBase(vUv);
        gl_FragColor = vec4(applyColorOps(src.rgb), src.a);
        return;
      }

      vec2 o = uTexel * min(uBlurRadius, 8.0);
      vec4 c0 = sampleBase(vUv);
      vec4 c1 = sampleBase(vUv + vec2(o.x, 0.0));
      vec4 c2 = sampleBase(vUv - vec2(o.x, 0.0));
      vec4 c3 = sampleBase(vUv + vec2(0.0, o.y));
      vec4 c4 = sampleBase(vUv - vec2(0.0, o.y));
      vec4 c5 = sampleBase(vUv + vec2(o.x, o.y));
      vec4 c6 = sampleBase(vUv + vec2(-o.x, o.y));
      vec4 c7 = sampleBase(vUv + vec2(o.x, -o.y));
      vec4 c8 = sampleBase(vUv + vec2(-o.x, -o.y));

      vec3 color =
        applyColorOps(c0.rgb) * 0.20 +
        applyColorOps(c1.rgb) * 0.10 +
        applyColorOps(c2.rgb) * 0.10 +
        applyColorOps(c3.rgb) * 0.10 +
        applyColorOps(c4.rgb) * 0.10 +
        applyColorOps(c5.rgb) * 0.10 +
        applyColorOps(c6.rgb) * 0.10 +
        applyColorOps(c7.rgb) * 0.10 +
        applyColorOps(c8.rgb) * 0.10;

      float alpha =
        c0.a * 0.20 +
        c1.a * 0.10 +
        c2.a * 0.10 +
        c3.a * 0.10 +
        c4.a * 0.10 +
        c5.a * 0.10 +
        c6.a * 0.10 +
        c7.a * 0.10 +
        c8.a * 0.10;

      gl_FragColor = vec4(color, alpha);
    }
  `;

  const program = createProgram(gl, vertexSource, fragmentSource);
  if (!program) {
    _webglInitFailed = true;
    return null;
  }

  const buffer = gl.createBuffer();
  const sourceTexture = createTexture(gl);
  const rgbLUTTexture = createTexture(gl);
  const redLUTTexture = createTexture(gl);
  const greenLUTTexture = createTexture(gl);
  const blueLUTTexture = createTexture(gl);

  if (
    !buffer ||
    !sourceTexture ||
    !rgbLUTTexture ||
    !redLUTTexture ||
    !greenLUTTexture ||
    !blueLUTTexture
  ) {
    _webglInitFailed = true;
    return null;
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  // x, y, u, v
  const quad = new Float32Array([
    -1, -1, 0, 0,
     1, -1, 1, 0,
    -1,  1, 0, 1,
     1,  1, 1, 1,
  ]);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

  gl.useProgram(program);

  const aPos = gl.getAttribLocation(program, "aPos");
  const aUv = gl.getAttribLocation(program, "aUv");
  const uSource = gl.getUniformLocation(program, "uSource");
  const uRgbLUT = gl.getUniformLocation(program, "uRgbLUT");
  const uRedLUT = gl.getUniformLocation(program, "uRedLUT");
  const uGreenLUT = gl.getUniformLocation(program, "uGreenLUT");
  const uBlueLUT = gl.getUniformLocation(program, "uBlueLUT");
  const uTexel = gl.getUniformLocation(program, "uTexel");
  const uUseLevels = gl.getUniformLocation(program, "uUseLevels");
  const uUseCurves = gl.getUniformLocation(program, "uUseCurves");
  const uUseHueSat = gl.getUniformLocation(program, "uUseHueSat");
  const uInputBlack = gl.getUniformLocation(program, "uInputBlack");
  const uInputWhite = gl.getUniformLocation(program, "uInputWhite");
  const uInvGamma = gl.getUniformLocation(program, "uInvGamma");
  const uOutputBlack = gl.getUniformLocation(program, "uOutputBlack");
  const uOutputWhite = gl.getUniformLocation(program, "uOutputWhite");
  const uHueShift = gl.getUniformLocation(program, "uHueShift");
  const uSatShift = gl.getUniformLocation(program, "uSatShift");
  const uLightShift = gl.getUniformLocation(program, "uLightShift");
  const uBlurRadius = gl.getUniformLocation(program, "uBlurRadius");

  if (
    aPos < 0 ||
    aUv < 0 ||
    !uSource ||
    !uRgbLUT ||
    !uRedLUT ||
    !uGreenLUT ||
    !uBlueLUT ||
    !uTexel ||
    !uUseLevels ||
    !uUseCurves ||
    !uUseHueSat ||
    !uInputBlack ||
    !uInputWhite ||
    !uInvGamma ||
    !uOutputBlack ||
    !uOutputWhite ||
    !uHueShift ||
    !uSatShift ||
    !uLightShift ||
    !uBlurRadius
  ) {
    _webglInitFailed = true;
    return null;
  }

  uploadLUT(gl, rgbLUTTexture, IDENTITY_LUT);
  uploadLUT(gl, redLUTTexture, IDENTITY_LUT);
  uploadLUT(gl, greenLUTTexture, IDENTITY_LUT);
  uploadLUT(gl, blueLUTTexture, IDENTITY_LUT);

  _pipeline = {
    canvas,
    gl,
    program,
    buffer,
    sourceTexture,
    rgbLUTTexture,
    redLUTTexture,
    greenLUTTexture,
    blueLUTTexture,
    aPos,
    aUv,
    uSource,
    uRgbLUT,
    uRedLUT,
    uGreenLUT,
    uBlueLUT,
    uTexel,
    uUseLevels,
    uUseCurves,
    uUseHueSat,
    uInputBlack,
    uInputWhite,
    uInvGamma,
    uOutputBlack,
    uOutputWhite,
    uHueShift,
    uSatShift,
    uLightShift,
    uBlurRadius,
  };
  return _pipeline;
}

export function canUseWebGLAdjustments(adjustments?: LayerAdjustments) {
  if (!ENABLE_WEBGL_PREVIEW || !adjustments) return false;

  if (adjustments.colorBalance) return false;
  if (adjustments.filters?.some((f) => f.enabled && f.intensity > 0)) return false;
  if (adjustments.blurSharpen && adjustments.blurSharpen.sharpenAmount > 0) return false;

  const hasLevels = !!adjustments.levels && !isLevelsIdentity(adjustments.levels);
  const hasCurves = !!adjustments.curves && !isCurvesIdentity(adjustments.curves);
  const hasHueSat =
    !!adjustments.hueSaturation &&
    (adjustments.hueSaturation.hue !== 0 ||
      adjustments.hueSaturation.saturation !== 0 ||
      adjustments.hueSaturation.lightness !== 0);
  const hasBlur = !!adjustments.blurSharpen && adjustments.blurSharpen.blurRadius > 0;

  return hasLevels || hasCurves || hasHueSat || hasBlur;
}

export function applyAdjustmentsWebGL(
  source: CanvasImageSource,
  width: number,
  height: number,
  adjustments: LayerAdjustments,
): HTMLCanvasElement | null {
  if (!canUseWebGLAdjustments(adjustments)) return null;

  try {
    const pipeline = getPipeline();
    if (!pipeline) return null;

    const { gl } = pipeline;

    if (pipeline.canvas.width !== width || pipeline.canvas.height !== height) {
      pipeline.canvas.width = width;
      pipeline.canvas.height = height;
    }

    gl.viewport(0, 0, width, height);
    gl.useProgram(pipeline.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, pipeline.buffer);

    gl.enableVertexAttribArray(pipeline.aPos);
    gl.vertexAttribPointer(pipeline.aPos, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(pipeline.aUv);
    gl.vertexAttribPointer(pipeline.aUv, 2, gl.FLOAT, false, 16, 8);

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, pipeline.sourceTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      source as TexImageSource,
    );
    gl.uniform1i(pipeline.uSource, 0);

    const curves = adjustments.curves;
    const rgbLut = curves ? buildCurveLUT(curves.rgb) : IDENTITY_LUT;
    const redLut = curves ? buildCurveLUT(curves.red) : IDENTITY_LUT;
    const greenLut = curves ? buildCurveLUT(curves.green) : IDENTITY_LUT;
    const blueLut = curves ? buildCurveLUT(curves.blue) : IDENTITY_LUT;

    uploadLUT(gl, pipeline.rgbLUTTexture, rgbLut);
    uploadLUT(gl, pipeline.redLUTTexture, redLut);
    uploadLUT(gl, pipeline.greenLUTTexture, greenLut);
    uploadLUT(gl, pipeline.blueLUTTexture, blueLut);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, pipeline.rgbLUTTexture);
    gl.uniform1i(pipeline.uRgbLUT, 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, pipeline.redLUTTexture);
    gl.uniform1i(pipeline.uRedLUT, 2);

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, pipeline.greenLUTTexture);
    gl.uniform1i(pipeline.uGreenLUT, 3);

    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, pipeline.blueLUTTexture);
    gl.uniform1i(pipeline.uBlueLUT, 4);

    const levels = adjustments.levels;
    gl.uniform1f(pipeline.uUseLevels, levels ? 1 : 0);
    gl.uniform1f(pipeline.uInputBlack, levels ? levels.inputBlack / 255 : 0);
    gl.uniform1f(pipeline.uInputWhite, levels ? levels.inputWhite / 255 : 1);
    gl.uniform1f(pipeline.uInvGamma, levels ? 1 / Math.max(0.1, levels.gamma) : 1);
    gl.uniform1f(pipeline.uOutputBlack, levels ? levels.outputBlack / 255 : 0);
    gl.uniform1f(pipeline.uOutputWhite, levels ? levels.outputWhite / 255 : 1);

    gl.uniform1f(pipeline.uUseCurves, curves && !isCurvesIdentity(curves) ? 1 : 0);

    const hueSat = adjustments.hueSaturation;
    gl.uniform1f(pipeline.uUseHueSat, hueSat ? 1 : 0);
    gl.uniform1f(pipeline.uHueShift, hueSat ? hueSat.hue / 360 : 0);
    gl.uniform1f(pipeline.uSatShift, hueSat ? hueSat.saturation / 100 : 0);
    gl.uniform1f(pipeline.uLightShift, hueSat ? hueSat.lightness / 100 : 0);

    const blur = adjustments.blurSharpen?.blurRadius || 0;
    gl.uniform1f(pipeline.uBlurRadius, Math.max(0, Math.min(8, blur)));
    gl.uniform2f(pipeline.uTexel, 1 / Math.max(1, width), 1 / Math.max(1, height));

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return pipeline.canvas;
  } catch {
    return null;
  }
}
