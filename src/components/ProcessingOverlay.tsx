import React from "react";
import { Bot } from "lucide-react";
import { cn } from "../lib/utils";

type ProcessingOverlayProps = {
  visible: boolean;
  progress: number | null;
  message: string;
  log: string[];
  elapsedSec: number;
};

function formatElapsed(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

export function ProcessingOverlay({
  visible,
  progress,
  message,
  log,
  elapsedSec,
}: ProcessingOverlayProps) {
  if (!visible) return null;

  const determinate = progress !== null && progress >= 0;
  const pct = determinate ? Math.round(Math.min(100, Math.max(0, progress))) : null;
  const visibleLog = log.slice(-5);

  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-[#080b10]/88 px-6 backdrop-blur-md">
      <div className="relative h-[4.5rem] w-[4.5rem]">
        <div className="absolute inset-0 rounded-full border-2 border-amber-500/25" />
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-amber-400 border-r-amber-500/60" />
        <div className="absolute inset-2 flex items-center justify-center rounded-full bg-amber-500/15 shadow-[0_0_28px_rgba(245,158,11,0.2)]">
          <Bot className="h-8 w-8 animate-pulse text-amber-300" strokeWidth={1.75} />
        </div>
      </div>

      <p className="max-w-sm text-center text-sm font-semibold leading-snug text-white">
        {message || "Se procesează…"}
      </p>

      <div className="w-full max-w-sm space-y-2">
        <div className="flex items-center justify-between gap-3 text-[11px] font-medium text-[#c9d1d9]">
          <span>{determinate && pct !== null ? `${pct}%` : "În curs…"}</span>
          <span className="tabular-nums text-[#8b949e]">{formatElapsed(elapsedSec)}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-[#21262d] ring-1 ring-[#30363d]">
          {determinate && pct !== null ? (
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-700 via-amber-500 to-amber-300 transition-[width] duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          ) : (
            <div className="processing-indeterminate-bar h-full w-1/3 rounded-full bg-gradient-to-r from-amber-700 via-amber-400 to-amber-300" />
          )}
        </div>
      </div>

      {visibleLog.length > 0 && (
        <div className="mt-1 w-full max-w-sm overflow-hidden rounded-xl border border-[#30363d] bg-[#161b22] px-3.5 py-2.5 text-left shadow-lg">
          {visibleLog.map((line, i) => (
            <p
              key={`${i}-${line.slice(0, 32)}`}
              className={cn(
                "py-0.5 text-[11px] leading-relaxed",
                i === visibleLog.length - 1
                  ? "font-medium text-amber-100"
                  : "text-[#8b949e]",
              )}
            >
              <span className="mr-1.5 text-amber-500/80">›</span>
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
