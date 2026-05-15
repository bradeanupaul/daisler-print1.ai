import React, { useEffect, useState } from "react";
import { Cpu, Loader2, Send } from "lucide-react";
import { cn } from "../lib/utils";
import { toast } from "sonner";

const PICK_BTN =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--card)] py-2.5 text-xs font-semibold text-[var(--text)] transition-colors hover:border-amber-500/40 hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-40";

export type AiDualCompareDialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  gemini: { imageUrl: string | null; error?: string };
  openai: { imageUrl: string | null; error?: string };
  onPickGemini: (chosenUrl: string | null) => void;
  onPickOpenai: (chosenUrl: string | null) => void;
  refineWithGemini: (imageUrl: string, instruction: string) => Promise<string | null>;
  refineWithOpenai: (imageUrl: string, instruction: string) => Promise<string | null>;
  zIndexClass?: string;
};

function ImageWithRefineColumn(props: {
  label: string;
  displayUrl: string | null;
  errorText?: string;
  onPick: (chosenUrl: string | null) => void;
  pickLabel: string;
  refine: (imageUrl: string, instruction: string) => Promise<string | null>;
  onDisplayChange: (url: string | null) => void;
}) {
  const { label, displayUrl, errorText, onPick, pickLabel, refine, onDisplayChange } = props;
  const [instruction, setInstruction] = useState("");
  const [refining, setRefining] = useState(false);

  const runRefine = async () => {
    if (!displayUrl?.trim()) {
      toast.error("Nu există imagine de rafinat.");
      return;
    }
    const t = instruction.trim();
    if (!t) {
      toast.error("Scrie ce vrei să se modifice.");
      return;
    }
    setRefining(true);
    try {
      const next = await refine(displayUrl, t);
      if (next) {
        onDisplayChange(next);
        toast.success("Imagine actualizată.");
        setInstruction("");
      } else {
        toast.error("Modelul nu a returnat imagine.");
      }
    } catch {
      toast.error("Rafinarea a eșuat.");
    } finally {
      setRefining(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)]/40 p-3">
      <p className="text-center text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </p>

      <div className="relative min-h-[12rem] overflow-hidden rounded-lg border border-[var(--border)] bg-[#0d1117]">
        {displayUrl ? (
          <>
            <img
              src={displayUrl}
              alt={label}
              className={cn(
                "max-h-[min(42vh,24rem)] w-full object-contain transition-opacity duration-300",
                refining && "opacity-40",
              )}
            />
            {refining && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40">
                <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
                <p className="text-[10px] text-[var(--text-muted)]">Se procesează…</p>
              </div>
            )}
          </>
        ) : (
          <div className="flex min-h-[12rem] flex-col items-center justify-center gap-2 p-4 text-center text-xs text-red-400">
            <span>Eșuat</span>
            {errorText && <span className="text-[10px] leading-snug text-red-300/80">{errorText}</span>}
          </div>
        )}
      </div>

      <div className="relative">
        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void runRefine();
            }
          }}
          disabled={!displayUrl || refining}
          placeholder="Modificare punctuală…"
          rows={2}
          className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--card)] py-2 pl-3 pr-10 text-[11px] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-amber-500/50 focus:outline-none disabled:opacity-40"
        />
        <button
          type="button"
          disabled={!displayUrl || refining || !instruction.trim()}
          onClick={() => void runRefine()}
          className="absolute right-2 top-2 p-1.5 text-[var(--text-muted)] transition-colors hover:text-amber-500 disabled:opacity-30"
          aria-label="Trimite modificarea"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>

      <button type="button" disabled={!displayUrl} onClick={() => onPick(displayUrl)} className={PICK_BTN}>
        {pickLabel}
      </button>
    </div>
  );
}

export function AiDualCompareDialog({
  open,
  onClose,
  title,
  subtitle,
  gemini,
  openai,
  onPickGemini,
  onPickOpenai,
  refineWithGemini,
  refineWithOpenai,
  zIndexClass = "z-[200]",
}: AiDualCompareDialogProps) {
  const [geminiDisplay, setGeminiDisplay] = useState<string | null>(null);
  const [openaiDisplay, setOpenaiDisplay] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setGeminiDisplay(gemini.imageUrl);
    setOpenaiDisplay(openai.imageUrl);
  }, [open, gemini.imageUrl, openai.imageUrl]);

  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm",
        zIndexClass,
      )}
      role="dialog"
      aria-modal="true"
    >
      <div className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-4 shadow-xl sm:p-5">
        <div className="mb-4 flex flex-col gap-2 border-b border-[var(--border)] pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
              <Cpu className="h-4 w-4 text-amber-500" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[var(--text)]">{title}</h2>
              <p className="text-[11px] text-[var(--text-muted)]">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 self-end rounded-lg border border-[var(--border)] bg-[var(--card)]/60 px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] transition-colors hover:border-white/20 hover:text-[var(--text)] sm:self-auto"
          >
            Anulează
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          <ImageWithRefineColumn
            label="Google Gemini"
            displayUrl={geminiDisplay}
            errorText={gemini.error}
            onPick={onPickGemini}
            pickLabel="Folosesc varianta Gemini"
            refine={refineWithGemini}
            onDisplayChange={setGeminiDisplay}
          />
          <ImageWithRefineColumn
            label="OpenAI (ChatGPT)"
            displayUrl={openaiDisplay}
            errorText={openai.error}
            onPick={onPickOpenai}
            pickLabel="Folosesc varianta OpenAI"
            refine={refineWithOpenai}
            onDisplayChange={setOpenaiDisplay}
          />
        </div>
      </div>
    </div>
  );
}
