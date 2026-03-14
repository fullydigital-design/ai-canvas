import { useState, useCallback } from "react";
import {
  ChevronRight,
  ChevronDown,
  Download,
  Terminal,
  Cpu,
  Monitor,
  HardDrive,
  Globe,
  Image as ImageIcon,
  Copy,
  Check,
  FolderOpen,
  Rocket,
  Eye,
  EyeOff,
  Zap,
  Wifi,
  WifiOff,
  RefreshCw,
  AlertCircle,
  Server,
  FileCode,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────
interface LaunchFlag {
  id: string;
  flag: string;
  label: string;
  description: string;
  enabled: boolean;
}

interface FlagCategory {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
  flags: LaunchFlag[];
}

type GpuPreset = "performance" | "balanced" | "lowvram" | "cloud";
type ConnStatus = "idle" | "testing" | "ok" | "error";

// ─── GPU Presets ─────────────────────────────────────────────
const GPU_PRESETS: {
  id: GpuPreset;
  label: string;
  icon: React.ElementType;
  description: string;
}[] = [
  {
    id: "performance",
    label: "Performance",
    icon: Zap,
    description: "RTX 30/40/50 series — all optimizations on, 24+ GB VRAM",
  },
  {
    id: "balanced",
    label: "Balanced",
    icon: Monitor,
    description: "16 GB VRAM GPUs — safe defaults, no highvram mode",
  },
  {
    id: "lowvram",
    label: "Low VRAM",
    icon: HardDrive,
    description: "8 GB VRAM GPUs — conservative settings, slower but stable",
  },
  {
    id: "cloud",
    label: "Cloud GPU",
    icon: Globe,
    description: "RunPod, Vast.ai, Massed Compute — network listening enabled",
  },
];

// ─── Default Flags ───────────────────────────────────────────
function getDefaultFlags(): FlagCategory[] {
  return [
    {
      id: "performance",
      label: "Performance",
      icon: Cpu,
      color: "text-orange-400",
      flags: [
        { id: "fast", flag: "--fast", label: "--fast", description: "FP8 fast math + optimized kernels for RTX 30/40/50 series", enabled: true },
        { id: "cuda-malloc", flag: "--cuda-malloc", label: "--cuda-malloc", description: "Async CUDA memory allocation — faster on NVIDIA GPUs", enabled: true },
        { id: "force-channels-last", flag: "--force-channels-last", label: "--force-channels-last", description: "NHWC memory layout — 10-20% speedup on Tensor Cores", enabled: true },
        { id: "pytorch-cross-attention", flag: "--use-pytorch-cross-attention", label: "--use-pytorch-cross-attention", description: "Native PyTorch attention with Flash Attention support", enabled: true },
      ],
    },
    {
      id: "precision",
      label: "Precision (FP8)",
      icon: Cpu,
      color: "text-purple-400",
      flags: [
        { id: "fp8-unet", flag: "--fp8_e4m3fn-unet", label: "--fp8_e4m3fn-unet", description: "Run UNet/DiT in FP8 — ~50% less VRAM, native on Blackwell", enabled: true },
        { id: "fp8-text-enc", flag: "--fp8_e4m3fn-text-enc", label: "--fp8_e4m3fn-text-enc", description: "Run CLIP/T5 text encoders in FP8 — saves 4-5 GB VRAM", enabled: true },
      ],
    },
    {
      id: "memory",
      label: "Memory",
      icon: HardDrive,
      color: "text-cyan-400",
      flags: [
        { id: "highvram", flag: "--highvram", label: "--highvram", description: "Keep all models in VRAM — no loading delays between runs", enabled: true },
        { id: "disable-smart-memory", flag: "--disable-smart-memory", label: "--disable-smart-memory", description: "Skip model offloading logic — not needed with 24+ GB VRAM", enabled: true },
        { id: "reserve-vram", flag: "--reserve-vram 0.5", label: "--reserve-vram 0.5", description: "Reserve only 0.5 GB for system — more VRAM for models", enabled: true },
      ],
    },
    {
      id: "network",
      label: "Network",
      icon: Globe,
      color: "text-blue-400",
      flags: [
        { id: "listen", flag: "--listen 0.0.0.0", label: "--listen 0.0.0.0", description: "Accept connections from devices on your network", enabled: true },
        { id: "enable-cors", flag: "--enable-cors-header", label: "--enable-cors-header", description: "Allow the web editor to talk to ComfyUI directly", enabled: true },
      ],
    },
    {
      id: "preview",
      label: "Preview",
      icon: ImageIcon,
      color: "text-yellow-400",
      flags: [
        { id: "preview-taesd", flag: "--preview-method taesd", label: "--preview-method taesd", description: "Real-time image previews during generation (~2ms overhead)", enabled: true },
      ],
    },
  ];
}

function applyPreset(categories: FlagCategory[], preset: GpuPreset): FlagCategory[] {
  return categories.map((cat) => ({
    ...cat,
    flags: cat.flags.map((flag) => {
      switch (preset) {
        case "performance":
          return { ...flag, enabled: true };
        case "balanced":
          return { ...flag, enabled: !["highvram", "disable-smart-memory"].includes(flag.id) };
        case "lowvram":
          return { ...flag, enabled: !["highvram", "disable-smart-memory", "fast", "fp8-unet", "fp8-text-enc"].includes(flag.id) };
        case "cloud":
          return { ...flag, enabled: true };
        default:
          return flag;
      }
    }),
  }));
}

// ─── Python Agent Script (real HTTP bridge server) ───────────
function buildAgentScript(agentPort: number): string {
  return `#!/usr/bin/env python3
"""
ComfyUI HTTP Bridge Agent v1.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Bridges the AI Photo Editor (browser or Electron) to your local
ComfyUI instance by providing a CORS-enabled HTTP API on port ${agentPort}.

Install once:
  pip install requests websocket-client

Run:
  python comfyui_agent.py
  python comfyui_agent.py --comfy-url http://127.0.0.1:8188 --port ${agentPort}

Then in AI Photo Editor → AI Panel → ComfyUI:
  Set the URL to:  http://127.0.0.1:${agentPort}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""
import json, time, sys, base64, uuid, argparse, traceback, socket
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

import requests

try:
    import websocket
except ImportError:
    print("[ERROR] Missing dependency: pip install websocket-client")
    sys.exit(1)

VERSION           = "1.0.0"
DEFAULT_COMFY_URL = "http://127.0.0.1:8188"
DEFAULT_PORT      = ${agentPort}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ComfyUI Bridge — wraps all ComfyUI API calls
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
class ComfyBridge:
    def __init__(self, comfy_url: str):
        self.comfy_url = comfy_url.rstrip("/")
        self.client_id = str(uuid.uuid4())
        print(f"[Bridge] client_id = {self.client_id}", flush=True)

    def _get(self, path: str, timeout: int = 15) -> dict:
        r = requests.get(f"{self.comfy_url}{path}", timeout=timeout)
        r.raise_for_status()
        return r.json()

    def system_stats(self) -> dict:
        return self._get("/system_stats")

    def object_info(self) -> dict:
        return self._get("/object_info", timeout=30)

    def queue_status(self) -> dict:
        return self._get("/queue")

    def interrupt(self) -> dict:
        r = requests.post(f"{self.comfy_url}/interrupt", timeout=5)
        return {"ok": r.status_code < 400}

    def upload_image(self, data_url: str, filename: str) -> dict:
        """Upload a base64 data-URL image to ComfyUI's input folder."""
        try:
            _, b64 = data_url.split(",", 1)
        except ValueError:
            raise ValueError("Invalid data-URL format (expected 'data:...;base64,...')")
        img_bytes = base64.b64decode(b64)
        r = requests.post(
            f"{self.comfy_url}/upload/image",
            files={"image": (filename, img_bytes, "image/png")},
            data={"overwrite": "true"},
            timeout=60,
        )
        r.raise_for_status()
        return r.json()

    def queue_prompt(self, workflow: dict) -> str:
        payload = {"prompt": workflow, "client_id": self.client_id}
        r = requests.post(f"{self.comfy_url}/prompt", json=payload, timeout=15)
        r.raise_for_status()
        resp = r.json()
        if resp.get("node_errors"):
            raise RuntimeError(f"Workflow node errors: {resp['node_errors']}")
        return resp["prompt_id"]

    def wait_for_completion(self, prompt_id: str, timeout_sec: int = 600):
        """Block until the prompt finishes or errors, via WebSocket."""
        ws_base = self.comfy_url.replace("http://", "ws://").replace("https://", "wss://")
        ws_url  = f"{ws_base}/ws?clientId={self.client_id}"
        ws = websocket.create_connection(ws_url, timeout=30)
        deadline = time.time() + timeout_sec
        try:
            while time.time() < deadline:
                ws.settimeout(min(10, max(1, deadline - time.time())))
                try:
                    msg = ws.recv()
                except websocket.WebSocketTimeoutException:
                    continue
                if not isinstance(msg, str):
                    continue  # binary preview frame — skip
                try:
                    data = json.loads(msg)
                except json.JSONDecodeError:
                    continue
                t = data.get("type")
                d = data.get("data", {})
                if t == "executing" and d.get("prompt_id") == prompt_id and d.get("node") is None:
                    return  # ✓ execution complete
                if t == "execution_error" and d.get("prompt_id") == prompt_id:
                    raise RuntimeError(d.get("exception_message", "ComfyUI execution error"))
        finally:
            ws.close()
        raise TimeoutError(f"Workflow timed out after {timeout_sec}s")

    def collect_output_images(self, prompt_id: str) -> list:
        """Fetch all output images from history, return as data-URLs."""
        history = self._get(f"/history/{prompt_id}")
        entry   = history.get(prompt_id, {})
        outputs = entry.get("outputs", {})
        images  = []
        for node_out in outputs.values():
            for img in node_out.get("images", []):
                qs = (f"filename={img['filename']}"
                      f"&subfolder={img.get('subfolder', '')}"
                      f"&type={img.get('type', 'output')}")
                r = requests.get(f"{self.comfy_url}/view?{qs}", timeout=60)
                r.raise_for_status()
                b64 = base64.b64encode(r.content).decode()
                images.append(f"data:image/png;base64,{b64}")
        return images

    def run_workflow(self, workflow: dict, timeout_sec: int = 600) -> list:
        """Full pipeline: queue → wait via WS → collect images → return data-URLs."""
        prompt_id = self.queue_prompt(workflow)
        print(f"[Bridge] Queued prompt_id={prompt_id}", flush=True)
        self.wait_for_completion(prompt_id, timeout_sec)
        images = self.collect_output_images(prompt_id)
        print(f"[Bridge] Done — {len(images)} image(s) returned", flush=True)
        return images


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# HTTP Request Handler
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
_bridge: "ComfyBridge | None" = None


class AgentHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        print(f"[Agent] {self.address_string()} {fmt % args}", flush=True)

    # ── CORS ──────────────────────────────────────────────────

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin",  "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    # ── Helpers ───────────────────────────────────────────────

    def _json(self, data: dict, status: int = 200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type",   "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _err(self, msg: str, status: int = 500):
        self._json({"error": msg}, status)

    def _body(self) -> dict:
        n = int(self.headers.get("Content-Length", 0))
        if n == 0:
            return {}
        return json.loads(self.rfile.read(n))

    # ── GET routes ────────────────────────────────────────────

    def do_GET(self):
        path = urlparse(self.path).path
        try:
            if path == "/health":
                self._json({"status": "ok", "version": VERSION,
                            "comfy_url": _bridge.comfy_url,
                            "client_id": _bridge.client_id})
            elif path == "/system_stats":
                self._json(_bridge.system_stats())
            elif path == "/object_info":
                self._json(_bridge.object_info())
            elif path == "/queue":
                self._json(_bridge.queue_status())
            else:
                self._err("Not found", 404)
        except Exception as e:
            traceback.print_exc()
            self._err(str(e), 502)

    # ── POST routes ───────────────────────────────────────────

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            body = self._body()
            if path == "/run_workflow":
                wf = body.get("workflow")
                if not wf:
                    self._err("Missing 'workflow'", 400); return
                timeout = int(body.get("timeout", 600))
                images  = _bridge.run_workflow(wf, timeout)
                self._json({"images": images, "count": len(images)})

            elif path == "/upload_image":
                data_url = body.get("data_url")
                filename  = body.get("filename", f"upload_{int(time.time())}.png")
                if not data_url:
                    self._err("Missing 'data_url'", 400); return
                self._json(_bridge.upload_image(data_url, filename))

            elif path == "/interrupt":
                self._json(_bridge.interrupt())

            else:
                self._err("Not found", 404)

        except Exception as e:
            traceback.print_exc()
            self._err(str(e), 500)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Entry point
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def wait_for_comfy(bridge: ComfyBridge, max_wait: int = 120):
    print(f"[Agent] Waiting for ComfyUI at {bridge.comfy_url} ...", flush=True)
    start = time.time()
    while time.time() - start < max_wait:
        try:
            bridge.system_stats()
            print("\\n[Agent] ✓ ComfyUI is online!", flush=True)
            return
        except Exception:
            print(".", end="", flush=True)
            time.sleep(2)
    raise RuntimeError(
        f"ComfyUI not reachable after {max_wait}s. "
        "Make sure ComfyUI is running, then retry."
    )


def main():
    global _bridge
    parser = argparse.ArgumentParser(
        description="ComfyUI HTTP Bridge Agent",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\\n"
            "  python comfyui_agent.py\\n"
            "  python comfyui_agent.py --comfy-url http://127.0.0.1:8188 --port ${agentPort}\\n"
            "  python comfyui_agent.py --no-wait\\n"
        ),
    )
    parser.add_argument("--comfy-url", default=DEFAULT_COMFY_URL, metavar="URL",
                        help=f"ComfyUI server URL (default: {DEFAULT_COMFY_URL})")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT,
                        help=f"Agent HTTP port (default: {DEFAULT_PORT})")
    parser.add_argument("--no-wait", action="store_true",
                        help="Start the HTTP server without waiting for ComfyUI")
    args = parser.parse_args()

    _bridge = ComfyBridge(args.comfy_url)

    if not args.no_wait:
        wait_for_comfy(_bridge)

    server = HTTPServer(("127.0.0.1", args.port), AgentHandler)
    try:
        server.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    except Exception:
        pass

    sep = "━" * 52
    print(f"\\n{sep}", flush=True)
    print(f"  ComfyUI Bridge Agent  v{VERSION}", flush=True)
    print(sep, flush=True)
    print(f"  Agent URL   → http://127.0.0.1:{args.port}", flush=True)
    print(f"  ComfyUI URL → {args.comfy_url}", flush=True)
    print(sep, flush=True)
    print(f"  In AI Photo Editor → set URL to:", flush=True)
    print(f"  http://127.0.0.1:{args.port}", flush=True)
    print(f"{sep}\\n", flush=True)
    print("Ready — waiting for jobs...", flush=True)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\\n[Agent] Stopped.", flush=True)
        server.server_close()


if __name__ == "__main__":
    main()
`;
}

// ─── Collapsible Section ─────────────────────────────────────
function CollapsibleSection({
  title,
  icon: Icon,
  defaultOpen = false,
  children,
  badge,
}: {
  title: string;
  icon: React.ElementType;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-accent/30 transition-colors"
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        )}
        <Icon className="w-4 h-4 text-primary shrink-0" />
        <span className="text-xs text-foreground">{title}</span>
        {badge && <div className="ml-auto">{badge}</div>}
      </button>
      {open && (
        <div className="border-t border-border px-4 py-3">{children}</div>
      )}
    </div>
  );
}

// ─── Flag Category Section ───────────────────────────────────
function FlagCategorySection({
  category,
  onToggleFlag,
}: {
  category: FlagCategory;
  onToggleFlag: (flagId: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const Icon = category.icon;
  const enabledCount = category.flags.filter((f) => f.enabled).length;

  return (
    <div className="border border-border/50 rounded-md overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent/20 transition-colors"
      >
        {open ? (
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
        )}
        <Icon className={`w-3.5 h-3.5 ${category.color}`} />
        <span className="text-xs text-foreground">{category.label}</span>
        <span className="text-[10px] text-muted-foreground ml-auto">
          {enabledCount}/{category.flags.length}
        </span>
      </button>
      {open && (
        <div className="border-t border-border/30">
          <div className="grid grid-cols-2 gap-px">
            {category.flags.map((flag) => (
              <button
                key={flag.id}
                onClick={() => onToggleFlag(flag.id)}
                className="flex items-start gap-2 px-3 py-2.5 hover:bg-accent/20 transition-colors text-left"
              >
                <div className="mt-0.5 shrink-0">
                  {flag.enabled ? (
                    <div className="w-4 h-4 rounded bg-primary/20 border border-primary/40 flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 text-primary" />
                    </div>
                  ) : (
                    <div className="w-4 h-4 rounded border border-border bg-secondary" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className={`text-xs font-mono ${flag.enabled ? "text-primary" : "text-muted-foreground"}`}>
                    {flag.label}
                  </div>
                  <div className="text-[10px] text-muted-foreground/70 mt-0.5 leading-tight">
                    {flag.description}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Connection Status Badge ──────────────────────────────────
function StatusBadge({ status, message }: { status: ConnStatus; message: string }) {
  if (status === "idle") return null;
  const cfg = {
    testing: { color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30", dot: "bg-yellow-400 animate-pulse" },
    ok:      { color: "text-green-400 bg-green-400/10 border-green-400/30",   dot: "bg-green-400" },
    error:   { color: "text-red-400 bg-red-400/10 border-red-400/30",         dot: "bg-red-400" },
  }[status];
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] ${cfg.color}`}>
      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {message}
    </div>
  );
}

// ─── Main Connect Panel ──────────────────────────────────────
export function ConnectPanel() {
  // IMPORTANT: String.fromCharCode(92) is used to avoid backslash escaping issues
  const [comfyPath, setComfyPath] = useState("C:" + String.fromCharCode(92) + "ComfyUI");
  const [gpuPreset, setGpuPreset] = useState<GpuPreset>("performance");
  const [flagCategories, setFlagCategories] = useState<FlagCategory[]>(getDefaultFlags);
  const [comfyPort, setComfyPort] = useState("8188");
  const [agentPort, setAgentPort] = useState("8765");
  const [showScript, setShowScript] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedLauncher, setCopiedLauncher] = useState<"bat" | "sh" | null>(null);
  const [connStatus, setConnStatus] = useState<ConnStatus>("idle");
  const [connMsg, setConnMsg] = useState("");
  const [connDetail, setConnDetail] = useState<string | null>(null);

  // ─── Flags helpers ─────────────────────────────────────────
  const handlePresetChange = (preset: GpuPreset) => {
    setGpuPreset(preset);
    setFlagCategories((prev) => applyPreset(prev, preset));
  };

  const handleToggleFlag = (flagId: string) => {
    setFlagCategories((prev) =>
      prev.map((cat) => ({
        ...cat,
        flags: cat.flags.map((f) => f.id === flagId ? { ...f, enabled: !f.enabled } : f),
      }))
    );
  };

  const allFlags = flagCategories.flatMap((c) => c.flags);
  const enabledCount = allFlags.filter((f) => f.enabled).length;

  const handleEnableAll = () =>
    setFlagCategories((prev) => prev.map((cat) => ({ ...cat, flags: cat.flags.map((f) => ({ ...f, enabled: true })) })));

  const handleDisableAll = () =>
    setFlagCategories((prev) => prev.map((cat) => ({ ...cat, flags: cat.flags.map((f) => ({ ...f, enabled: false })) })));

  const getEnabledFlags = () =>
    allFlags.filter((f) => f.enabled).map((f) => f.flag).join(" ");

  // ─── Script generators ────────────────────────────────────
  const generateBatScript = () => {
    const flags = getEnabledFlags();
    const bs = String.fromCharCode(92); // backslash
    return `@echo off
REM ============================================================
REM  AI Photo Editor — ComfyUI One-Click Launcher
REM  GPU Preset  : ${gpuPreset.charAt(0).toUpperCase() + gpuPreset.slice(1)}
REM  Generated   : ${new Date().toISOString().slice(0, 10)}
REM ============================================================

set COMFYUI_PATH=${comfyPath}
set COMFY_PORT=${comfyPort}
set AGENT_PORT=${agentPort}
set PYTHON=%COMFYUI_PATH%${bs}venv${bs}Scripts${bs}python.exe
set AGENT=%~dp0comfyui_agent.py

echo.
echo  AI Photo Editor — ComfyUI Launcher
echo ============================================================

REM ── Validate installation ──────────────────────────────────
if not exist "%COMFYUI_PATH%" (
    echo [ERROR] ComfyUI folder not found: %COMFYUI_PATH%
    echo         Edit COMFYUI_PATH at the top of this script.
    pause & exit /b 1
)
if not exist "%PYTHON%" (
    echo [ERROR] Python venv not found: %PYTHON%
    echo         Run the ComfyUI installer or set up the venv first.
    pause & exit /b 1
)

REM ── Start ComfyUI in a new window ──────────────────────────
echo [1/2] Starting ComfyUI on port %COMFY_PORT%...
start "ComfyUI Server" cmd /k "cd /d "%COMFYUI_PATH%" && "%PYTHON%" main.py ${flags} --port %COMFY_PORT% --listen 0.0.0.0 --enable-cors-header --preview-method taesd && pause"

REM ── Start Bridge Agent if available ────────────────────────
if exist "%AGENT%" (
    echo [2/2] Waiting 10s for ComfyUI to initialise...
    timeout /t 10 /nobreak >nul
    echo [2/2] Starting Bridge Agent on port %AGENT_PORT%...
    start "ComfyUI Bridge Agent" cmd /k ""%PYTHON%" "%AGENT%" --comfy-url http://127.0.0.1:%COMFY_PORT% --port %AGENT_PORT% && pause"
    echo.
    echo  Bridge Agent → http://127.0.0.1:%AGENT_PORT%
) else (
    echo [2/2] comfyui_agent.py not found next to this .bat file.
    echo       Download it from the "Python Bridge Agent" section
    echo       of the Connect tab and place it in the same folder.
)

echo.
echo ============================================================
echo  ComfyUI starting on  : http://127.0.0.1:%COMFY_PORT%
echo  Bridge Agent (agent) : http://127.0.0.1:%AGENT_PORT%
echo.
echo  In AI Photo Editor, set ComfyUI URL to:
echo    Electron / direct : http://127.0.0.1:%COMFY_PORT%
echo    Browser / proxied : http://127.0.0.1:%AGENT_PORT%
echo ============================================================
echo.
pause
`;
  };

  const generateShScript = () => {
    const flags = getEnabledFlags();
    return `#!/bin/bash
# ============================================================
# AI Photo Editor — ComfyUI One-Click Launcher
# GPU Preset  : ${gpuPreset.charAt(0).toUpperCase() + gpuPreset.slice(1)}
# Generated   : ${new Date().toISOString().slice(0, 10)}
# ============================================================

COMFYUI_PATH="${comfyPath.replace(/\\/g, "/")}"
COMFY_PORT="${comfyPort}"
AGENT_PORT="${agentPort}"
PYTHON="$COMFYUI_PATH/venv/bin/python"
AGENT="$(dirname "$0")/comfyui_agent.py"

echo ""
echo " AI Photo Editor — ComfyUI Launcher"
echo "============================================================"

# ── Validate installation ─────────────────────────────────────
if [ ! -d "$COMFYUI_PATH" ]; then
  echo "[ERROR] ComfyUI folder not found: $COMFYUI_PATH"
  echo "        Edit COMFYUI_PATH at the top of this script."
  exit 1
fi
if [ ! -f "$PYTHON" ]; then
  echo "[ERROR] Python venv not found: $PYTHON"
  echo "        Set up the ComfyUI venv first (python -m venv venv)."
  exit 1
fi

# ── Start ComfyUI in the background ──────────────────────────
echo "[1/2] Starting ComfyUI on port $COMFY_PORT..."
cd "$COMFYUI_PATH" || exit 1
"$PYTHON" main.py ${flags} --port "$COMFY_PORT" --listen 0.0.0.0 --enable-cors-header --preview-method taesd &
COMFY_PID=$!
echo "      ComfyUI PID: $COMFY_PID"

# ── Start Bridge Agent if available ──────────────────────────
if [ -f "$AGENT" ]; then
  echo "[2/2] Waiting 10s for ComfyUI to initialise..."
  sleep 10
  echo "[2/2] Starting Bridge Agent on port $AGENT_PORT..."
  "$PYTHON" "$AGENT" --comfy-url "http://127.0.0.1:$COMFY_PORT" --port "$AGENT_PORT" &
  AGENT_PID=$!
  echo "      Bridge Agent PID: $AGENT_PID"
else
  echo "[2/2] comfyui_agent.py not found next to this .sh file."
  echo "      Download it from the Connect tab and place it here."
fi

echo ""
echo "============================================================"
echo " ComfyUI        → http://127.0.0.1:$COMFY_PORT"
echo " Bridge Agent   → http://127.0.0.1:$AGENT_PORT"
echo ""
echo " In AI Photo Editor, set ComfyUI URL to:"
echo "   Electron/direct : http://127.0.0.1:$COMFY_PORT"
echo "   Browser/proxied : http://127.0.0.1:$AGENT_PORT"
echo "============================================================"
echo ""
echo "Press Ctrl+C to stop both processes."
wait
`;
  };

  // ─── Download helpers ─────────────────────────────────────
  const downloadText = (content: string, filename: string, mime = "text/plain") => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadLauncher = (type: "bat" | "sh") => {
    const content = type === "bat" ? generateBatScript() : generateShScript();
    downloadText(content, type === "bat" ? "start_comfyui.bat" : "start_comfyui.sh");
    setCopiedLauncher(type);
    setTimeout(() => setCopiedLauncher(null), 2000);
  };

  const handleDownloadAgent = () => {
    downloadText(buildAgentScript(parseInt(agentPort) || 8765), "comfyui_agent.py");
  };

  // ─── Clipboard helpers ────────────────────────────────────
  const copyToClipboard = (text: string) => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
    } else {
      legacyCopy(text);
    }
  };

  const legacyCopy = (text: string) => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try { document.execCommand("copy"); } catch (_) { /* silent */ }
    document.body.removeChild(ta);
  };

  const handleCopyScript = () => {
    copyToClipboard(buildAgentScript(parseInt(agentPort) || 8765));
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  // ─── Live connection test ─────────────────────────────────
  const handleTestConnection = useCallback(async () => {
    setConnStatus("testing");
    setConnMsg("Connecting...");
    setConnDetail(null);

    const agentUrl = `http://127.0.0.1:${agentPort}`;
    const directUrl = `http://127.0.0.1:${comfyPort}`;

    // 1. Try the bridge agent first
    try {
      const res = await fetch(`${agentUrl}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = await res.json();
        setConnStatus("ok");
        setConnMsg(`Agent online — ComfyUI: ${data.comfy_url}`);
        setConnDetail(`Set URL to ${agentUrl} in AI Panel`);
        return;
      }
    } catch (_) {
      // agent not running, try direct
    }

    // 2. Try direct ComfyUI
    try {
      const res = await fetch(`${directUrl}/system_stats`, {
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        const data = await res.json();
        const gpu = data.devices?.[0]?.name ?? "GPU";
        setConnStatus("ok");
        setConnMsg(`ComfyUI direct — ${gpu}`);
        setConnDetail(`Set URL to ${directUrl} in AI Panel (Electron only)`);
        return;
      }
    } catch (_) {
      // neither reachable
    }

    setConnStatus("error");
    setConnMsg("Not reachable");
    setConnDetail(
      `Agent (${agentUrl}/health) and ComfyUI (${directUrl}) both unreachable. ` +
      "Start ComfyUI then run comfyui_agent.py."
    );
  }, [agentPort, comfyPort]);

  // ─── Render ───────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3">

      {/* ── Quick-start guide ─────────────────────────────── */}
      <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-3 space-y-2">
        <div className="flex items-center gap-2">
          <Rocket className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-xs text-foreground">Quick setup (3 steps)</span>
        </div>
        <ol className="text-[11px] text-muted-foreground space-y-1 list-none pl-5">
          <li><span className="text-primary font-mono mr-2">1.</span>Download the launcher <code className="bg-secondary px-1 rounded">.bat</code> / <code className="bg-secondary px-1 rounded">.sh</code> <em>and</em> <code className="bg-secondary px-1 rounded">comfyui_agent.py</code> — put them in the same folder.</li>
          <li><span className="text-primary font-mono mr-2">2.</span>Run <code className="bg-secondary px-1 rounded">pip install requests websocket-client</code> once, then double-click the launcher.</li>
          <li><span className="text-primary font-mono mr-2">3.</span>In <strong>AI Panel → ComfyUI</strong>, set URL to <code className="bg-secondary px-1 rounded">http://127.0.0.1:{agentPort}</code>, click Connect.</li>
        </ol>
      </div>

      {/* ── Live test connection ───────────────────────────── */}
      <div className="border border-border rounded-lg px-4 py-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs text-foreground">Test Connection</span>
          </div>
          <button
            onClick={handleTestConnection}
            disabled={connStatus === "testing"}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${connStatus === "testing" ? "animate-spin" : ""}`} />
            {connStatus === "testing" ? "Testing..." : "Test Now"}
          </button>
        </div>

        {/* Port settings */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">
              ComfyUI Port
            </label>
            <input
              value={comfyPort}
              onChange={(e) => setComfyPort(e.target.value.replace(/\D/g, ""))}
              className="w-full bg-secondary text-foreground text-xs rounded-md px-2 py-1.5 border border-border focus:border-primary focus:outline-none font-mono"
              placeholder="8188"
              maxLength={5}
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">
              Agent Port
            </label>
            <input
              value={agentPort}
              onChange={(e) => setAgentPort(e.target.value.replace(/\D/g, ""))}
              className="w-full bg-secondary text-foreground text-xs rounded-md px-2 py-1.5 border border-border focus:border-primary focus:outline-none font-mono"
              placeholder="8765"
              maxLength={5}
            />
          </div>
        </div>

        {/* Status */}
        {connStatus !== "idle" && (
          <div className="space-y-1.5">
            <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-md border ${
              connStatus === "ok"    ? "text-green-400 bg-green-400/10 border-green-400/20" :
              connStatus === "error" ? "text-red-400 bg-red-400/10 border-red-400/20" :
                                      "text-yellow-400 bg-yellow-400/10 border-yellow-400/20"
            }`}>
              {connStatus === "ok"    ? <Wifi className="w-3.5 h-3.5 shrink-0" /> :
               connStatus === "error" ? <WifiOff className="w-3.5 h-3.5 shrink-0" /> :
                                        <RefreshCw className="w-3.5 h-3.5 shrink-0 animate-spin" />}
              {connMsg}
            </div>
            {connDetail && (
              <div className="text-[10px] text-muted-foreground/70 px-1">
                {connDetail}
              </div>
            )}
          </div>
        )}

        {/* Connection info box */}
        <div className="bg-secondary/40 rounded-md px-3 py-2 space-y-1">
          <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Use in AI Panel</div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground w-28 shrink-0">Via agent (browser):</span>
            <code className="text-xs text-primary font-mono">http://127.0.0.1:{agentPort}</code>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground w-28 shrink-0">Direct (Electron):</span>
            <code className="text-xs text-foreground/70 font-mono">http://127.0.0.1:{comfyPort}</code>
          </div>
        </div>
      </div>

      {/* ── One-Click Launcher ────────────────────────────── */}
      <CollapsibleSection title="One-Click Launcher" icon={Rocket} defaultOpen={true}>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Downloads a launcher script that starts ComfyUI <em>and</em> the Bridge Agent automatically.
            Place both files in the same folder, then double-click the launcher.
          </p>

          {/* ComfyUI path */}
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1.5">
              ComfyUI Installation Path
            </label>
            <div className="flex items-center gap-2 bg-secondary rounded-md border border-border px-3 py-2">
              <FolderOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <input
                value={comfyPath}
                onChange={(e) => setComfyPath(e.target.value)}
                className="flex-1 bg-transparent text-xs text-foreground focus:outline-none font-mono"
                placeholder="/path/to/ComfyUI"
              />
            </div>
            <p className="text-[10px] text-muted-foreground/60 mt-1">
              Folder containing <code className="bg-secondary px-1 rounded">main.py</code> and the <code className="bg-secondary px-1 rounded">venv</code> folder
            </p>
          </div>

          {/* GPU Preset */}
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1.5">
              GPU Preset
            </label>
            <div className="grid grid-cols-2 gap-2">
              {GPU_PRESETS.map((preset) => {
                const PIcon = preset.icon;
                const active = gpuPreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => handlePresetChange(preset.id)}
                    className={`flex flex-col gap-1 p-2.5 rounded-lg border text-left transition-all ${
                      active
                        ? "border-primary/40 bg-primary/10"
                        : "border-border bg-secondary/30 hover:bg-secondary/60"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <PIcon className={`w-3.5 h-3.5 ${active ? "text-primary" : "text-muted-foreground"}`} />
                      <span className={`text-[11px] ${active ? "text-primary" : "text-foreground"}`}>
                        {preset.label}
                      </span>
                    </div>
                    <span className="text-[9px] text-muted-foreground/70 leading-tight">
                      {preset.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Launch Flags */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                ComfyUI Launch Flags
              </label>
              <span className="text-[10px] text-muted-foreground/50 italic">
                (customize after selecting a preset)
              </span>
            </div>
            <div className="space-y-2">
              {flagCategories.map((cat) => (
                <FlagCategorySection
                  key={cat.id}
                  category={cat}
                  onToggleFlag={handleToggleFlag}
                />
              ))}
            </div>
            <div className="flex items-center gap-3 mt-2.5">
              <button onClick={handleEnableAll} className="text-[10px] text-primary hover:text-primary/80">Enable all</button>
              <button onClick={handleDisableAll} className="text-[10px] text-muted-foreground hover:text-foreground">Disable all</button>
              <span className="text-[10px] text-muted-foreground ml-auto">{enabledCount} of {allFlags.length} enabled</span>
            </div>
          </div>

          {/* Generated flags preview */}
          <div className="bg-background rounded-md border border-border px-3 py-2">
            <div className="text-[10px] text-muted-foreground/60 mb-1">Flags that will be written to the script:</div>
            <code className="text-[10px] text-primary font-mono break-all">
              {getEnabledFlags() || "(none selected)"}
            </code>
          </div>

          {/* Download buttons */}
          <div className="flex items-center gap-2 pt-2 border-t border-border/50">
            <button
              onClick={() => handleDownloadLauncher("bat")}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-xs rounded-md hover:bg-primary/90 transition-colors"
            >
              {copiedLauncher === "bat" ? <Check className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
              Download .bat (Windows)
            </button>
            <button
              onClick={() => handleDownloadLauncher("sh")}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-secondary text-foreground text-xs rounded-md border border-border hover:bg-accent transition-colors"
            >
              {copiedLauncher === "sh" ? <Check className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
              Download .sh (Linux/Mac)
            </button>
          </div>
        </div>
      </CollapsibleSection>

      {/* ── Python Bridge Agent ───────────────────────────── */}
      <CollapsibleSection title="Python Bridge Agent" icon={Terminal} defaultOpen={false}>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            A real HTTP server (<code className="bg-secondary px-1 rounded text-[10px]">http.server</code> + <code className="bg-secondary px-1 rounded text-[10px]">websocket-client</code>) that runs alongside ComfyUI and provides a CORS-enabled bridge for the editor.
            The launcher above starts it automatically if the file is in the same folder.
          </p>

          {/* Endpoints reference */}
          <div className="bg-secondary/30 border border-border/50 rounded-md px-3 py-2.5 space-y-1">
            <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-1.5">Agent API endpoints</div>
            {[
              ["GET",  "/health",       "Agent + ComfyUI status"],
              ["GET",  "/system_stats", "GPU / OS info from ComfyUI"],
              ["GET",  "/object_info",  "Available models, samplers…"],
              ["GET",  "/queue",        "Current queue status"],
              ["POST", "/run_workflow", "Queue workflow JSON → returns images[]"],
              ["POST", "/upload_image", "Upload base64 image → ComfyUI input folder"],
              ["POST", "/interrupt",    "Stop current generation"],
            ].map(([method, path, desc]) => (
              <div key={path} className="flex items-start gap-2 text-[10px]">
                <span className={`shrink-0 font-mono px-1 py-0.5 rounded text-[9px] ${method === "GET" ? "bg-blue-400/10 text-blue-400" : "bg-green-400/10 text-green-400"}`}>{method}</span>
                <code className="text-foreground/70 font-mono shrink-0">{path}</code>
                <span className="text-muted-foreground/60">{desc}</span>
              </div>
            ))}
          </div>

          {/* Setup steps */}
          <div className="space-y-1.5">
            <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Setup</div>
            <ol className="text-xs text-muted-foreground space-y-1.5 list-none">
              {[
                <>Install deps: <code className="bg-secondary text-foreground px-1.5 py-0.5 rounded text-[10px] font-mono">pip install requests websocket-client</code></>,
                <>Download <code className="bg-secondary text-foreground px-1.5 py-0.5 rounded text-[10px] font-mono">comfyui_agent.py</code> and place it in the same folder as the launcher script.</>,
                <>Start ComfyUI, wait for it to load, then double-click the launcher (or run <code className="bg-secondary text-foreground px-1.5 py-0.5 rounded text-[10px] font-mono">python comfyui_agent.py</code>).</>,
                <>In <strong>AI Panel → ComfyUI</strong>, set URL to <code className="bg-secondary text-foreground px-1.5 py-0.5 rounded text-[10px] font-mono">http://127.0.0.1:{agentPort}</code> and click Connect.</>,
              ].map((step, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-primary font-mono shrink-0">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleDownloadAgent}
              className="flex items-center gap-1.5 px-3 py-2 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              <FileCode className="w-3.5 h-3.5" />
              Download comfyui_agent.py
            </button>
            <button
              onClick={handleCopyScript}
              className="flex items-center gap-1.5 px-3 py-2 text-xs bg-secondary text-foreground rounded-md border border-border hover:bg-accent transition-colors"
            >
              {copiedScript ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedScript ? "Copied!" : "Copy script"}
            </button>
            <button
              onClick={() => setShowScript(!showScript)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs bg-secondary text-muted-foreground rounded-md border border-border hover:text-foreground transition-colors"
            >
              {showScript ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showScript ? "Hide" : "Preview"}
            </button>
          </div>

          {showScript && (
            <pre className="bg-background text-foreground text-[10px] font-mono rounded-md border border-border p-3 max-h-72 overflow-auto leading-relaxed whitespace-pre">
              {buildAgentScript(parseInt(agentPort) || 8765)}
            </pre>
          )}
        </div>
      </CollapsibleSection>

      {/* ── Troubleshooting ───────────────────────────────── */}
      <CollapsibleSection title="Troubleshooting" icon={AlertCircle} defaultOpen={false}>
        <div className="space-y-2.5">
          {[
            {
              q: "\"Connection refused\" when clicking Test",
              a: "ComfyUI isn't running or is on a different port. Launch it with the .bat / .sh script first.",
            },
            {
              q: "CORS error in browser",
              a: "Use the Bridge Agent (port " + agentPort + ") instead of connecting directly to ComfyUI. The agent adds the necessary CORS headers.",
            },
            {
              q: "Agent starts but Test still fails",
              a: "The agent waits for ComfyUI before starting. Check the agent terminal window — it prints '✓ ComfyUI is online!' when ready.",
            },
            {
              q: "Workflow queued but no images returned",
              a: "Make sure your workflow has a SaveImage or PreviewImage node. The agent fetches images from ComfyUI's /history endpoint.",
            },
            {
              q: "Electron app — do I need the agent?",
              a: "No. In Electron you can connect directly to http://127.0.0.1:" + comfyPort + " — CORS restrictions don't apply to native apps.",
            },
          ].map(({ q, a }) => (
            <div key={q} className="border border-border/40 rounded-md px-3 py-2.5 space-y-1">
              <div className="text-xs text-foreground flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-0.5" />
                {q}
              </div>
              <div className="text-[11px] text-muted-foreground pl-5">{a}</div>
            </div>
          ))}
        </div>
      </CollapsibleSection>
    </div>
  );
}
