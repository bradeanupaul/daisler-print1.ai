import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Coins } from "lucide-react";
import { cn } from "../lib/utils";
import {
  formatTokenCount,
  formatUsd,
  parseAiUsageFromMetadata,
  splitSummaryByProvider,
  type AiUsageSummary,
} from "../lib/aiUsage";

type AiUsageHistoryBadgeProps = {
  metadata: unknown;
  className?: string;
};

const POPUP_W = 272;
const POPUP_EST_H = 220;
const GAP = 6;

function ProviderSection(props: {
  title: string;
  summary: AiUsageSummary;
  accentClass: string;
}) {
  const { title, summary, accentClass } = props;
  if (summary.callCount === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className={cn("text-[10px] font-bold uppercase tracking-wide", accentClass)}>{title}</p>
      <ul className="space-y-1">
        {summary.calls.map((call, i) => (
          <li
            key={`${call.label}-${i}`}
            className="rounded-md bg-black/25 px-2 py-1.5 text-[10px] leading-snug text-[#c9d1d9]"
          >
            <p className="font-medium text-[#e6edf3]">{call.label}</p>
            <p className="text-[#8b949e]">{call.model}</p>
            <p className="tabular-nums">
              {formatTokenCount(call.totalTokens)} tokeni
              <span className="text-[#6e7681]">
                {" "}
                ({formatTokenCount(call.promptTokens)} in · {formatTokenCount(call.completionTokens)} out)
              </span>
              {" · "}
              <span className="text-emerald-400/90">{formatUsd(call.estimatedUsd)}</span>
            </p>
          </li>
        ))}
      </ul>
      <p className="border-t border-[#30363d] pt-1.5 text-[10px] tabular-nums text-[#8b949e]">
        Subtotal {title}: {formatTokenCount(summary.totalTokens)} tokeni ·{" "}
        <span className="font-medium text-emerald-300">{formatUsd(summary.estimatedUsd)}</span>
      </p>
    </div>
  );
}

function UsagePopupContent({ metadata }: { metadata: unknown }) {
  const usage = parseAiUsageFromMetadata(metadata);
  const { gemini, openai } = usage
    ? splitSummaryByProvider(usage)
    : {
        gemini: {
          calls: [],
          totalPromptTokens: 0,
          totalCompletionTokens: 0,
          totalTokens: 0,
          estimatedUsd: 0,
          callCount: 0,
        },
        openai: {
          calls: [],
          totalPromptTokens: 0,
          totalCompletionTokens: 0,
          totalTokens: 0,
          estimatedUsd: 0,
          callCount: 0,
        },
      };
  const hasGemini = gemini.callCount > 0;
  const hasOpenai = openai.callCount > 0;

  return (
    <>
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[#8b949e]">Consum API</p>
      {!usage ? (
        <p className="text-[10px] leading-relaxed text-[#8b949e]">
          Nu există date salvate pentru această imagine. Apare după o generare AI nouă (Upscale / Bleed).
        </p>
      ) : (
        <>
          <div className="max-h-[min(14rem,50vh)] space-y-3 overflow-y-auto custom-scrollbar">
            {hasGemini && <ProviderSection title="Gemini" summary={gemini} accentClass="text-sky-400" />}
            {hasOpenai && (
              <ProviderSection title="ChatGPT" summary={openai} accentClass="text-emerald-400" />
            )}
            {!hasGemini && !hasOpenai && (
              <p className="text-[10px] text-[#8b949e]">Niciun apel înregistrat.</p>
            )}
          </div>
          <p className="mt-2 border-t border-[#30363d] pt-2 text-[11px] font-semibold tabular-nums text-white">
            Total: {formatTokenCount(usage.totalTokens)} tokeni ·{" "}
            <span className="text-emerald-300">{formatUsd(usage.estimatedUsd)}</span>
          </p>
        </>
      )}
    </>
  );
}

export function AiUsageHistoryBadge({ metadata, className }: AiUsageHistoryBadgeProps) {
  const usage = parseAiUsageFromMetadata(metadata);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, placeAbove: false });

  const updatePosition = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom - GAP;
    const placeAbove = spaceBelow < POPUP_EST_H && r.top > POPUP_EST_H;
    let left = r.left;
    if (left + POPUP_W > window.innerWidth - 8) {
      left = window.innerWidth - POPUP_W - 8;
    }
    left = Math.max(8, left);
    const top = placeAbove ? r.top - GAP : r.bottom + GAP;
    setCoords({ top, left, placeAbove });
  }, []);

  const show = useCallback(() => {
    updatePosition();
    setOpen(true);
  }, [updatePosition]);

  const hide = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updatePosition();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, updatePosition]);

  const popup =
    open &&
    createPortal(
      <div
        role="tooltip"
        className="fixed z-[200] w-[min(17rem,calc(100vw-1rem))] max-w-[17rem]"
        style={{
          left: coords.left,
          top: coords.top,
          transform: coords.placeAbove ? "translateY(-100%)" : undefined,
        }}
        onMouseEnter={show}
        onMouseLeave={hide}
      >
        <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-2.5 shadow-xl ring-1 ring-black/50">
          <UsagePopupContent metadata={metadata} />
        </div>
      </div>,
      document.body,
    );

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border bg-[#21262d] transition-colors",
          usage
            ? "border-emerald-500/30 text-emerald-400/90 hover:border-emerald-500/50 hover:bg-emerald-500/10"
            : "border-[#30363d] text-[#6e7681] hover:border-[#484f58] hover:text-[#8b949e]",
          className,
        )}
        aria-label="Consum tokeni AI"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        <Coins className="h-3 w-3" />
      </button>
      {popup}
    </>
  );
}
