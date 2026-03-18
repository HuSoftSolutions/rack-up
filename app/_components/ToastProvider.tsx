"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

type ToastTone = "error" | "success" | "info";

type Toast = {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
};

type ToastContextValue = {
  pushToast: (input: Omit<Toast, "id">) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = useCallback((input: Omit<Toast, "id">) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    setToasts((prev) => [...prev, { ...input, id }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4500);
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-3 top-3 z-[200] flex w-[min(92vw,420px)] flex-col gap-2">
        {toasts.map((toast) => {
          const toneClass =
            toast.tone === "error"
              ? "border-red-500/40 bg-red-500/15 text-red-100"
              : toast.tone === "success"
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-100"
                : "border-sky-500/40 bg-sky-500/15 text-sky-100";
          return (
            <div key={toast.id} className={`pointer-events-auto rounded-xl border p-3 shadow-xl ${toneClass}`}>
              <div className="text-sm font-semibold">{toast.title}</div>
              {toast.description ? <div className="mt-1 text-xs opacity-90">{toast.description}</div> : null}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
