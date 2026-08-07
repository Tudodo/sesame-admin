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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { confirm } from "@/lib/confirm";
import { message } from "@/lib/message";
import { apiFetch, downloadFile } from "@/services/api";
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
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const [files, setFiles] = useState<FileInfo[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadConfig = useCallback(async () => {
    setConfigLoading(true);
    try {
      const data = await apiFetch<StorageConfig>("/api/files/config");
      setConfig(data);
      setTestResult(null);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "加载配置失败");
    } finally {
      setConfigLoading(false);
    }
  }, []);

  const loadFiles = useCallback(async () => {
    setFilesLoading(true);
    try {
      const data = await apiFetch<FileInfo[]>("/api/files/list");
      setFiles(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "加载文件列表失败");
    } finally {
      setFilesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
    loadFiles();
  }, [loadConfig, loadFiles]);

  const handleSave = async () => {
    if (!config) return;
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
      await loadConfig();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setConfigSaving(false);
    }
  };

  const handleTest = async () => {
    if (!config) return;
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
    }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const formData = new FormData();
      for (const f of Array.from(files)) {
        formData.append("files", f);
      }
      const data = await apiFetch<unknown[]>("/api/files/upload", {
        method: "POST",
        body: formData,
      });
      message.success(`已上传 ${Array.isArray(data) ? data.length : 0} 个文件`);
      await loadFiles();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDownload = async (filename: string) => {
    const displayName = filename.split("/").pop() || filename;
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
    }
  };

  const handleDelete = async (filename: string) => {
    const name = filename.split("/").pop() || filename;
    const ok = await confirm({
      title: `确定删除文件「${name}」？`,
      content: "删除后不可恢复",
      okVariant: "destructive",
    });
    if (!ok) return;
    try {
      await apiFetch(
        `/api/files/download?name=${encodeURIComponent(filename)}`,
        {
          method: "DELETE",
        },
      );
      message.success("已删除");
      await loadFiles();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatTime = (t: string | null) => {
    if (!t) return "-";
    try {
      return new Date(t).toLocaleString("zh-CN");
    } catch {
      return t;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">文件管理</h2>
        <Button variant="outline" size="sm" onClick={loadConfig}>
          <RefreshCw className="size-4" /> 刷新
        </Button>
      </div>

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
              <Loader2 className="size-4 animate-spin mr-2" /> 加载配置...
            </div>
          ) : config ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>存储方式</Label>
                  <div className="flex items-center gap-2">
                    <Switch
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
                  <Label>本地存储目录</Label>
                  <Input
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
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Bucket 名称 *</Label>
                      <Input
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
                      <Label>区域</Label>
                      <Input
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
                      <Label>端点 URL</Label>
                      <Input
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
                      <Label>Access Key ID</Label>
                      <Input
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
                      <Label>Secret Access Key</Label>
                      <Input
                        type="password"
                        value={config.s3_secret_key || ""}
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

              <div className="flex items-center gap-2">
                <Button onClick={handleSave} disabled={configSaving}>
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
                    disabled={testing}
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
                  <div className="flex items-center gap-1.5 text-sm">
                    {testResult.success ? (
                      <>
                        <CheckCircle className="size-4 text-success" />
                        <span className="text-success">
                          {testResult.message}
                        </span>
                      </>
                    ) : (
                      <>
                        <XCircle className="size-4 text-destructive" />
                        <span className="text-destructive">
                          {testResult.message}
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">暂无配置</p>
          )}
        </CardContent>
      </Card>

      {/* 文件浏览 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FileText className="size-4" /> 文件列表
            </span>
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleUpload(e.target.files)}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="size-4 animate-spin mr-1" />
                ) : (
                  <Upload className="size-4 mr-1" />
                )}
                上传文件
              </Button>
              <Button size="sm" variant="ghost" onClick={loadFiles}>
                <RefreshCw className="size-4" />
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filesLoading ? (
            <div className="flex items-center py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin mr-2" /> 加载文件列表...
            </div>
          ) : files.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              暂无文件
            </p>
          ) : (
            <div className="space-y-1">
              {files.map((f) => {
                const name = f.name.split("/").pop() || f.name;
                return (
                  <div
                    key={f.name}
                    className="flex items-center justify-between rounded-md border px-3 py-2 hover:bg-accent/50"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="text-sm truncate">{name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatSize(f.size)} · {formatTime(f.modified)}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDownload(f.name)}
                      >
                        <Download className="size-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(f.name)}
                      >
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
