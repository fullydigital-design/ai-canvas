import { useRef } from "react";
import { FileJson, Upload } from "lucide-react";

interface ComfyWorkflowJsonEditorProps {
  workflowName: string;
  jsonText: string;
  parseError: string | null;
  onWorkflowNameChange: (value: string) => void;
  onJsonTextChange: (value: string) => void;
  onImportText: (text: string) => void;
  onParse: () => void;
}

export function ComfyWorkflowJsonEditor({
  workflowName,
  jsonText,
  parseError,
  onWorkflowNameChange,
  onJsonTextChange,
  onImportText,
  onParse,
}: ComfyWorkflowJsonEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onImportText((reader.result as string) || "");
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex items-center gap-2">
        <input
          value={workflowName}
          onChange={(e) => onWorkflowNameChange(e.target.value)}
          placeholder="Workflow name (optional)"
          className="flex-1 bg-secondary text-foreground text-xs rounded-md px-3 py-2 border border-border focus:border-primary focus:outline-none"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary/10 text-primary text-xs rounded-md border border-primary/20 hover:bg-primary/20 transition-colors"
        >
          <Upload className="w-3.5 h-3.5" />
          Import JSON File
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileImport}
          className="hidden"
        />
      </div>

      <div className="text-xs text-muted-foreground">
        Paste your ComfyUI workflow JSON (API format). Export from ComfyUI → Save
        (API Format).
      </div>

      <textarea
        value={jsonText}
        onChange={(e) => onJsonTextChange(e.target.value)}
        placeholder='{ "3": { "class_type": "KSampler", "inputs": { ... } }, ... }'
        className="flex-1 bg-background text-foreground text-xs font-mono rounded-md px-3 py-2 border border-border focus:border-primary focus:outline-none resize-none"
      />

      {parseError && (
        <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
          {parseError}
        </div>
      )}

      <button
        onClick={onParse}
        disabled={!jsonText.trim()}
        className="self-end flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-xs rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <FileJson className="w-3.5 h-3.5" />
        Parse Workflow
      </button>
    </div>
  );
}
