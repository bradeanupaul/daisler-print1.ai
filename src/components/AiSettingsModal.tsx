import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Key, Sparkles, Cpu, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "../lib/utils";
import {
  hasGeminiKeyConfigured,
  hasOpenAIKeyConfigured,
  hasAnyAiKeyConfigured,
} from "../lib/aiKeys";
import {
  loadAiAppSettings,
  saveAiAppSettings,
  type PrimaryImageProvider,
} from "../lib/aiAppSettings";
import {
  GEMINI_IMAGE_MODELS,
  GEMINI_TEXT_MODELS,
  OPENAI_IMAGE_MODELS,
  OPENAI_TEXT_MODELS,
} from "../lib/aiModelCatalog";
import { resolveGeminiImageModel } from "../lib/geminiImageConfig";
import { resolveGeminiTextModel } from "../lib/geminiTextConfig";
import { resolveOpenAIImageModel } from "../lib/openaiImageConfig";
import { resolveOpenAIAgentModel, resolveOpenAIVisionModel } from "../lib/openaiTextConfig";
import { AiModelPicker } from "./AiModelPicker";
import { toast } from "sonner";

type AiSettingsModalProps = {
  open: boolean;
  onClose: () => void;
  onConfigureKeys: () => void;
  onSaved?: () => void;
};

export function AiSettingsModal({
  open,
  onClose,
  onConfigureKeys,
  onSaved,
}: AiSettingsModalProps) {
  const [primary, setPrimary] = useState<PrimaryImageProvider>("gemini");
  const [debugDual, setDebugDual] = useState(false);
  const [geminiImage, setGeminiImage] = useState(resolveGeminiImageModel());
  const [geminiText, setGeminiText] = useState(resolveGeminiTextModel());
  const [openaiImage, setOpenaiImage] = useState(resolveOpenAIImageModel());
  const [openaiAgent, setOpenaiAgent] = useState(resolveOpenAIAgentModel());
  const [openaiVision, setOpenaiVision] = useState(resolveOpenAIVisionModel());

  useEffect(() => {
    if (!open) return;
    const s = loadAiAppSettings();
    setPrimary(s.primaryImageProvider);
    setDebugDual(s.debugCompareImageModels);
    setGeminiImage(resolveGeminiImageModel());
    setGeminiText(resolveGeminiTextModel());
    setOpenaiImage(resolveOpenAIImageModel());
    setOpenaiAgent(resolveOpenAIAgentModel());
    setOpenaiVision(resolveOpenAIVisionModel());
  }, [open]);

  const gOk = hasGeminiKeyConfigured();
  const oOk = hasOpenAIKeyConfigured();
  const anyOk = hasAnyAiKeyConfigured();

  const handleSave = () => {
    if (debugDual && (!gOk || !oOk)) {
      toast.error("Compararea duală necesită chei configurate atât pentru Gemini, cât și pentru OpenAI.");
      return;
    }
    if (primary === "gemini" && !gOk) {
      toast.error("Alege OpenAI ca model primar sau adaugă o cheie Gemini.");
      return;
    }
    if (primary === "openai" && !oOk) {
      toast.error("Alege Gemini ca model primar sau adaugă o cheie OpenAI.");
      return;
    }
    saveAiAppSettings({
      primaryImageProvider: primary,
      debugCompareImageModels: debugDual,
      geminiImageModel: geminiImage,
      geminiTextModel: geminiText,
      openaiImageModel: openaiImage,
      openaiAgentModel: openaiAgent,
      openaiVisionModel: openaiVision,
    });
    toast.success("Setări AI salvate.");
    onSaved?.();
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="ai-settings"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-settings-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 6 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex max-h-[min(92vh,44rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[#2d333b] bg-[#16191e] shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#2d333b] px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/15">
                  <Cpu className="h-4 w-4 text-amber-500" />
                </div>
                <h2 id="ai-settings-title" className="text-sm font-bold text-white">
                  Setări AI
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 text-[#94a3b8] hover:bg-white/5 hover:text-white"
                aria-label="Închide"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="custom-scrollbar flex-1 space-y-5 overflow-y-auto px-4 py-4">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[#94a3b8]">
                  Stare conexiuni API
                </p>
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-[#0d1117]/80 px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Sparkles className="h-4 w-4 shrink-0 text-amber-400" />
                      <span className="text-xs font-medium text-[#e6edf3]">Google Gemini</span>
                    </div>
                    {gOk ? (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" /> OK
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] text-amber-400">
                        <AlertTriangle className="h-3.5 w-3.5" /> Lipsește
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-[#0d1117]/80 px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Cpu className="h-4 w-4 shrink-0 text-sky-400" />
                      <span className="text-xs font-medium text-[#e6edf3]">OpenAI (ChatGPT)</span>
                    </div>
                    {oOk ? (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" /> OK
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] text-amber-400">
                        <AlertTriangle className="h-3.5 w-3.5" /> Lipsește
                      </span>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-[#64748b]">
                  Prețurile sunt orientative (USD). Facturarea reală depinde de dimensiune, pași QA OpenAI
                  și tarifele curente API.
                </p>
              </div>

              <div className="space-y-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3">
                <p className="flex items-center gap-2 text-xs font-bold text-amber-200">
                  <Sparkles className="h-4 w-4" /> Google Gemini
                </p>
                <AiModelPicker
                  title="Model imagini"
                  hint="Upscale, AI Bleed, mockup."
                  models={GEMINI_IMAGE_MODELS}
                  value={geminiImage}
                  onChange={setGeminiImage}
                  disabled={!gOk}
                  accent="amber"
                />
                <AiModelPicker
                  title="Model text"
                  hint="Agent AI, analiză calitate tipar."
                  models={GEMINI_TEXT_MODELS}
                  value={geminiText}
                  onChange={setGeminiText}
                  disabled={!gOk}
                  accent="amber"
                />
              </div>

              <div className="space-y-4 rounded-xl border border-sky-500/20 bg-sky-500/[0.04] p-3">
                <p className="flex items-center gap-2 text-xs font-bold text-sky-200">
                  <Cpu className="h-4 w-4" /> OpenAI / ChatGPT
                </p>
                <AiModelPicker
                  title="Model imagini"
                  hint="images.edit — upscale, bleed, mockup."
                  models={OPENAI_IMAGE_MODELS}
                  value={openaiImage}
                  onChange={setOpenaiImage}
                  disabled={!oOk}
                  accent="sky"
                />
                <AiModelPicker
                  title="Model agent"
                  hint="Comenzi text/voce în workspace."
                  models={OPENAI_TEXT_MODELS}
                  value={openaiAgent}
                  onChange={setOpenaiAgent}
                  disabled={!oOk}
                  accent="sky"
                />
                <AiModelPicker
                  title="Model analiză (vision)"
                  hint="Calitate tipar + verificare QA după generare imagine."
                  models={OPENAI_TEXT_MODELS}
                  value={openaiVision}
                  onChange={setOpenaiVision}
                  disabled={!oOk}
                  accent="sky"
                />
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-[#94a3b8]">
                  Furnizor primar mockup (fără mod comparare)
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={!gOk}
                    onClick={() => setPrimary("gemini")}
                    className={cn(
                      "rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition-colors",
                      primary === "gemini"
                        ? "border-amber-500 bg-amber-500/15 text-amber-400"
                        : "border-[#2d333b] bg-[#0d1117] text-[#94a3b8] hover:border-white/20",
                      !gOk && "cursor-not-allowed opacity-40",
                    )}
                  >
                    Gemini
                  </button>
                  <button
                    type="button"
                    disabled={!oOk}
                    onClick={() => setPrimary("openai")}
                    className={cn(
                      "rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition-colors",
                      primary === "openai"
                        ? "border-sky-500 bg-sky-500/15 text-sky-300"
                        : "border-[#2d333b] bg-[#0d1117] text-[#94a3b8] hover:border-white/20",
                      !oOk && "cursor-not-allowed opacity-40",
                    )}
                  >
                    ChatGPT / OpenAI
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-amber-200">Debug: compară modelele</p>
                    <p className="mt-1 text-[10px] leading-relaxed text-[#94a3b8]">
                      Upscale, bleed și mockup rulează Gemini + OpenAI în paralel; alegi varianta în dialog.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!gOk || !oOk}
                    onClick={() => setDebugDual((v) => !v)}
                    className={cn(
                      "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                      debugDual ? "bg-amber-500" : "bg-[#2d333b]",
                      (!gOk || !oOk) && "cursor-not-allowed opacity-40",
                    )}
                    aria-pressed={debugDual}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
                        debugDual ? "right-0.5" : "left-0.5",
                      )}
                    />
                  </button>
                </div>
              </div>

              {!anyOk && (
                <div className="flex gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-200">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Nu e configurată nicio cheie API. Funcțiile AI nu vor rula.
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 border-t border-[#2d333b] bg-[#0d1117]/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={onConfigureKeys}
                className="flex items-center justify-center gap-2 rounded-lg border border-[#2d333b] px-3 py-2 text-xs font-semibold text-[#94a3b8] hover:border-amber-500/40 hover:text-white"
              >
                <Key className="h-4 w-4" />
                Chei API…
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-[#2d333b] px-4 py-2 text-xs font-semibold text-[#94a3b8] hover:bg-white/5"
                >
                  Anulează
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-black hover:bg-amber-400"
                >
                  Salvează
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
