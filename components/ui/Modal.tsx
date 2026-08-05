"use client";

import { useEffect } from "react";

export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden />
      <div
        className="relative card w-full max-w-md p-8 animate-[reveal-up_0.25s_ease-out]"
        style={{ boxShadow: "0 8px 24px rgba(26,26,26,0.12)" }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-5 text-2xl leading-none text-faint hover:text-ink transition-colors"
          aria-label="Close"
        >
          ×
        </button>
        {eyebrow && <p className="mono-label !text-primary">{eyebrow}</p>}
        <h2 className="mt-2 text-2xl font-medium tracking-tight">{title}</h2>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
