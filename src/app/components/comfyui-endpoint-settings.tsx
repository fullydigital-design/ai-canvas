import { RefreshCw, Server, Wifi, WifiOff } from "lucide-react";
import type { ConnStatus } from "./comfyui-connection-types";

interface ComfyEndpointSettingsProps {
  comfyPort: string;
  agentPort: string;
  connStatus: ConnStatus;
  connMsg: string;
  connDetail: string | null;
  onChangeComfyPort: (value: string) => void;
  onChangeAgentPort: (value: string) => void;
  onTestConnection: () => void | Promise<void>;
}

export function ComfyEndpointSettings({
  comfyPort,
  agentPort,
  connStatus,
  connMsg,
  connDetail,
  onChangeComfyPort,
  onChangeAgentPort,
  onTestConnection,
}: ComfyEndpointSettingsProps) {
  return (
    <div className="border border-border rounded-lg px-4 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs text-foreground">Test Connection</span>
        </div>
        <button
          onClick={onTestConnection}
          disabled={connStatus === "testing"}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          <RefreshCw
            className={`w-3 h-3 ${connStatus === "testing" ? "animate-spin" : ""}`}
          />
          {connStatus === "testing" ? "Testing..." : "Test Now"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">
            ComfyUI Port
          </label>
          <input
            value={comfyPort}
            onChange={(e) => onChangeComfyPort(e.target.value)}
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
            onChange={(e) => onChangeAgentPort(e.target.value)}
            className="w-full bg-secondary text-foreground text-xs rounded-md px-2 py-1.5 border border-border focus:border-primary focus:outline-none font-mono"
            placeholder="8765"
            maxLength={5}
          />
        </div>
      </div>

      {connStatus !== "idle" && (
        <div className="space-y-1.5">
          <div
            className={`flex items-center gap-2 text-xs px-3 py-2 rounded-md border ${
              connStatus === "ok"
                ? "text-green-400 bg-green-400/10 border-green-400/20"
                : connStatus === "error"
                  ? "text-red-400 bg-red-400/10 border-red-400/20"
                  : "text-yellow-400 bg-yellow-400/10 border-yellow-400/20"
            }`}
          >
            {connStatus === "ok" ? (
              <Wifi className="w-3.5 h-3.5 shrink-0" />
            ) : connStatus === "error" ? (
              <WifiOff className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 shrink-0 animate-spin" />
            )}
            {connMsg}
          </div>
          {connDetail && (
            <div className="text-[10px] text-muted-foreground/70 px-1">
              {connDetail}
            </div>
          )}
        </div>
      )}

      <div className="bg-secondary/40 rounded-md px-3 py-2 space-y-1">
        <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">
          Use in AI Panel
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground w-28 shrink-0">
            Via agent (browser):
          </span>
          <code className="text-xs text-primary font-mono">
            http://127.0.0.1:{agentPort}
          </code>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground w-28 shrink-0">
            Direct (Electron):
          </span>
          <code className="text-xs text-foreground/70 font-mono">
            http://127.0.0.1:{comfyPort}
          </code>
        </div>
      </div>
    </div>
  );
}
