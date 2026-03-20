import { useState } from "react";
import { ChevronDown, ChevronRight, Eye, EyeOff, Zap } from "lucide-react";
import type { ComfyNode, ExposedParam } from "./comfyui-workflow-modal";
import { getNodeIcon, guessParamType, isConnection } from "./comfyui-workflow-utils";

interface ComfyNodeBrowserProps {
  nodes: ComfyNode[];
  exposedParams: ExposedParam[];
  onToggleExpose: (nodeId: string, fieldName: string, value: unknown) => void;
  searchQuery: string;
}

export function ComfyNodeBrowser({
  nodes,
  exposedParams,
  onToggleExpose,
  searchQuery,
}: ComfyNodeBrowserProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const toggleNode = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      next.has(nodeId) ? next.delete(nodeId) : next.add(nodeId);
      return next;
    });
  };

  const expandAll = () => setExpandedNodes(new Set(nodes.map((n) => n.id)));
  const collapseAll = () => setExpandedNodes(new Set());

  const isExposed = (nodeId: string, fieldName: string) =>
    exposedParams.some((p) => p.nodeId === nodeId && p.fieldName === fieldName);

  const filteredNodes = searchQuery
    ? nodes.filter(
        (n) =>
          n.class_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
          Object.keys(n.inputs).some((k) =>
            k.toLowerCase().includes(searchQuery.toLowerCase())
          )
      )
    : nodes;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={expandAll}
          className="text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded bg-secondary/50"
        >
          Expand All
        </button>
        <button
          onClick={collapseAll}
          className="text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded bg-secondary/50"
        >
          Collapse All
        </button>
        <span className="text-[10px] text-muted-foreground ml-auto">
          Click field to expose
        </span>
      </div>
      <div className="flex-1 overflow-y-auto space-y-1">
        {filteredNodes.map((node) => {
          const fields = Object.entries(node.inputs).filter(
            ([, v]) => !isConnection(v)
          );
          const exposedCount = fields.filter(([k]) =>
            isExposed(node.id, k)
          ).length;
          const isExpanded = expandedNodes.has(node.id);

          return (
            <div
              key={node.id}
              className="border border-border rounded-md overflow-hidden"
            >
              <button
                onClick={() => toggleNode(node.id)}
                className="w-full flex items-center gap-2 px-2.5 py-2 hover:bg-accent/50 transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                )}
                <span className="text-sm">{getNodeIcon(node.class_type)}</span>
                <span className="text-xs text-muted-foreground">#{node.id}</span>
                <span className="text-xs text-foreground">{node.class_type}</span>
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {fields.length} fields
                </span>
                {exposedCount > 0 && (
                  <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded">
                    {exposedCount} exposed
                  </span>
                )}
              </button>

              {isExpanded && (
                <div className="border-t border-border">
                  {fields.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      No exposable fields
                    </div>
                  ) : (
                    fields.map(([fieldName, value]) => {
                      const exposed = isExposed(node.id, fieldName);
                      return (
                        <button
                          key={fieldName}
                          onClick={() =>
                            onToggleExpose(node.id, fieldName, value)
                          }
                          className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                            exposed
                              ? "bg-primary/10 hover:bg-primary/15"
                              : "hover:bg-accent/30"
                          }`}
                        >
                          {exposed ? (
                            <Eye className="w-3 h-3 text-primary shrink-0" />
                          ) : (
                            <EyeOff className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                          )}
                          <span
                            className={exposed ? "text-primary" : "text-foreground"}
                          >
                            {fieldName}
                          </span>
                          <span className="text-muted-foreground ml-auto truncate max-w-[140px]">
                            {typeof value === "string"
                              ? `"${value.length > 20 ? value.slice(0, 20) + "..." : value}"`
                              : String(value)}
                          </span>
                          {exposed && (
                            <span className="text-[9px] bg-primary text-primary-foreground px-1 rounded uppercase">
                              {guessParamType(fieldName, value).type}
                            </span>
                          )}
                        </button>
                      );
                    })
                  )}

                  {Object.entries(node.inputs)
                    .filter(([, v]) => isConnection(v))
                    .map(([fieldName, value]) => (
                      <div
                        key={fieldName}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground/30"
                      >
                        <Zap className="w-3 h-3 shrink-0" />
                        <span>{fieldName}</span>
                        <span className="ml-auto">
                          → node {(value as string[])[0]}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
