import { Button } from "@/components/ui/button";
import { navigate } from "@/lib/navigation";
import { AlertCircle, RefreshCw, RotateCcw } from "lucide-react";
import React from "react";

interface Props {
  children: React.ReactNode;
}
interface State {
  hasError: boolean;
  retryKey: number;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, retryKey: 0 };

  static getDerivedStateFromError(): State {
    return { hasError: true, retryKey: 0 };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Unhandled UI error", error, info);
  }

  private handleRetry = () => {
    // Bump retryKey to force-remount children, clearing their crashed state.
    this.setState((prev) => ({ hasError: false, retryKey: prev.retryKey + 1 }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="flex min-h-[400px] flex-col items-center justify-center gap-4 p-8"
        >
          <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="size-6 text-destructive" />
          </div>
          <div className="text-center">
            <h2 className="text-lg font-semibold">页面发生未预期的错误</h2>
            <p className="mt-1 text-sm text-muted-foreground">请刷新页面重试</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={this.handleRetry}>
              <RotateCcw className="size-4" />
              重试
            </Button>
            <Button onClick={() => window.location.reload()}>
              <RefreshCw className="size-4" />
              刷新页面
            </Button>
            <Button variant="outline" onClick={() => navigate("/dashboard")}>
              返回首页
            </Button>
          </div>
        </div>
      );
    }
    return (
      <React.Fragment key={this.state.retryKey}>
        {this.props.children}
      </React.Fragment>
    );
  }
}
