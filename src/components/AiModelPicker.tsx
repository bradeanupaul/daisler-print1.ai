import React from "react";
import { cn } from "../lib/utils";
import type { AiModelOption } from "../lib/aiModelCatalog";
import { tierColor } from "../lib/aiModelCatalog";

type AiModelPickerProps = {
  title: string;
  hint?: string;
  models: AiModelOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  accent?: "amber" | "sky";
};

export function AiModelPicker({
  title,
  hint,
  models,
  value,
  onChange,
  disabled,
  accent = "amber",
}: AiModelPickerProps) {
  const selectedRing = accent === "sky" ? "border-sky-500 bg-sky-500/10" : "border-amber-500 bg-amber-500/10";

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-[#94a3b8]">{title}</p>
      {hint && <p className="mt-1 text-[10px] leading-relaxed text-[#64748b]">{hint}</p>}
      <div className="mt-2 space-y-1.5">
        {models.map((m) => {
          const on = value === m.id;
          return (
            <button
              key={m.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(m.id)}
              className={cn(
                "flex w-full flex-col gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-colors",
                on ? selectedRing : "border-[#2d333b] bg-[#0d1117] hover:border-white/15",
                disabled && "cursor-not-allowed opacity-40",
              )}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className={cn("text-xs font-semibold", on ? "text-white" : "text-[#e6edf3]")}>
                  {m.label}
                </span>
                <span className={cn("shrink-0 text-[10px] font-semibold", tierColor(m.tier))}>
                  {m.costHint.split("·")[0]?.trim()}
                </span>
              </div>
              <p className="text-[10px] leading-snug text-[#8b949e]">{m.description}</p>
              <p className="text-[10px] font-medium text-[#64748b]">{m.costHint}</p>
              <code className="mt-0.5 text-[9px] text-[#484f58]">{m.id}</code>
            </button>
          );
        })}
      </div>
    </div>
  );
}
