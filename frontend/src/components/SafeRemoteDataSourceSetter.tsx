import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Settings2 } from "lucide-react";
import { useEffect, useState } from "react";

export interface SafeRemoteDataSource {
  url?: string;
  method?: string;
  labelField?: string;
  valueField?: string;
  params?: Record<string, string>;
}

interface SafeRemoteDataSourceSetterProps {
  value?: SafeRemoteDataSource;
  onChange: (value: SafeRemoteDataSource) => void;
}

const METHOD_OPTIONS = ["GET", "POST", "PUT", "DELETE", "PATCH"];

function stringifyRecord(record?: Record<string, string>): string {
  return record && Object.keys(record).length > 0
    ? JSON.stringify(record, null, 2)
    : "{}";
}

function parseParams(raw: string): Record<string, string> | null {
  if (!raw.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [
          k,
          String(v),
        ]),
      );
    }
  } catch {
    return null;
  }
  return null;
}

export const SafeRemoteDataSourceSetter: React.FC<
  SafeRemoteDataSourceSetterProps
> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState("GET");
  const [labelField, setLabelField] = useState("label");
  const [valueField, setValueField] = useState("value");
  const [paramsText, setParamsText] = useState("{}");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setUrl(value?.url || "");
    setMethod(value?.method || "GET");
    setLabelField(value?.labelField || "label");
    setValueField(value?.valueField || "value");
    setParamsText(stringifyRecord(value?.params));
    setError("");
  }, [open, value]);

  const handleSave = () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setError("请填写请求地址");
      return;
    }
    const params = parseParams(paramsText);
    if (!params) {
      setError("请求参数必须是 JSON 对象");
      return;
    }
    onChange({
      url: trimmedUrl,
      method,
      labelField: labelField.trim() || "label",
      valueField: valueField.trim() || "value",
      params,
    });
    setOpen(false);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => setOpen(true)}
      >
        <Settings2 className="size-4" />
        远程数据源
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>配置远程数据源</DialogTitle>
            <DialogDescription>
              仅使用字段映射读取接口返回值，不再执行 JavaScript 代码。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>请求地址</Label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="/dictionary-entries?dict_type=gender&_start=0&_end=999"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1 space-y-1">
                <Label>请求方式</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METHOD_OPTIONS.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-1 space-y-1">
                <Label>标签字段</Label>
                <Input
                  value={labelField}
                  onChange={(e) => setLabelField(e.target.value)}
                />
              </div>
              <div className="col-span-1 space-y-1">
                <Label>值字段</Label>
                <Input
                  value={valueField}
                  onChange={(e) => setValueField(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>请求参数（JSON 对象）</Label>
              <Textarea
                value={paramsText}
                onChange={(e) => {
                  setParamsText(e.target.value);
                  setError("");
                }}
                rows={4}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSave}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SafeRemoteDataSourceSetter;
