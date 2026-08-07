import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw, RotateCcw } from "lucide-react";
import React from "react";

interface Props {
  children: React.ReactNode;
}
interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(_error: Error, _info: React.ErrorInfo) {
    // Error already stored in state via getDerivedStateFromError;
    // no console logging needed.
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 p-8">
          <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="size-6 text-destructive" />
          </div>
          <div className="text-center">
            <h2 className="text-lg font-semibold">页面发生错误</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {this.state.error?.message || "未知错误"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              <RotateCcw className="size-4" />
              重试
            </Button>
            <Button onClick={() => window.location.reload()}>
              <RefreshCw className="size-4" />
              刷新页面
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
