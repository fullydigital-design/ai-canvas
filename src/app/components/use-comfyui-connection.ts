import { useCallback, useState } from "react";
import type { ConnStatus } from "./comfyui-connection-types";

interface UseComfyUiConnectionResult {
  connStatus: ConnStatus;
  connMsg: string;
  connDetail: string | null;
  handleTestConnection: () => Promise<void>;
}

export function useComfyUiConnection(
  agentPort: string,
  comfyPort: string
): UseComfyUiConnectionResult {
  const [connStatus, setConnStatus] = useState<ConnStatus>("idle");
  const [connMsg, setConnMsg] = useState("");
  const [connDetail, setConnDetail] = useState<string | null>(null);

  const handleTestConnection = useCallback(async () => {
    setConnStatus("testing");
    setConnMsg("Connecting...");
    setConnDetail(null);

    const agentUrl = `http://127.0.0.1:${agentPort}`;
    const directUrl = `http://127.0.0.1:${comfyPort}`;

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
    } catch {
      // Agent not running, fallback to direct ComfyUI.
    }

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
    } catch {
      // Neither endpoint reachable.
    }

    setConnStatus("error");
    setConnMsg("Not reachable");
    setConnDetail(
      `Agent (${agentUrl}/health) and ComfyUI (${directUrl}) both unreachable. ` +
        "Start ComfyUI then run comfyui_agent.py."
    );
  }, [agentPort, comfyPort]);

  return { connStatus, connMsg, connDetail, handleTestConnection };
}
