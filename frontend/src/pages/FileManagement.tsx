import { InlineError } from "@/components/InlineError";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { RequiredLabel } from "@/components/ui/required-label";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { confirm } from "@/lib/confirm";
import { message } from "@/lib/message";
import { apiFetch, downloadFile, getList } from "@/services/api";
import { can } from "@/services/permission";
import type { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import {
  CheckCircle,
  Download,
  FileText,
  Loader2,
  Plug,
  RefreshCw,
  Save,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

interface StorageConfig {
  id: number;
  provider: string;
  local_path: string;
  s3_bucket: string | null;
  s3_region: string | null;
  s3_endpoint: string | null;
  s3_access_key: string | null;
  s3_secret_key: string | null;
  s3_enabled: boolean;
  tenant_id: string | null;
}

interface FileInfo {
  name: string;
  size: number;
  modified: string | null;
  url: string;
}

export const FileManagementPage: React.FC = () => {
  const [config, setConfig] = useState<StorageConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const [files, setFiles] = useState<FileInfo[]>([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [filePage, setFilePage] = useState(0);
  const [filePageSize, setFilePageSize] = useState(20);
  const [fileTotal, setFileTotal] = useState(0);
  const [configLoadError, setConfigLoadError] = useState(false);
  const [fileLoadError, setFileLoadError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileActionName, setFileActionName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const configRequestRef = useRef(0);
  const filesRequestRef = useRef(0);
  const configActionRef = useRef(false);
  const fileActionRef = useRef(false);
  const configFetchingRef = useRef(false);
  const filesFetchingRef = useRef(false);

  const loadConfig = useCallback(async (force = false) => {
    if (configFetchingRef.current && !force) return;
    configFetchingRef.current = true;
    const requestId = ++configRequestRef.current;
    setConfigLoading(true);
    try {
      const data = await apiFetch<StorageConfig>("/api/files/config");
      if (requestId !== configRequestRef.current) return;
      setConfig(data);
      setTestResult(null);
      setConfigLoadError(false);
    } catch (e: unknown) {
      if (requestId !== configRequestRef.current) return;
      message.error(e instanceof Error ? e.message : "加载配置失败");
      setConfigLoadError(true);
    } finally {
      if (requestId === configRequestRef.current) {
        setConfigLoading(false);
        configFetchingRef.current = false;
      }
    }
  }, []);

  const loadFiles = useCallback(
    async (force = false) => {
      if (filesFetchingRef.current && !force) return;
      filesFetchingRef.current = true;
      const requestId = ++filesRequestRef.current;
      setFilesLoading(true);
      try {
        const result = await getList<FileInfo>("files/list", {
          _start: filePage * filePageSize,
          _end: (filePage + 1) * filePageSize,
        });
        if (requestId !== filesRequestRef.current) return;
        if (result.data.length === 0 && filePage > 0) {
          setFilePage(filePage - 1);
          return;
        }
        setFiles(result.data);
        setFileTotal(result.total);
        setFileLoadError(false);
      } catch (e: unknown) {
        if (requestId !== filesRequestRef.current) return;
        message.error(e instanceof Error ? e.message : "加载文件列表失败");
        setFileLoadError(true);
      } finally {
        if (requestId === filesRequestRef.current) {
          setFilesLoading(false);
          filesFetchingRef.current = false;
        }
      }
    },
    [filePage, filePageSize],
  );

  useEffect(() => {
    void loadConfig(true);
    void loadFiles(true);
    return () => {
      configRequestRef.current += 1;
      configFetchingRef.current = false;
      filesRequestRef.current += 1;
      filesFetchingRef.current = false;
    };
  }, [loadConfig, loadFiles]);

  const handleSave = async () => {
    if (configSaving || testing) return;
    if (configActionRef.current) return;
    if (!config) return;
    configActionRef.current = true;
    setConfigSaving(true);
    try {
      await apiFetch("/api/files/config", {
        method: "POST",
        body: JSON.stringify({
          provider: config.provider,
          local_path: config.local_path,
          s3_bucket: config.s3_bucket,
          s3_region: config.s3_region,
          s3_endpoint: config.s3_endpoint,
          s3_access_key: config.s3_access_key,
          s3_secret_key: config.s3_secret_key,
          s3_enabled: config.s3_enabled,
        }),
      });
      message.success("配置已保存");
      await loadConfig(true);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setConfigSaving(false);
      configActionRef.current = false;
    }
  };

  const handleTest = async () => {
    if (configSaving || testing) return;
    if (configActionRef.current) return;
    if (!config) return;
    configActionRef.current = true;
    setTesting(true);
    setTestResult(null);
    try {
      const data = await apiFetch<{ success: boolean; message: string }>(
        "/api/files/config/test",
        {
          method: "POST",
          body: JSON.stringify({
            provider: config.provider,
            local_path: config.local_path,
            s3_bucket: config.s3_bucket,
            s3_region: config.s3_region,
            s3_endpoint: config.s3_endpoint,
            s3_access_key: config.s3_access_key,
            s3_secret_key: config.s3_secret_key,
            s3_enabled: config.s3_enabled,
          }),
        },
      );
      setTestResult(data);
    } catch (e: unknown) {
      setTestResult({
        success: false,
        message: e instanceof Error ? e.message : "测试失败",
      });
    } finally {
      setTesting(false);
      configActionRef.current = false;
    }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (uploading || filesLoading || fileActionName !== null) return;
    if (fileActionRef.current) return;
    const fileArray = Array.from(files);
    if (fileArray.length > 20) {
      message.error("单次最多上传 20 个文件");
      return;
    }
    const totalSize = fileArray.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > 50 * 1024 * 1024) {
      message.error("上传文件总大小不能超过 50MB");
      return;
    }
    fileActionRef.current = true;
    setUploading(true);
    try {
      const formData = new FormData();
      for (const f of fileArray) {
        formData.append("files", f);
      }
      const data = await apiFetch<unknown[]>("/api/files/upload", {
        method: "POST",
        body: formData,
      });
      message.success(`已上传 ${Array.isArray(data) ? data.length : 0} 个文件`);
      await loadFiles(true);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      fileActionRef.current = false;
    }
  };

  const handleDownload = async (filename: string) => {
    if (uploading || filesLoading || fileActionName !== null) return;
    if (fileActionRef.current) return;
    fileActionRef.current = true;
    const displayName = filename.split("/").pop() || filename;
    setFileActionName(filename);
    try {
      const blob = await downloadFile(
        `/api/files/download?name=${encodeURIComponent(filename)}`,
      );
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = displayName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "下载失败");
    } finally {
      setFileActionName(null);
      fileActionRef.current = false;
    }
  };

  const handleDelete = async (filename: string) => {
    if (uploading || filesLoading || fileActionName !== null) return;
    if (fileActionRef.current) return;
    const name = filename.split("/").pop() || filename;
    fileActionRef.current = true;
    const ok = await confirm({
      title: `确定删除文件「${name}」？`,
      content: "删除后不可恢复",
      okVariant: "destructive",
    });
    if (!ok) {
      fileActionRef.current = false;
      return;
    }
    setFileActionName(filename);
    try {
      await apiFetch(
        `/api/files/download?name=${encodeURIComponent(filename)}`,
        {
          method: "DELETE",
        },
      );
      message.success("已删除");
      if (files.length === 1 && filePage > 0) {
        // Decrement page; the loadFiles useCallback dependency on filePage
        // triggers the useEffect which reloads the previous page.
        filesRequestRef.current += 1;
        filesFetchingRef.current = false;
        setFilePage(filePage - 1);
      } else {
        await loadFiles(true);
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setFileActionName(null);
      fileActionRef.current = false;
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.min(
      Math.floor(Math.log(bytes) / Math.log(1024)),
      units.length - 1,
    );
    return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
  };

  const formatTime = (t: string | null) => {
    if (!t) return "-";
    const value = dayjs(t);
    return value.isValid() ? value.format("YYYY-MM-DD HH:mm:ss") : t;
  };

  const fileColumns: ColumnDef<FileInfo>[] = [
    {
      accessorKey: "name",
      header: "文件名",
      cell: ({ row }) => (
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="size-4 shrink-0 text-muted-foreground" />
          <code
            className="block max-w-[280px] truncate text-sm"
            title={row.original.name}
          >
            {row.original.name.split("/").pop() || row.original.name}
          </code>
        </div>
      ),
    },
    {
      accessorKey: "size",
      header: "大小",
      cell: ({ row }) => formatSize(row.original.size),
    },
    {
      accessorKey: "modified",
      header: "修改时间",
      cell: ({ row }) => formatTime(row.original.modified),
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          {can("system:file:read") && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={
                    uploading || filesLoading || fileActionName !== null
                  }
                  onClick={() => handleDownload(row.original.name)}
                  aria-label={`下载 ${row.original.name}`}
                >
                  {fileActionName === row.original.name ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>下载</TooltipContent>
            </Tooltip>
          )}
          {can("system:file:delete") && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={
                    uploading || filesLoading || fileActionName !== null
                  }
                  onClick={() => handleDelete(row.original.name)}
                  aria-label={`删除 ${row.original.name}`}
                >
                  {fileActionName === row.original.name ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4 text-destructive" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>删除</TooltipContent>
            </Tooltip>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">文件管理</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void loadConfig(true);
            void loadFiles(true);
          }}
          disabled={uploading || fileActionName !== null}
        >
          {configLoading || filesLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          刷新
        </Button>
      </div>

      {(configLoadError || fileLoadError) && (
        <InlineError
          title="文件管理加载失败"
          description={"配置或文件列表可能未更新，请重试。"}
          onRetry={() => {
            void loadConfig(true);
            void loadFiles(true);
          }}
          loading={configLoading || filesLoading}
        />
      )}

      {/* 存储配置 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Plug className="size-4" /> 存储配置
            {config && (
              <Badge variant={config.s3_enabled ? "success" : "secondary"}>
                {config.s3_enabled ? "S3 已启用" : "本地存储"}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {configLoading ? (
            <div className="flex items-center py-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin mr-2" /> 加载配置…
            </div>
          ) : config ? (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="file-storage-mode">存储方式</Label>
                    <Switch
                      id="file-storage-mode"
                      checked={config.s3_enabled}
                      onCheckedChange={(v) =>
                        setConfig({
                          ...config,
                          s3_enabled: v,
                          provider: v ? "s3" : "local",
                        })
                      }
                    />
                    <span className="text-sm">
                      {config.s3_enabled ? "S3 对象存储" : "本地磁盘"}
                    </span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="file-local-path">本地存储目录</Label>
                  <Input
                    id="file-local-path"
                    value={config.local_path}
                    onChange={(e) =>
                      setConfig({ ...config, local_path: e.target.value })
                    }
                    placeholder="uploads"
                    disabled={config.s3_enabled}
                  />
                </div>
              </div>

              {config.s3_enabled && (
                <div className="space-y-4 rounded-md border p-4 bg-muted/30">
                  <p className="text-sm font-medium">S3 / 兼容存储配置</p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <RequiredLabel htmlFor="file-s3-bucket" required>
                        Bucket 名称
                      </RequiredLabel>
                      <Input
                        id="file-s3-bucket"
                        value={config.s3_bucket || ""}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            s3_bucket: e.target.value,
                          })
                        }
                        placeholder="my-attachments"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="file-s3-region">区域</Label>
                      <Input
                        id="file-s3-region"
                        value={config.s3_region || ""}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            s3_region: e.target.value,
                          })
                        }
                        placeholder="us-east-1"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="file-s3-endpoint">端点 URL</Label>
                      <Input
                        id="file-s3-endpoint"
                        value={config.s3_endpoint || ""}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            s3_endpoint: e.target.value,
                          })
                        }
                        placeholder="https://s3.amazonaws.com（留空用默认）"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="file-s3-access-key">Access Key ID</Label>
                      <Input
                        id="file-s3-access-key"
                        value={config.s3_access_key || ""}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            s3_access_key: e.target.value,
                          })
                        }
                        placeholder="AKIA..."
                      />
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <Label htmlFor="file-s3-secret-key">
                        Secret Access Key
                      </Label>
                      <PasswordInput
                        id="file-s3-secret-key"
                        value={config.s3_secret_key || ""}
                        autoComplete="off"
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            s3_secret_key: e.target.value,
                          })
                        }
                        placeholder="留空保持原值"
                      />
                      <p className="text-xs text-muted-foreground">
                        已配置时显示掩码值，重新输入可覆盖
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {can("system:config:update") && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    onClick={handleSave}
                    disabled={configSaving || testing}
                  >
                    {configSaving ? (
                      <Loader2 className="size-4 animate-spin mr-1" />
                    ) : (
                      <Save className="size-4 mr-1" />
                    )}
                    保存配置
                  </Button>
                  {config.s3_enabled && (
                    <Button
                      variant="outline"
                      onClick={handleTest}
                      disabled={testing || configSaving}
                    >
                      {testing ? (
                        <Loader2 className="size-4 animate-spin mr-1" />
                      ) : (
                        <Plug className="size-4 mr-1" />
                      )}
                      测试连接
                    </Button>
                  )}
                  {testResult && (
                    <div
                      aria-live="polite"
                      className="flex min-w-0 items-center gap-1.5 text-sm"
                    >
                      {testResult.success ? (
                        <>
                          <CheckCircle className="size-4 text-success" />
                          <span className="min-w-0 break-words text-success">
                            {testResult.message}
                          </span>
                        </>
                      ) : (
                        <>
                          <XCircle className="size-4 text-destructive" />
                          <span className="min-w-0 break-words text-destructive">
                            {testResult.message}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="block text-sm text-muted-foreground">暂无配置</div>
          )}
        </CardContent>
      </Card>

      {/* 文件浏览 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <FileText className="size-4" /> 文件列表
            </span>
            <div className="flex gap-2">
              <input
                aria-label="选择要上传的文件"
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleUpload(e.target.files)}
              />
              {can("system:file:upload") && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={
                        uploading || filesLoading || fileActionName !== null
                      }
                    >
                      {uploading ? (
                        <Loader2 className="size-4 animate-spin mr-1" />
                      ) : (
                        <Upload className="size-4 mr-1" />
                      )}
                      上传文件
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    单次最多 20 个文件，总大小不超过 50MB
                  </TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void loadFiles(true)}
                    aria-label="刷新文件列表"
                    disabled={uploading || fileActionName !== null}
                  >
                    <RefreshCw className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>刷新文件列表</TooltipContent>
              </Tooltip>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={fileColumns}
            data={files}
            pageSize={filePageSize}
            serverSide
            total={fileTotal}
            pageIndex={filePage}
            onPageChange={setFilePage}
            onPageSizeChange={(size) => {
              setFilePage(0);
              setFilePageSize(size);
            }}
            loading={filesLoading}
            loadingMessage="加载文件列表…"
            emptyMessage="暂无文件"
          />
        </CardContent>
      </Card>
    </div>
  );
};
