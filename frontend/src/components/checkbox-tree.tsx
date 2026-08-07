import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";
import * as React from "react";

export interface TreeNode {
  key: string;
  title: React.ReactNode;
  children?: TreeNode[];
}

interface CheckboxTreeProps {
  treeData: TreeNode[];
  checkedKeys: string[];
  onCheck: (keys: string[], info: { node: TreeNode; checked: boolean }) => void;
  defaultExpandAll?: boolean;
  className?: string;
}

function flattenKeys(nodes: TreeNode[]): string[] {
  const keys: string[] = [];
  for (const n of nodes) {
    keys.push(n.key);
    if (n.children) keys.push(...flattenKeys(n.children));
  }
  return keys;
}

function getChildKeys(node: TreeNode): string[] {
  if (!node.children) return [node.key];
  const keys: string[] = [];
  for (const c of node.children) {
    keys.push(...getChildKeys(c));
  }
  return keys;
}

export function CheckboxTree({
  treeData,
  checkedKeys,
  onCheck,
  defaultExpandAll = false,
  className,
}: CheckboxTreeProps) {
  const [expandedKeys, setExpandedKeys] = React.useState<Set<string>>(() => {
    if (defaultExpandAll) {
      return new Set(flattenKeys(treeData));
    }
    return new Set<string>();
  });

  const checkedSet = React.useMemo(() => new Set(checkedKeys), [checkedKeys]);

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleNodeCheck = (node: TreeNode, checked: boolean) => {
    const childKeys = getChildKeys(node);
    let newKeys: string[];
    if (checked) {
      newKeys = [...new Set([...checkedKeys, ...childKeys])];
    } else {
      const removeSet = new Set(childKeys);
      newKeys = checkedKeys.filter((k) => !removeSet.has(k));
    }
    onCheck(newKeys, { node, checked });
  };

  const renderNode = (node: TreeNode, level: number): React.ReactNode => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedKeys.has(node.key);
    const isChecked = checkedSet.has(node.key);

    return (
      <div key={node.key}>
        <div
          className="flex items-center gap-1 py-1 hover:bg-muted/50 rounded-sm cursor-pointer select-none"
          style={{ paddingLeft: level * 20 + 4 }}
        >
          {hasChildren ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="flex-shrink-0 size-4"
              onClick={() => toggleExpand(node.key)}
            >
              {isExpanded ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )}
            </Button>
          ) : (
            <span className="w-4 flex-shrink-0" />
          )}
          <Checkbox
            checked={isChecked}
            onCheckedChange={(v) => {
              handleNodeCheck(node, !!v);
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <span className="text-sm">{node.title}</span>
        </div>
        {hasChildren && isExpanded && (
          <div>
            {(node.children ?? []).map((child) => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={cn("select-none", className)}>
      {treeData.map((node) => renderNode(node, 0))}
    </div>
  );
}
