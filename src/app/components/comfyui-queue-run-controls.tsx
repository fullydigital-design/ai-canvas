export function ComfyQueueRunControls() {
  return (
    <div className="bg-secondary/30 border border-border/50 rounded-md px-3 py-2.5 space-y-1">
      <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-1.5">
        Agent API endpoints
      </div>
      {[
        ["GET", "/health", "Agent + ComfyUI status"],
        ["GET", "/system_stats", "GPU / OS info from ComfyUI"],
        ["GET", "/object_info", "Available models, samplers…"],
        ["GET", "/queue", "Current queue status"],
        ["POST", "/run_workflow", "Queue workflow JSON → returns images[]"],
        ["POST", "/upload_image", "Upload base64 image → ComfyUI input folder"],
        ["POST", "/interrupt", "Stop current generation"],
      ].map(([method, path, desc]) => (
        <div key={path} className="flex items-start gap-2 text-[10px]">
          <span
            className={`shrink-0 font-mono px-1 py-0.5 rounded text-[9px] ${
              method === "GET"
                ? "bg-blue-400/10 text-blue-400"
                : "bg-green-400/10 text-green-400"
            }`}
          >
            {method}
          </span>
          <code className="text-foreground/70 font-mono shrink-0">{path}</code>
          <span className="text-muted-foreground/60">{desc}</span>
        </div>
      ))}
    </div>
  );
}
