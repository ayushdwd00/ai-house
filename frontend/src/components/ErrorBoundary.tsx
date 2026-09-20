"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RotateCcw, Eye } from "lucide-react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  fallbackActionLabel?: string;
  onRetry?: () => void;
  onFallbackTo2D?: () => void;
  componentName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[ErrorBoundary] Caught in ${this.props.componentName || "Component"}:`, error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onRetry?.();
  };

  public render() {
    if (this.state.hasError) {
      const isDev = process.env.NODE_ENV !== "production";
      const is3D = this.props.componentName?.toLowerCase().includes("3d") || this.props.componentName?.toLowerCase().includes("model");

      return (
        <div className="w-full h-full min-h-[360px] flex items-center justify-center p-6 bg-[#0A0B0E] text-[#F5F3EF]">
          <div className="max-w-md w-full bg-[#12141A] border border-red-500/20 rounded-2xl p-6 shadow-2xl text-center flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-4 text-red-400">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-serif font-light text-[#F5F3EF] mb-2">
              {this.props.fallbackTitle || (is3D ? "3D Visualization Could Not Be Loaded" : "Component Encountered an Issue")}
            </h3>

            <p className="text-xs text-[#9E9C98] font-light mb-6 leading-relaxed">
              {this.props.fallbackMessage ||
                (is3D
                  ? "A WebGL or graphics pipeline limitation occurred. You can switch to the 2D architectural blueprint or retry."
                  : "An unexpected error occurred while rendering this view.")}
            </p>

            {/* Error Details in Development */}
            {isDev && this.state.error && (
              <div className="w-full mb-6 p-3 rounded-lg bg-[#0A0B0E] border border-white/5 text-left overflow-x-auto text-[10px] font-mono text-red-300/80 max-h-28">
                <p className="font-semibold text-red-400">{this.state.error.message}</p>
                {this.state.error.stack && (
                  <pre className="mt-1 text-[9px] text-[#6B6964]">{this.state.error.stack.split("\n").slice(0, 4).join("\n")}</pre>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={this.handleRetry}
                className="px-4 py-2 rounded-full bg-[#F5F3EF] text-[#0A0B0E] hover:bg-[#E8E4DC] font-mono text-xs font-medium tracking-wider flex items-center gap-1.5 transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{this.props.fallbackActionLabel || "RETRY"}</span>
              </button>

              {is3D && this.props.onFallbackTo2D && (
                <button
                  onClick={this.props.onFallbackTo2D}
                  className="px-4 py-2 rounded-full bg-[#C48446] text-[#0A0B0E] hover:bg-[#D49354] font-mono text-xs font-medium tracking-wider flex items-center gap-1.5 transition-all shadow-lg shadow-[#C48446]/20"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>VIEW 2D BLUEPRINT</span>
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
