import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import * as React from "react";

export interface TreeNode {
  key: string;
  title: React.ReactNode;
  children?: TreeNode[];
  /** true/false when known; undefined means children must be loaded lazily. */
  hasChildren?: boolean;
  /** true after a lazy node's children have been requested. */
  loaded?: boolean;
}

export interface TreeNodeLoadState {
  total: number;
  nextPage: number;
  loading: boolean;
  error: boolean;
}

interface CheckboxTreeProps {
  treeData: TreeNode[];
  checkedKeys: string[];
  onCheck: (keys: string[], info: { node: TreeNode; checked: boolean }) => void;
  defaultExpandAll?: boolean;
  className?: string;
  /** Called when an unloaded node is expanded. */
  loadChildren?: (node: TreeNode) => void;
  /** Called when a node has more children than the currently loaded page. */
  loadMoreChildren?: (node: TreeNode) => void;
  childrenState?: Record<string, TreeNodeLoadState>;
  rootLoadState?: TreeNodeLoadState;
  loadMoreRoot?: () => void;
  /**
   * Lets callers resolve every descendant key, including descendants that are
   * not loaded yet. This keeps parent checks accurate for lazily loaded trees.
   */
  getSubtreeKeys?: (
    node: TreeNode,
    checked: boolean,
  ) => string[] | Promise<string[]>;
}

function flattenLoadedKeys(nodes: TreeNode[]): string[] {
  const keys: string[] = [];
  for (const n of nodes) {
    if (n.children?.length) {
      keys.push(n.key, ...flattenLoadedKeys(n.children));
    }
  }
  return keys;
}

function getSubtreeKeys(node: TreeNode): string[] {
  const keys = [node.key];
  for (const child of node.children ?? []) {
    keys.push(...getSubtreeKeys(child));
  }
  return keys;
}

function getNodeCheckState(
  node: TreeNode,
  checkedSet: Set<string>,
): NodeCheckState {
  if (checkedSet.has(node.key)) return "checked";
  const descendants = node.children ?? [];
  if (descendants.length === 0) return "unchecked";
  const descendantKeys = descendants.flatMap((child) => getSubtreeKeys(child));
  const checkedCount = descendantKeys.filter((key) =>
    checkedSet.has(key),
  ).length;
  if (checkedCount === 0) return "unchecked";
  if (checkedCount === descendantKeys.length) return "checked";
  return "indeterminate";
}

type NodeCheckState = "checked" | "unchecked" | "indeterminate";

export function CheckboxTree({
  treeData,
  checkedKeys,
  onCheck,
  defaultExpandAll = false,
  className,
  loadChildren,
  loadMoreChildren,
  childrenState,
  rootLoadState,
  loadMoreRoot,
  getSubtreeKeys,
}: CheckboxTreeProps) {
  const [expandedKeys, setExpandedKeys] = React.useState<Set<string>>(() => {
    if (defaultExpandAll) return new Set(flattenLoadedKeys(treeData));
    return new Set<string>();
  });
  const [pendingKey, setPendingKey] = React.useState<string | null>(null);

  const checkedSet = React.useMemo(() => new Set(checkedKeys), [checkedKeys]);

  const toggleExpand = (node: TreeNode) => {
    const key = node.key;
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    const willExpand = !expandedKeys.has(key);
    const isLoaded = node.loaded === true || node.children !== undefined;
    if (willExpand && !isLoaded && loadChildren) loadChildren(node);
  };

  const handleNodeCheck = async (node: TreeNode, checked: boolean) => {
    if (pendingKey) return;
    setPendingKey(node.key);
    try {
      let subtreeKeys: string[];
      if (getSubtreeKeys) {
        subtreeKeys = await getSubtreeKeys(node, checked);
      } else {
        subtreeKeys = [node.key];
      }
      const removeSet = new Set(subtreeKeys);
      const newKeys: string[] = checked
        ? [...new Set([...checkedKeys, ...subtreeKeys])]
        : checkedKeys.filter((key) => !removeSet.has(key));
      onCheck(newKeys, { node, checked });
    } catch {
      onCheck([...checkedKeys], { node, checked });
    } finally {
      setPendingKey(null);
    }
  };

  const renderNode = (node: TreeNode, level: number): React.ReactNode => {
    const hasChildren =
      node.hasChildren === true ||
      (node.hasChildren === undefined && node.children === undefined)
        ? true
        : node.hasChildren === false
          ? false
          : (node.children?.length ?? 0) > 0;
    const isExpanded = expandedKeys.has(node.key);
    const loadState = childrenState?.[node.key];
    const isLoaded = node.loaded === true || node.children !== undefined;
    const state = getNodeCheckState(node, checkedSet);
    const isPending = pendingKey === node.key;

    return (
      <div key={node.key}>
        <div
          className="flex items-center gap-1 py-1 hover:bg-muted/50 rounded-sm"
          style={{ paddingLeft: level * 20 + 4 }}
        >
          {hasChildren ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="flex-shrink-0 size-4"
              onClick={() => toggleExpand(node)}
              disabled={loadState?.loading}
              aria-expanded={isExpanded}
              aria-label={
                typeof node.title === "string"
                  ? `${isExpanded ? "收起" : "展开"} ${node.title}`
                  : isExpanded
                    ? "收起节点"
                    : "展开节点"
              }
            >
              {isPending ? (
                <Loader2 className="size-4.5 animate-spin" />
              ) : isExpanded ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )}
            </Button>
          ) : (
            <span className="w-4 flex-shrink-0" />
          )}
          <Checkbox
            aria-label={
              typeof node.title === "string"
                ? node.title
                : `选择节点 ${node.key}`
            }
            checked={
              state === "indeterminate" ? "indeterminate" : state === "checked"
            }
            disabled={pendingKey !== null}
            onCheckedChange={(v) => {
              void handleNodeCheck(node, !!v);
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            disabled={pendingKey !== null}
            aria-label={
              typeof node.title === "string"
                ? node.title
                : `选择节点 ${node.key}`
            }
            onClick={() => void handleNodeCheck(node, state !== "checked")}
            className="min-w-0 flex-1 cursor-pointer break-words rounded-sm text-left text-sm disabled:pointer-events-none disabled:opacity-50"
            title={typeof node.title === "string" ? node.title : undefined}
          >
            {node.title}
          </button>
        </div>
        {hasChildren && isExpanded && (
          <div>
            {!isLoaded && loadState?.loading && (
              <div className="flex items-center gap-2 py-1 pl-7 text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                加载中…
              </div>
            )}
            {!isLoaded && loadState?.error && (
              <div
                role="alert"
                className="flex items-center gap-2 py-1 pl-7 text-xs text-destructive"
              >
                子节点加载失败
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="size-6"
                      onClick={() => loadChildren?.(node)}
                      aria-label={`重试加载子节点 ${typeof node.title === "string" ? node.title : ""}`}
                    >
                      <RefreshCw className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>重试加载子节点</TooltipContent>
                </Tooltip>
              </div>
            )}
            {isLoaded &&
              (node.children?.length ? (
                node.children.map((child) => renderNode(child, level + 1))
              ) : (
                <div className="block py-1 pl-7 text-xs text-muted-foreground">
                  暂无子节点
                </div>
              ))}
            {isLoaded &&
              loadState &&
              loadState.total > (node.children?.length ?? 0) && (
                <div className="py-1 pl-7">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => loadMoreChildren?.(node)}
                    disabled={loadState.loading}
                  >
                    {loadState.loading ? (
                      <>
                        <Loader2 className="size-4 animate-spin" /> 加载中…
                      </>
                    ) : (
                      `加载更多（${node.children?.length ?? 0}/${loadState.total}）`
                    )}
                  </Button>
                </div>
              )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={cn("select-none", className)}>
      {treeData.map((node) => renderNode(node, 0))}
      {rootLoadState?.error && (
        <div
          role="alert"
          className="flex items-center gap-2 py-1 pl-1 text-xs text-destructive"
        >
          根节点加载失败
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="size-6"
                onClick={() => loadMoreRoot?.()}
                aria-label="重试加载根节点"
              >
                <RefreshCw className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>重试加载根节点</TooltipContent>
          </Tooltip>
        </div>
      )}
      {rootLoadState && rootLoadState.total > treeData.length && (
        <div className="py-1 pl-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => loadMoreRoot?.()}
            disabled={rootLoadState.loading}
          >
            {rootLoadState.loading ? (
              <>
                <Loader2 className="size-4 animate-spin" /> 加载中…
              </>
            ) : (
              `加载更多（${treeData.length}/${rootLoadState.total}）`
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
