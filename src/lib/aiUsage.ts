import type { GenerateContentResponseUsageMetadata } from "@google/genai";
import type OpenAI from "openai";
import {
  estimateDalleImageUsd,
  estimateImagenImageUsd,
  isGeminiImageModel,
  isGeminiNativeImageModel,
  isImagenModel,
  isOpenAIDalleModel,
  isOpenAIImageModel,
  resolveTokenRates,
  type TokenRates,
} from "./aiPricing";

export type AiProvider = "openai" | "gemini";

export type AiUsageCall = {
  provider: AiProvider;
  model: string;
  label: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedUsd: number;
};

export type AiUsageSummary = {
  calls: AiUsageCall[];
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  estimatedUsd: number;
  callCount: number;
};

function usdFromTokens(tokens: number, per1M: number): number {
  return (tokens / 1_000_000) * per1M;
}

function costOpenAIChat(
  rates: TokenRates,
  prompt: number,
  completion: number,
): number {
  return usdFromTokens(prompt, rates.inputPer1M) + usdFromTokens(completion, rates.outputPer1M);
}

function costOpenAIImageUsage(
  model: string,
  usage: OpenAI.Images.ImagesResponse.Usage,
): number {
  const rates = resolveTokenRates(model);
  const textIn = usage.input_tokens_details?.text_tokens ?? 0;
  const imageIn = usage.input_tokens_details?.image_tokens ?? 0;
  const otherIn = Math.max(0, usage.input_tokens - textIn - imageIn);

  const textRate = rates.textInputPer1M ?? rates.inputPer1M;
  const imageInRate = rates.imageInputPer1M ?? rates.inputPer1M;
  const outputRate = rates.outputPer1M;

  return (
    usdFromTokens(textIn, textRate) +
    usdFromTokens(imageIn + otherIn, imageInRate) +
    usdFromTokens(usage.output_tokens, outputRate)
  );
}

function modalityIsImage(modality: string | undefined): boolean {
  if (!modality) return false;
  return modality.toUpperCase().includes("IMAGE");
}

function costGeminiUsage(model: string, meta: GenerateContentResponseUsageMetadata): number {
  const rates = resolveTokenRates(model);
  let cost = 0;

  const promptDetails = meta.promptTokensDetails ?? [];
  if (promptDetails.length > 0) {
    for (const d of promptDetails) {
      const n = d.tokenCount ?? 0;
      cost += usdFromTokens(n, rates.inputPer1M);
    }
  } else if (meta.promptTokenCount) {
    cost += usdFromTokens(meta.promptTokenCount, rates.inputPer1M);
  }

  const outDetails = meta.candidatesTokensDetails ?? [];
  if (outDetails.length > 0) {
    for (const d of outDetails) {
      const n = d.tokenCount ?? 0;
      const rate =
        isGeminiImageModel(model) && modalityIsImage(String(d.modality))
          ? rates.imageOutputPer1M ?? rates.outputPer1M
          : rates.outputPer1M;
      cost += usdFromTokens(n, rate);
    }
  } else if (meta.candidatesTokenCount) {
    const rate =
      isGeminiImageModel(model) ? rates.imageOutputPer1M ?? rates.outputPer1M : rates.outputPer1M;
    cost += usdFromTokens(meta.candidatesTokenCount, rate);
  }

  if (meta.thoughtsTokenCount) {
    cost += usdFromTokens(meta.thoughtsTokenCount, rates.outputPer1M);
  }

  if (meta.toolUsePromptTokenCount) {
    cost += usdFromTokens(meta.toolUsePromptTokenCount, rates.inputPer1M);
  }

  return cost;
}

export class AiUsageAccumulator {
  private calls: AiUsageCall[] = [];

  record(call: Omit<AiUsageCall, "estimatedUsd"> & { estimatedUsd?: number }) {
    const estimatedUsd =
      call.estimatedUsd ??
      costOpenAIChat(resolveTokenRates(call.model), call.promptTokens, call.completionTokens);
    this.calls.push({ ...call, estimatedUsd });
  }

  recordOpenAIChat(model: string, label: string, completion: OpenAI.Chat.Completions.ChatCompletion) {
    const u = completion.usage;
    if (!u) return;
    const prompt = u.prompt_tokens ?? 0;
    const completionTokens = u.completion_tokens ?? 0;
    const total = u.total_tokens ?? prompt + completionTokens;
    const rates = resolveTokenRates(model);
    this.calls.push({
      provider: "openai",
      model,
      label,
      promptTokens: prompt,
      completionTokens,
      totalTokens: total,
      estimatedUsd: costOpenAIChat(rates, prompt, completionTokens),
    });
  }

  recordGeminiImagen(model: string, label: string) {
    this.calls.push({
      provider: "gemini",
      model,
      label: `${label} (per imagine)`,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedUsd: estimateImagenImageUsd(model),
    });
  }

  recordOpenAIImageEdit(
    model: string,
    label: string,
    rsp: OpenAI.Images.ImagesResponse,
    dalleOpts?: { quality?: "standard" | "hd"; size?: string },
  ) {
    const u = rsp.usage;
    if (!u) {
      const estimatedUsd = isOpenAIDalleModel(model)
        ? estimateDalleImageUsd(model, dalleOpts)
        : 0;
      this.calls.push({
        provider: "openai",
        model,
        label: isOpenAIDalleModel(model) ? `${label} (per imagine)` : label,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedUsd,
      });
      return;
    }
    const prompt = u.input_tokens;
    const completion = u.output_tokens;
    const total = u.total_tokens;
    this.calls.push({
      provider: "openai",
      model,
      label,
      promptTokens: prompt,
      completionTokens: completion,
      totalTokens: total,
      estimatedUsd: isOpenAIImageModel(model)
        ? costOpenAIImageUsage(model, u)
        : costOpenAIChat(resolveTokenRates(model), prompt, completion),
    });
  }

  /** Estimare când Gemini API nu trimite usageMetadata (frecvent la modele imagine). */
  private recordGeminiEstimated(
    model: string,
    label: string,
    imageSize: "1K" | "2K" | "4K" = "2K",
  ) {
    const promptTokens = imageSize === "1K" ? 400 : 600;
    const completionTokens = imageSize === "4K" ? 2000 : imageSize === "1K" ? 747 : 1120;
    const rates = resolveTokenRates(model);
    const estimatedUsd =
      usdFromTokens(promptTokens, rates.inputPer1M) +
      usdFromTokens(completionTokens, rates.imageOutputPer1M ?? rates.outputPer1M);
    this.calls.push({
      provider: "gemini",
      model,
      label: `${label} (estimare ${imageSize})`,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      estimatedUsd,
    });
  }

  recordGemini(
    model: string,
    label: string,
    meta?: GenerateContentResponseUsageMetadata | null,
    fallbackImageSize: "1K" | "2K" | "4K" = "2K",
  ) {
    const hasUsage =
      !!meta &&
      ((meta.totalTokenCount ?? 0) > 0 ||
        (meta.promptTokenCount ?? 0) > 0 ||
        (meta.candidatesTokenCount ?? 0) > 0);
    if (!hasUsage) {
      if (isImagenModel(model)) {
        this.recordGeminiImagen(model, label);
        return;
      }
      if (isGeminiNativeImageModel(model)) {
        this.recordGeminiEstimated(model, label, fallbackImageSize);
      }
      return;
    }
    const prompt = meta!.promptTokenCount ?? 0;
    const completion = meta!.candidatesTokenCount ?? 0;
    const total = meta!.totalTokenCount ?? prompt + completion + (meta!.thoughtsTokenCount ?? 0);
    this.calls.push({
      provider: "gemini",
      model,
      label,
      promptTokens: prompt,
      completionTokens: completion,
      totalTokens: total,
      estimatedUsd: costGeminiUsage(model, meta!),
    });
  }

  summarize(): AiUsageSummary {
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalTokens = 0;
    let estimatedUsd = 0;
    for (const c of this.calls) {
      totalPromptTokens += c.promptTokens;
      totalCompletionTokens += c.completionTokens;
      totalTokens += c.totalTokens;
      estimatedUsd += c.estimatedUsd;
    }
    return {
      calls: [...this.calls],
      totalPromptTokens,
      totalCompletionTokens,
      totalTokens,
      estimatedUsd,
      callCount: this.calls.length,
    };
  }

  reset() {
    this.calls = [];
  }
}

const nf = new Intl.NumberFormat("ro-RO");

export function formatTokenCount(n: number): string {
  return nf.format(Math.round(n));
}

export function formatUsd(amount: number): string {
  if (amount < 0.0001) return "$0.00";
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  if (amount < 1) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(2)}`;
}

/** O linie pentru log overlay / toast. */
/** Persistat în `file_assets.metadata.ai_usage`. */
export type StoredAiUsage = {
  calls: AiUsageCall[];
  recordedAt: string;
};

function summarizeCalls(calls: AiUsageCall[]): AiUsageSummary {
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalTokens = 0;
  let estimatedUsd = 0;
  for (const c of calls) {
    totalPromptTokens += c.promptTokens;
    totalCompletionTokens += c.completionTokens;
    totalTokens += c.totalTokens;
    estimatedUsd += c.estimatedUsd;
  }
  return {
    calls: [...calls],
    totalPromptTokens,
    totalCompletionTokens,
    totalTokens,
    estimatedUsd,
    callCount: calls.length,
  };
}

export function splitSummaryByProvider(summary: AiUsageSummary): {
  gemini: AiUsageSummary;
  openai: AiUsageSummary;
} {
  return {
    gemini: summarizeCalls(summary.calls.filter((c) => c.provider === "gemini")),
    openai: summarizeCalls(summary.calls.filter((c) => c.provider === "openai")),
  };
}

export function serializeAiUsage(summary: AiUsageSummary | null | undefined): StoredAiUsage | null {
  if (!summary || summary.callCount === 0) return null;
  return { calls: summary.calls, recordedAt: new Date().toISOString() };
}

export function normalizeAssetMetadata(metadata: unknown): Record<string, unknown> | null {
  if (!metadata) return null;
  if (typeof metadata === "string") {
    try {
      const parsed = JSON.parse(metadata) as unknown;
      return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  if (typeof metadata === "object") return metadata as Record<string, unknown>;
  return null;
}

export function parseAiUsageFromMetadata(metadata: unknown): AiUsageSummary | null {
  const obj = normalizeAssetMetadata(metadata);
  if (!obj) return null;
  const raw = obj.ai_usage;
  if (!raw || typeof raw !== "object") return null;
  const calls = (raw as StoredAiUsage).calls;
  if (!Array.isArray(calls) || calls.length === 0) return null;
  const valid = calls.filter(
    (c): c is AiUsageCall =>
      !!c &&
      typeof c === "object" &&
      (c.provider === "gemini" || c.provider === "openai") &&
      typeof c.model === "string" &&
      typeof c.label === "string",
  );
  if (valid.length === 0) return null;
  return summarizeCalls(valid);
}

/** Reporter minimal pentru apeluri fără overlay (mockup, rafinare în dialog). */
export function createStandaloneUsageReporter(): {
  reporter: { stage: (message: string) => void; usage: AiUsageAccumulator };
  summarize: () => AiUsageSummary;
} {
  const usage = new AiUsageAccumulator();
  return {
    reporter: { stage: () => {}, usage },
    summarize: () => usage.summarize(),
  };
}
