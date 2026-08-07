import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { message } from "@/lib/message";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/services/api";
import { Code } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";

interface ColumnInfo {
  name: string;
  data_type: string;
  is_nullable: boolean;
  is_primary_key: boolean;
  comment: string;
}

interface TableInfo {
  name: string;
  comment: string;
  columns: ColumnInfo[];
}

interface GeneratedFile {
  path: string;
  content: string;
}

function toTitle(s: string): string {
  return s
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export const CodeGenPage: React.FC = () => {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState("");
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [moduleName, setModuleName] = useState("system");
  const [businessName, setBusinessName] = useState("");
  const [functionName, setFunctionName] = useState("");
  const [generated, setGenerated] = useState<GeneratedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activeFile, setActiveFile] = useState("");

  const fetchTables = async () => {
    try {
      const data = await apiFetch<TableInfo[]>("/api/codegen/tables");
      setTables(data);
    } catch (e: unknown) {
      // 非关键：数据加载失败时保留旧数据，不阻塞页面
      if (e instanceof Error) message.error(`加载失败: ${e.message}`);
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useEffect(() => {
    fetchTables();
  }, []);

  const currentTable = tables.find((t) => t.name === selectedTable);

  const handleSelectTable = (name: string) => {
    setSelectedTable(name);
    const t = tables.find((tbl) => tbl.name === name);
    if (t) {
      setSelectedColumns(
        t.columns.filter((c) => !c.is_primary_key).map((c) => c.name),
      );
      setBusinessName(t.comment || toTitle(name));
      setFunctionName(name);
    }
  };

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ files: GeneratedFile[] }>(
        "/api/codegen/preview",
        {
          method: "POST",
          body: JSON.stringify({
            table_name: selectedTable,
            module_name: moduleName,
            business_name: businessName,
            function_name: functionName,
            selected_columns: selectedColumns,
          }),
        },
      );
      setGenerated(data.files);
      setActiveFile(data.files[0]?.path || "");
      setPreviewOpen(true);
      message.success("代码已生成");
    } catch (e: unknown) {
      // 非关键：数据加载失败时保留旧数据，不阻塞页面
      if (e instanceof Error) message.error(`加载失败: ${e.message}`);
    }
    setLoading(false);
  };

  const toggleColumn = (colName: string) => {
    setSelectedColumns((prev) =>
      prev.includes(colName)
        ? prev.filter((c) => c !== colName)
        : [...prev, colName],
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Code className="size-5" />
        <h2 className="text-lg font-semibold">代码生成</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">选择数据表</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-[360px] overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0">
                <TableRow>
                  <TableHead>表名</TableHead>
                  <TableHead>说明</TableHead>
                  <TableHead className="text-right">列数</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tables.map((t) => (
                  <TableRow
                    key={t.name}
                    onClick={() => handleSelectTable(t.name)}
                    className={cn(
                      "cursor-pointer",
                      selectedTable === t.name && "bg-primary/10",
                    )}
                  >
                    <TableCell>
                      <code className="text-xs">{t.name}</code>
                    </TableCell>
                    <TableCell>{t.comment || "-"}</TableCell>
                    <TableCell className="text-right">
                      {t.columns.length}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {currentTable && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">生成配置</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1">
                <Label>模块名</Label>
                <Input
                  value={moduleName}
                  onChange={(e) => setModuleName(e.target.value)}
                  className="w-[120px]"
                />
              </div>
              <div className="space-y-1">
                <Label>业务名</Label>
                <Input
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-[150px]"
                />
              </div>
              <div className="space-y-1">
                <Label>功能名</Label>
                <Input
                  value={functionName}
                  onChange={(e) => setFunctionName(e.target.value)}
                  className="w-[150px]"
                />
              </div>
              <Button onClick={handleGenerate} disabled={loading}>
                <Code className="size-4 mr-1" />
                生成代码
              </Button>
            </div>

            <div>
              <Label className="block mb-2">选择字段:</Label>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {currentTable.columns.map((c) => (
                  // biome-ignore lint/a11y/noLabelWithoutControl: label wraps shadcn Checkbox
                  <label
                    key={c.name}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedColumns.includes(c.name)}
                      onCheckedChange={() => toggleColumn(c.name)}
                    />
                    <span>
                      <code className="text-xs">{c.name}</code>
                      <span className="text-muted-foreground ml-1">
                        ({c.data_type})
                      </span>
                      {c.comment && (
                        <span className="text-muted-foreground ml-1">
                          — {c.comment}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-[900px]">
          <DialogHeader>
            <DialogTitle>生成的代码</DialogTitle>
          </DialogHeader>
          <Tabs value={activeFile} onValueChange={setActiveFile}>
            <TabsList className="flex flex-wrap h-auto">
              {generated.map((f) => (
                <TabsTrigger
                  key={f.path}
                  value={f.path}
                  className="text-xs font-mono"
                >
                  {f.path}
                </TabsTrigger>
              ))}
            </TabsList>
            {generated.map((f) => (
              <TabsContent key={f.path} value={f.path}>
                <pre className="text-xs max-h-[500px] overflow-auto rounded-md bg-muted p-3 font-mono whitespace-pre-wrap break-all">
                  {f.content}
                </pre>
              </TabsContent>
            ))}
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
};
