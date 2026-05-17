/** Raportare pași reali din servicii (Gemini, OpenAI, PDF etc.). */
import type { AiUsageAccumulator } from "./aiUsage";

export type ProcessingStageReporter = {
  stage: (message: string) => void;
  progressStep?: (current: number, total: number, message?: string) => void;
  usage?: AiUsageAccumulator;
};

export function noopReporter(): ProcessingStageReporter {
  return { stage: () => {} };
}

export function usageFromReporter(
  reporter?: ProcessingStageReporter,
): AiUsageAccumulator | undefined {
  return reporter?.usage;
}

/** Reporter cu prefix pentru rulări paralele (Gemini + OpenAI în mod debug). */
export function prefixProcessingReporter(
  base: ProcessingStageReporter | undefined,
  prefix: string,
): ProcessingStageReporter | undefined {
  if (!base) return undefined;
  const tag = prefix.trim();
  return {
    stage: (message) => base.stage(tag ? `${tag}: ${message}` : message),
    progressStep: base.progressStep
      ? (current, total, label) =>
          base.progressStep!(
            current,
            total,
            label ? (tag ? `${tag}: ${label}` : label) : label,
          )
      : undefined,
    usage: base.usage,
  };
}
