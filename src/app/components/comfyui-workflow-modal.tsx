import { useEffect, useState } from "react";
import {
  X,
  SlidersHorizontal,
  RefreshCw,
  Trash2,
  GripVertical,
  FileJson,
  Play,
  LoaderCircle,
  Server,
  Search,
  Settings2,
  Hash,
  Type,
  ToggleLeft,
  List,
  Shuffle,
} from "lucide-react";

import { ConnectPanel } from "./comfyui-connect-panel";
import { ComfyNodeBrowser } from "./comfyui-node-browser";
import { ComfyWorkflowJsonEditor } from "./comfyui-workflow-json-editor";
import {
  getDefaultOptions,
  guessParamType,
  parseWorkflowText,
} from "./comfyui-workflow-utils";

// ─── Types ───────────────────────────────────────────────────
export interface ComfyNode {
  id: string;
  class_type: string;
  inputs: Record<string, unknown>;
}

export interface ExposedParam {
  nodeId: string;
  nodeClass: string;
  fieldName: string;
  label: string;
  type: "slider" | "number" | "text" | "select" | "seed" | "toggle";
  value: unknown;
  defaultValue: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  order: number;
}

export interface ComfyWorkflowData {
  id: string;
  name: string;
  description: string;
  nodes: ComfyNode[];
  rawJson: Record<string, unknown>;
  exposedParams: ExposedParam[];
}

const TYPE_ICON: Record<ExposedParam["type"], React.ElementType> = {
  slider: SlidersHorizontal,
  number: Hash,
  text: Type,
  select: List,
  seed: Shuffle,
  toggle: ToggleLeft,
};

// ─── Exposed Params Panel ────────────────────────────────────
function ExposedParamsPanel({
  params,
  onUpdateParam,
  onRemoveParam,
  onReorder,
}: {
  params: ExposedParam[];
  onUpdateParam: (index: number, updates: Partial<ExposedParam>) => void;
  onRemoveParam: (index: number) => void;
  onReorder: (from: number, to: number) => void;
}) {
  const sorted = [...params].sort((a, b) => a.order - b.order);

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
        <SlidersHorizontal className="w-8 h-8 opacity-40" />
        <div className="text-xs text-center">
          No exposed parameters yet
          <br />
          <span className="text-muted-foreground/60">
            Browse nodes and click on fields to expose them
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 overflow-y-auto h-full pr-1">
      {sorted.map((param, i) => {
        const TypeIcon = TYPE_ICON[param.type];
        return (
          <div
            key={`${param.nodeId}-${param.fieldName}`}
            className="border border-border rounded-md p-2.5 bg-background/50"
          >
            {/* Param header row */}
            <div className="flex items-center gap-2 mb-2">
              <GripVertical className="w-3 h-3 text-muted-foreground/30 cursor-grab shrink-0" />
              <span className="text-[10px] text-muted-foreground bg-secondary rounded px-1.5 py-0.5">
                #{param.nodeId}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {param.fieldName}
              </span>
              <button
                onClick={() => onRemoveParam(params.indexOf(param))}
                className="ml-auto p-0.5 text-muted-foreground hover:text-destructive rounded transition-colors"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>

            {/* Label */}
            <div className="grid grid-cols-[1fr_auto] gap-2 mb-2">
              <input
                value={param.label}
                onChange={(e) =>
                  onUpdateParam(params.indexOf(param), {
                    label: e.target.value,
                  })
                }
                className="w-full bg-secondary text-foreground text-xs rounded px-2 py-1.5 border border-border focus:border-primary focus:outline-none"
                placeholder="Label"
              />
              <select
                value={param.type}
                onChange={(e) => {
                  const type = e.target.value as ExposedParam["type"];
                  const updates: Partial<ExposedParam> = { type };
                  if (type === "slider") {
                    updates.min = param.min ?? 0;
                    updates.max = param.max ?? 100;
                    updates.step = param.step ?? 1;
                  }
                  onUpdateParam(params.indexOf(param), updates);
                }}
                className="bg-secondary text-foreground text-xs rounded px-2 py-1.5 border border-border w-24"
              >
                <option value="slider">Slider</option>
                <option value="number">Number</option>
                <option value="text">Text</option>
                <option value="select">Select</option>
                <option value="seed">Seed</option>
                <option value="toggle">Toggle</option>
              </select>
            </div>

            {/* Type-specific config */}
            {param.type === "slider" && (
              <div className="grid grid-cols-4 gap-1.5 mb-2">
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">
                    Default
                  </label>
                  <input
                    type="number"
                    value={param.value as number}
                    onChange={(e) =>
                      onUpdateParam(params.indexOf(param), {
                        value: Number(e.target.value),
                      })
                    }
                    className="w-full bg-secondary text-xs rounded px-1.5 py-1 border border-border text-foreground"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">
                    Min
                  </label>
                  <input
                    type="number"
                    value={param.min ?? 0}
                    onChange={(e) =>
                      onUpdateParam(params.indexOf(param), {
                        min: Number(e.target.value),
                      })
                    }
                    className="w-full bg-secondary text-xs rounded px-1.5 py-1 border border-border text-foreground"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">
                    Max
                  </label>
                  <input
                    type="number"
                    value={param.max ?? 100}
                    onChange={(e) =>
                      onUpdateParam(params.indexOf(param), {
                        max: Number(e.target.value),
                      })
                    }
                    className="w-full bg-secondary text-xs rounded px-1.5 py-1 border border-border text-foreground"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">
                    Step
                  </label>
                  <input
                    type="number"
                    value={param.step ?? 1}
                    onChange={(e) =>
                      onUpdateParam(params.indexOf(param), {
                        step: Number(e.target.value),
                      })
                    }
                    className="w-full bg-secondary text-xs rounded px-1.5 py-1 border border-border text-foreground"
                  />
                </div>
              </div>
            )}

            {param.type === "number" && (
              <div className="mb-2">
                <label className="text-[10px] text-muted-foreground block mb-0.5">
                  Default
                </label>
                <input
                  type="number"
                  value={param.value as number}
                  onChange={(e) =>
                    onUpdateParam(params.indexOf(param), {
                      value: Number(e.target.value),
                    })
                  }
                  className="w-full bg-secondary text-xs rounded px-2 py-1 border border-border text-foreground"
                />
              </div>
            )}

            {param.type === "text" && (
              <div className="mb-2">
                <label className="text-[10px] text-muted-foreground block mb-0.5">
                  Default
                </label>
                <textarea
                  value={param.value as string}
                  onChange={(e) =>
                    onUpdateParam(params.indexOf(param), {
                      value: e.target.value,
                    })
                  }
                  rows={2}
                  className="w-full bg-secondary text-xs rounded px-2 py-1 border border-border resize-none text-foreground"
                />
              </div>
            )}

            {param.type === "select" && (
              <div className="mb-2">
                <label className="text-[10px] text-muted-foreground block mb-0.5">
                  Options (comma-separated)
                </label>
                <input
                  value={(param.options ?? []).join(", ")}
                  onChange={(e) =>
                    onUpdateParam(params.indexOf(param), {
                      options: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  className="w-full bg-secondary text-xs rounded px-2 py-1 border border-border text-foreground"
                  placeholder="option1, option2, ..."
                />
              </div>
            )}

            {param.type === "seed" && (
              <div className="flex items-center gap-2 mb-2">
                <label className="text-[10px] text-muted-foreground">
                  Default
                </label>
                <input
                  type="number"
                  value={param.value as number}
                  onChange={(e) =>
                    onUpdateParam(params.indexOf(param), {
                      value: Number(e.target.value),
                    })
                  }
                  className="flex-1 bg-secondary text-xs rounded px-2 py-1 border border-border text-foreground"
                />
                <button
                  onClick={() =>
                    onUpdateParam(params.indexOf(param), {
                      value: Math.floor(Math.random() * 999999999999),
                    })
                  }
                  className="p-1 hover:bg-accent rounded"
                >
                  <RefreshCw className="w-3 h-3 text-muted-foreground" />
                </button>
              </div>
            )}

            {/* Type badge */}
            <div className="flex items-center gap-1.5">
              <TypeIcon className="w-3 h-3 text-primary" />
              <span className="text-[10px] text-primary uppercase">{param.type}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Run Panel (parameter values) ────────────────────────────
function RunParamsPanel({
  params,
  values,
  onChangeValue,
}: {
  params: ExposedParam[];
  values: Record<string, unknown>;
  onChangeValue: (key: string, val: unknown) => void;
}) {
  const sorted = [...params].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-3 overflow-y-auto h-full">
      {sorted.map((param) => {
        const key = `${param.nodeId}.${param.fieldName}`;
        const val = values[key] ?? param.value;

        return (
          <div key={key}>
            <label className="text-xs text-muted-foreground block mb-1">
              {param.label}
            </label>

            {param.type === "slider" && (
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={param.min ?? 0}
                  max={param.max ?? 100}
                  step={param.step ?? 1}
                  value={val as number}
                  onChange={(e) => onChangeValue(key, Number(e.target.value))}
                  className="flex-1 accent-primary h-1"
                />
                <input
                  type="number"
                  value={val as number}
                  min={param.min}
                  max={param.max}
                  step={param.step}
                  onChange={(e) => onChangeValue(key, Number(e.target.value))}
                  className="w-16 bg-secondary text-xs rounded px-2 py-1 border border-border text-foreground text-right"
                />
              </div>
            )}

            {param.type === "number" && (
              <input
                type="number"
                value={val as number}
                onChange={(e) => onChangeValue(key, Number(e.target.value))}
                className="w-full bg-secondary text-xs rounded px-2 py-1.5 border border-border text-foreground"
              />
            )}

            {param.type === "text" && (
              <textarea
                value={val as string}
                onChange={(e) => onChangeValue(key, e.target.value)}
                rows={2}
                className="w-full bg-secondary text-xs rounded px-2 py-1.5 border border-border resize-none text-foreground focus:border-primary focus:outline-none"
              />
            )}

            {param.type === "select" && (
              <select
                value={val as string}
                onChange={(e) => onChangeValue(key, e.target.value)}
                className="w-full bg-secondary text-xs rounded px-2 py-1.5 border border-border text-foreground"
              >
                {(param.options ?? []).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            )}

            {param.type === "seed" && (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={val as number}
                  onChange={(e) => onChangeValue(key, Number(e.target.value))}
                  className="flex-1 bg-secondary text-xs rounded px-2 py-1.5 border border-border text-foreground"
                />
                <button
                  onClick={() =>
                    onChangeValue(
                      key,
                      Math.floor(Math.random() * 999999999999)
                    )
                  }
                  className="p-1.5 hover:bg-accent rounded border border-border"
                  title="Random seed"
                >
                  <RefreshCw className="w-3 h-3 text-muted-foreground" />
                </button>
              </div>
            )}

            {param.type === "toggle" && (
              <button
                onClick={() => onChangeValue(key, !(val as boolean))}
                className={`px-3 py-1.5 rounded text-xs border transition-colors ${
                  val
                    ? "bg-primary/20 border-primary/30 text-primary"
                    : "bg-secondary border-border text-muted-foreground"
                }`}
              >
                {val ? "Enabled" : "Disabled"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Modal ──────────────────────────────────────────────
interface ComfyWorkflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  workflow: ComfyWorkflowData | null;
  onSetWorkflow: (wf: ComfyWorkflowData) => void;
  onRun: (workflow: ComfyWorkflowData, values: Record<string, unknown>) => void;
  isRunning: boolean;
}

type ModalTab = "connect" | "json" | "nodes" | "exposed" | "run";

export function ComfyWorkflowModal({
  isOpen,
  onClose,
  workflow,
  onSetWorkflow,
  onRun,
  isRunning,
}: ComfyWorkflowModalProps) {
  const [activeTab, setActiveTab] = useState<ModalTab>(
    workflow ? "run" : "json"
  );
  const [jsonText, setJsonText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [runValues, setRunValues] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (isOpen && workflow) {
      setActiveTab("run");
      // Init run values from exposed params
      const vals: Record<string, unknown> = {};
      workflow.exposedParams.forEach((p) => {
        vals[`${p.nodeId}.${p.fieldName}`] = p.value;
      });
      setRunValues(vals);
    } else if (isOpen && !workflow) {
      setActiveTab("json");
    }
  }, [isOpen, workflow]);

  const handleImportText = (text: string) => {
    setJsonText(text);
    const { workflow: parsedWorkflow, error } = parseWorkflowText(
      text,
      workflowName
    );
    setParseError(error);
    if (parsedWorkflow) {
      onSetWorkflow(parsedWorkflow);
      setActiveTab("nodes");
    }
  };

  const handleParseJson = () => {
    const { workflow: parsedWorkflow, error } = parseWorkflowText(
      jsonText,
      workflowName
    );
    setParseError(error);
    if (parsedWorkflow) {
      onSetWorkflow(parsedWorkflow);
      setActiveTab("nodes");
    }
  };

  const handleToggleExpose = (
    nodeId: string,
    fieldName: string,
    value: unknown
  ) => {
    if (!workflow) return;
    const existing = workflow.exposedParams.findIndex(
      (p) => p.nodeId === nodeId && p.fieldName === fieldName
    );
    let newParams: ExposedParam[];
    if (existing >= 0) {
      newParams = workflow.exposedParams.filter((_, i) => i !== existing);
    } else {
      const node = workflow.nodes.find((n) => n.id === nodeId)!;
      const guess = guessParamType(fieldName, value);
      const newParam: ExposedParam = {
        nodeId,
        nodeClass: node.class_type,
        fieldName,
        label: fieldName
          .replace(/_/g, " ")
          .replace(/\b\w/g, (l) => l.toUpperCase()),
        value,
        defaultValue: value,
        order: workflow.exposedParams.length,
        options: getDefaultOptions(fieldName),
        ...guess,
      };
      newParams = [...workflow.exposedParams, newParam];
    }
    onSetWorkflow({ ...workflow, exposedParams: newParams });
  };

  const handleUpdateParam = (index: number, updates: Partial<ExposedParam>) => {
    if (!workflow) return;
    const newParams = [...workflow.exposedParams];
    newParams[index] = { ...newParams[index], ...updates };
    onSetWorkflow({ ...workflow, exposedParams: newParams });
  };

  const handleRemoveParam = (index: number) => {
    if (!workflow) return;
    const newParams = workflow.exposedParams.filter((_, i) => i !== index);
    onSetWorkflow({ ...workflow, exposedParams: newParams });
  };

  const handleReorder = (from: number, to: number) => {
    if (!workflow) return;
    const newParams = [...workflow.exposedParams];
    const [moved] = newParams.splice(from, 1);
    newParams.splice(to, 0, moved);
    newParams.forEach((p, i) => (p.order = i));
    onSetWorkflow({ ...workflow, exposedParams: newParams });
  };

  const handleRun = () => {
    if (!workflow) return;
    onRun(workflow, runValues);
  };

  if (!isOpen) return null;

  const tabs: { id: ModalTab; label: string; icon: React.ElementType; count?: number }[] = [
    { id: "connect", label: "Connect", icon: Server },
    { id: "json", label: "Workflow JSON", icon: FileJson },
    {
      id: "nodes",
      label: `Node Browser${workflow ? ` (${workflow.nodes.length})` : ""}`,
      icon: Search,
    },
    {
      id: "exposed",
      label: `Exposed${workflow ? ` (${workflow.exposedParams.length})` : " (0)"}`,
      icon: SlidersHorizontal,
    },
    { id: "run", label: "Run", icon: Play },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-[90vw] max-w-[860px] h-[80vh] max-h-[700px] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
          <Server className="w-4 h-4 text-primary" />
          <span className="text-sm text-foreground">
            ComfyUI Workflow
          </span>
          {workflow && (
            <span className="text-xs text-muted-foreground">
              — {workflow.name}
            </span>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border shrink-0">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const disabled =
              (tab.id === "nodes" || tab.id === "exposed" || tab.id === "run") &&
              !workflow;
            return (
              <button
                key={tab.id}
                onClick={() => !disabled && setActiveTab(tab.id)}
                disabled={disabled}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs transition-colors ${
                  activeTab === tab.id
                    ? "text-primary border-b-2 border-primary"
                    : disabled
                    ? "text-muted-foreground/30 cursor-not-allowed"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden p-4">
          {/* JSON Tab */}
          {activeTab === "json" && (
            <ComfyWorkflowJsonEditor
              workflowName={workflowName}
              jsonText={jsonText}
              parseError={parseError}
              onWorkflowNameChange={setWorkflowName}
              onJsonTextChange={setJsonText}
              onImportText={handleImportText}
              onParse={handleParseJson}
            />
          )}

          {/* Node Browser Tab */}
          {activeTab === "nodes" && workflow && (
            <div className="flex flex-col h-full gap-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search nodes or fields..."
                  className="w-full bg-secondary text-foreground text-xs rounded-md pl-8 pr-3 py-2 border border-border focus:border-primary focus:outline-none"
                />
              </div>
              <div className="flex-1 overflow-hidden">
                <ComfyNodeBrowser
                  nodes={workflow.nodes}
                  exposedParams={workflow.exposedParams}
                  onToggleExpose={handleToggleExpose}
                  searchQuery={searchQuery}
                />
              </div>
            </div>
          )}

          {/* Exposed Params Tab */}
          {activeTab === "exposed" && workflow && (
            <div className="h-full">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-muted-foreground">
                  Configure how each parameter appears. Drag to reorder.
                </span>
                <span className="text-xs text-muted-foreground">
                  {workflow.exposedParams.length} parameters
                </span>
              </div>
              <div className="h-[calc(100%-28px)]">
                <ExposedParamsPanel
                  params={workflow.exposedParams}
                  onUpdateParam={handleUpdateParam}
                  onRemoveParam={handleRemoveParam}
                  onReorder={handleReorder}
                />
              </div>
            </div>
          )}

          {/* Run Tab */}
          {activeTab === "run" && workflow && (
            <div className="flex flex-col h-full">
              {workflow.exposedParams.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
                  <Settings2 className="w-8 h-8 opacity-40" />
                  <div className="text-xs text-center">
                    No exposed parameters
                    <br />
                    <span className="text-muted-foreground/60">
                      Go to Node Browser tab and expose some fields first
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-hidden">
                  <RunParamsPanel
                    params={workflow.exposedParams}
                    values={runValues}
                    onChangeValue={(key, val) =>
                      setRunValues((prev) => ({ ...prev, [key]: val }))
                    }
                  />
                </div>
              )}

              <div className="pt-3 mt-3 border-t border-border shrink-0">
                <button
                  onClick={handleRun}
                  disabled={isRunning}
                  className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs"
                >
                  {isRunning ? (
                    <>
                      <LoaderCircle className="w-4 h-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Generate
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Connect Tab */}
          {activeTab === "connect" && (
            <div className="h-full overflow-y-auto">
              <ConnectPanel />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
