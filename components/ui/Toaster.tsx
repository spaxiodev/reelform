"use client";

import { useEffect, useState } from "react";

type ToastKind = "info" | "success" | "error";
interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

// Fire a toast from anywhere in client code — replaces browser alert().
export function toast(message: string, kind: ToastKind = "info") {
  window.dispatchEvent(new CustomEvent("app-toast", { detail: { message, kind } }));
}

let nextId = 1;

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    function onToast(e: Event) {
      const { message, kind } = (e as CustomEvent<{ message: string; kind: ToastKind }>).detail;
      const id = nextId++;
      setToasts((t) => [...t, { id, message, kind }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
    }
    window.addEventListener("app-toast", onToast);
    return () => window.removeEventListener("app-toast", onToast);
  }, []);

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 max-w-sm" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="card !rounded-lg px-4 py-3 text-sm flex items-start gap-3 animate-[reveal-up_0.25s_ease-out]"
          style={{ boxShadow: "0 8px 24px rgba(26,26,26,0.12)" }}
        >
          <span
            aria-hidden
            className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
              t.kind === "error" ? "bg-danger" : t.kind === "success" ? "bg-primary" : "bg-line-strong"
            }`}
          />
          <p className="text-ink leading-snug">{t.message}</p>
          <button
            onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
            className="ml-auto text-faint hover:text-ink transition-colors"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
