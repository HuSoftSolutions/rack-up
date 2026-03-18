"use client";

import React from "react";
import { logClientError } from "@/lib/client/error-logger";
import { useToast } from "@/app/_components/ToastProvider";

type BoundaryState = {
  hasError: boolean;
};

class BoundaryImpl extends React.Component<
  {
    children: React.ReactNode;
    onError: (error: Error, componentStack?: string | null) => void;
  },
  BoundaryState
> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.props.onError(error, info.componentStack ?? null);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto flex min-h-[60vh] w-full max-w-2xl items-center justify-center p-6">
          <div className="w-full rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-white">
            <div className="text-lg font-semibold">Something went wrong</div>
            <p className="mt-2 text-sm text-red-100">
              We logged this issue. You can try again without losing your account session.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => this.setState({ hasError: false })}
                className="rounded-lg border border-white/20 px-3 py-2 text-sm"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-lg bg-white/15 px-3 py-2 text-sm"
              >
                Reload page
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function GlobalErrorBoundary({ children }: { children: React.ReactNode }) {
  const { pushToast } = useToast();

  return (
    <BoundaryImpl
      onError={(error, componentStack) => {
        void logClientError({
          kind: "react_error_boundary",
          message: error.message || "React render error",
          name: error.name,
          stack: error.stack ?? null,
          componentStack: componentStack ?? null,
        });
        pushToast({
          tone: "error",
          title: "Unexpected error",
          description: "We logged this issue. Please retry.",
        });
      }}
    >
      {children}
    </BoundaryImpl>
  );
}
