/**
 * Real ComfyUI HTTP + WebSocket client.
 * Handles connection testing, workflow queueing, progress tracking,
 * and output image retrieval.
 */

// ─── Types ────────────────────────────────────────────────────────────

export interface ComfySystemStats {
  system: {
    os: string;
    python_version: string;
    embedded_python: boolean;
  };
  devices: Array<{
    name: string;
    type: string;
    vram_total: number;
    vram_free: number;
    torch_vram_total: number;
    torch_vram_free: number;
  }>;
}

export interface ComfyPromptResponse {
  prompt_id: string;
  number: number;
  node_errors: Record<string, unknown>;
}

export interface ComfyProgressEvent {
  type: "progress" | "executing" | "executed" | "execution_start" | "execution_error" | "execution_cached" | "status";
  data: Record<string, unknown>;
}

export interface ComfyHistoryOutput {
  images?: Array<{
    filename: string;
    subfolder: string;
    type: string;
  }>;
}

export interface ComfyHistoryEntry {
  prompt: unknown[];
  outputs: Record<string, ComfyHistoryOutput>;
  status: {
    status_str: string;
    completed: boolean;
  };
}

export type ProgressCallback = (event: ComfyProgressEvent) => void;

// ─── Client ───────────────────────────────────────────────────────────

export class ComfyUIClient {
  private baseUrl: string;
  private clientId: string;
  private ws: WebSocket | null = null;
  private progressCallbacks: Map<string, ProgressCallback> = new Map();
  private completionResolvers: Map<string, (promptId: string) => void> = new Map();

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.clientId = `ai-canvas-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  // ─── Connection ───────────────────────────────────────────────

  /**
   * Test connection to ComfyUI server and return system stats.
   */
  async testConnection(): Promise<ComfySystemStats> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/system_stats`, {
        method: "GET",
        signal: AbortSignal.timeout(8000),
      });
    } catch (fetchErr: any) {
      // Differentiate timeout from network/CORS errors
      if (fetchErr?.name === "TimeoutError") {
        throw new Error(`Connection timed out — is ComfyUI running at ${this.baseUrl}?`);
      }
      throw new Error(
        `Failed to reach ${this.baseUrl}. ` +
        `Ensure ComfyUI is running with --enable-cors-header and --listen 0.0.0.0.`
      );
    }
    if (!res.ok) throw new Error(`ComfyUI responded with ${res.status} ${res.statusText}`);
    return res.json();
  }

  /**
   * Connect WebSocket for progress tracking.
   */
  connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      // http:// → ws://, https:// → wss://
      const wsUrl = this.baseUrl.replace(/^https?/, (m) => m === "https" ? "wss" : "ws");
      this.ws = new WebSocket(`${wsUrl}/ws?clientId=${this.clientId}`);

      this.ws.onopen = () => {
        console.log("[ComfyUI WS] Connected");
        resolve();
      };

      this.ws.onerror = (err) => {
        console.error("[ComfyUI WS] Error:", err);
        reject(new Error("WebSocket connection failed"));
      };

      this.ws.onclose = () => {
        console.log("[ComfyUI WS] Disconnected");
        this.ws = null;
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as ComfyProgressEvent;
          this.handleWsMessage(msg);
        } catch {
          // Binary data (preview images) — skip for now
        }
      };
    });
  }

  private handleWsMessage(msg: ComfyProgressEvent) {
    // Broadcast to all registered callbacks
    for (const cb of this.progressCallbacks.values()) {
      cb(msg);
    }

    // Check for execution completion
    if (msg.type === "executed") {
      const promptId = (msg.data as any)?.prompt_id;
      if (promptId && this.completionResolvers.has(promptId)) {
        this.completionResolvers.get(promptId)!(promptId);
        this.completionResolvers.delete(promptId);
      }
    }

    // Check for errors
    if (msg.type === "execution_error") {
      const promptId = (msg.data as any)?.prompt_id;
      if (promptId && this.completionResolvers.has(promptId)) {
        // Still resolve — caller checks history for error details
        this.completionResolvers.get(promptId)!(promptId);
        this.completionResolvers.delete(promptId);
      }
    }
  }

  disconnectWebSocket() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // ─── Workflow Execution ───────────────────────────────────────

  /**
   * Upload an image to ComfyUI for use in LoadImage nodes.
   * Returns the filename that can be used in workflow JSON.
   */
  async uploadImage(
    imageBlob: Blob,
    filename: string,
    subfolder: string = "",
    overwrite: boolean = true
  ): Promise<{ name: string; subfolder: string; type: string }> {
    const formData = new FormData();
    formData.append("image", imageBlob, filename);
    if (subfolder) formData.append("subfolder", subfolder);
    formData.append("overwrite", overwrite.toString());

    const res = await fetch(`${this.baseUrl}/upload/image`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    return res.json();
  }

  /**
   * Queue a workflow prompt for execution.
   */
  async queuePrompt(
    workflow: Record<string, unknown>,
    extraData?: Record<string, unknown>
  ): Promise<ComfyPromptResponse> {
    const body: Record<string, unknown> = {
      prompt: workflow,
      client_id: this.clientId,
    };
    if (extraData) body.extra_data = extraData;

    const res = await fetch(`${this.baseUrl}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Queue failed: ${res.status} — ${errorText}`);
    }
    return res.json();
  }

  /**
   * Get execution history for a prompt.
   */
  async getHistory(promptId: string): Promise<ComfyHistoryEntry> {
    const res = await fetch(`${this.baseUrl}/history/${promptId}`);
    if (!res.ok) throw new Error(`History fetch failed: ${res.status}`);
    const data = await res.json();
    return data[promptId];
  }

  /**
   * Download an output image from ComfyUI.
   */
  async getImage(
    filename: string,
    subfolder: string = "",
    type: string = "output"
  ): Promise<Blob> {
    const params = new URLSearchParams({ filename, subfolder, type });
    const res = await fetch(`${this.baseUrl}/view?${params}`);
    if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);
    return res.blob();
  }

  /**
   * Get available models/checkpoints from object_info endpoint.
   */
  async getObjectInfo(): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.baseUrl}/object_info`);
    if (!res.ok) throw new Error(`Object info failed: ${res.status}`);
    return res.json();
  }

  /**
   * Get available checkpoint names.
   */
  async getCheckpoints(): Promise<string[]> {
    try {
      const info = await this.getObjectInfo();
      const loader = info["CheckpointLoaderSimple"] as any;
      return loader?.input?.required?.ckpt_name?.[0] || [];
    } catch {
      return [];
    }
  }

  /**
   * Get available LoRA names.
   */
  async getLoRAs(): Promise<string[]> {
    try {
      const info = await this.getObjectInfo();
      const loader = info["LoraLoader"] as any;
      return loader?.input?.required?.lora_name?.[0] || [];
    } catch {
      return [];
    }
  }

  /**
   * Cancel the current queue.
   */
  async cancelQueue(): Promise<void> {
    await fetch(`${this.baseUrl}/queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clear: true }),
    });
  }

  /**
   * Interrupt current execution.
   */
  async interrupt(): Promise<void> {
    await fetch(`${this.baseUrl}/interrupt`, { method: "POST" });
  }

  // ─── High-Level: Run Workflow and Get Results ──────────────────

  /**
   * Full pipeline: queue workflow → wait for completion → fetch output images.
   * Returns an array of image data URLs.
   */
  async runWorkflow(
    workflow: Record<string, unknown>,
    onProgress?: ProgressCallback
  ): Promise<string[]> {
    // Ensure WebSocket is connected for progress tracking
    await this.connectWebSocket();

    // Register progress callback
    const cbId = `run-${Date.now()}`;
    if (onProgress) {
      this.progressCallbacks.set(cbId, onProgress);
    }

    try {
      // Queue the prompt
      const promptRes = await this.queuePrompt(workflow);
      const promptId = promptRes.prompt_id;

      if (Object.keys(promptRes.node_errors || {}).length > 0) {
        throw new Error(
          `Node errors: ${JSON.stringify(promptRes.node_errors)}`
        );
      }

      // Wait for completion via WebSocket
      await new Promise<string>((resolve, reject) => {
        this.completionResolvers.set(promptId, resolve);

        // Timeout after 5 minutes
        setTimeout(() => {
          if (this.completionResolvers.has(promptId)) {
            this.completionResolvers.delete(promptId);
            reject(new Error("Workflow execution timed out (5 min)"));
          }
        }, 300000);
      });

      // Fetch history to get output images
      const history = await this.getHistory(promptId);
      if (!history) throw new Error("No history found for prompt");

      // Collect all output images
      const imageUrls: string[] = [];
      for (const output of Object.values(history.outputs)) {
        if (output.images) {
          for (const img of output.images) {
            const blob = await this.getImage(
              img.filename,
              img.subfolder,
              img.type
            );
            // Convert blob to data URL
            const dataUrl = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
            imageUrls.push(dataUrl);
          }
        }
      }

      return imageUrls;
    } finally {
      this.progressCallbacks.delete(cbId);
    }
  }

  // ─── Upload Image to ComfyUI and Set in Workflow ──────────────

  /**
   * Upload a canvas data URL as an image to ComfyUI, then set the
   * corresponding LoadImage node's "image" field to the uploaded filename.
   */
  async uploadAndSetImage(
    workflow: Record<string, unknown>,
    nodeId: string,
    imageDataUrl: string,
    imageName: string = "canvas_input.png"
  ): Promise<Record<string, unknown>> {
    // Convert data URL to blob
    const [header, base64] = imageDataUrl.split(",");
    const mime = header.match(/:(.*?);/)?.[1] || "image/png";
    const binary = atob(base64);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      array[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([array], { type: mime });

    // Upload to ComfyUI
    const uploadResult = await this.uploadImage(blob, imageName);

    // Set the node's image input
    const modified = JSON.parse(JSON.stringify(workflow));
    if (modified[nodeId]?.inputs) {
      modified[nodeId].inputs.image = uploadResult.name;
    }

    return modified;
  }
}

// ─── Singleton Client Manager ─────────────────────────────────────────
let clientInstance: ComfyUIClient | null = null;
let currentUrl = "";

export function getComfyClient(url: string): ComfyUIClient {
  if (!clientInstance || currentUrl !== url) {
    if (clientInstance) clientInstance.disconnectWebSocket();
    clientInstance = new ComfyUIClient(url);
    currentUrl = url;
  }
  return clientInstance;
}
