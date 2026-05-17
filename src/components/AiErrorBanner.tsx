import React from "react";
import { AlertCircle, X } from "lucide-react";
import { cn } from "../lib/utils";

type AiErrorBannerProps = {
  message: string | null;
  onDismiss: () => void;
  className?: string;
};

export function AiErrorBanner({ message, onDismiss, className }: AiErrorBannerProps) {
  if (!message?.trim()) return null;

  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-left shadow-lg",
        className,
      )}
    >
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wide text-red-300/90">
          Eroare AI
        </p>
        <p className="mt-1 text-xs leading-relaxed text-red-100">{message}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded-lg p-1.5 text-red-300/80 transition-colors hover:bg-red-500/20 hover:text-white"
        aria-label="Închide mesajul de eroare"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
