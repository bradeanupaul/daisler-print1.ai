/** Mapare DPI tipar → rezoluție/calitate la generare AI (Gemini + OpenAI). */

export type GeminiImageSizeTier = "1K" | "2K" | "4K";

const TIER_ORDER: Record<GeminiImageSizeTier, number> = { "1K": 1, "2K": 2, "4K": 3 };

function normalizeDpi(dpi: number | null | undefined): number {
  if (dpi == null || !Number.isFinite(dpi) || dpi <= 0) return 300;
  return Math.round(dpi);
}

export function maxGeminiImageSizeTier(
  a: GeminiImageSizeTier,
  b: GeminiImageSizeTier,
): GeminiImageSizeTier {
  return TIER_ORDER[a] >= TIER_ORDER[b] ? a : b;
}

/**
 * Latura lungă țintă pentru generare AI (canvas + output model).
 * 72 DPI → 1000px · 150 DPI → 1500px · 300 DPI → 2000px
 */
export function resolveAiGenerationLongEdgePx(dpi: number | null | undefined): number {
  const targetDpi = normalizeDpi(dpi);
  if (targetDpi >= 300) return 2000;
  if (targetDpi >= 150) return 1500;
  return 1000;
}

/** Tier Gemini aliniat la rezoluția țintă per DPI. */
export function resolveGeminiImageSizeForDpi(
  dpi: number | null | undefined,
): GeminiImageSizeTier {
  const long = resolveAiGenerationLongEdgePx(dpi);
  if (long >= 2000) return "2K";
  if (long >= 1500) return "2K";
  return "1K";
}

/** @deprecated Folosește resolveGeminiImageSizeForDpi */
export function resolveGeminiImageSizeForPrintMm(
  netWmm: number,
  netHmm: number,
  dpi: number,
): GeminiImageSizeTier {
  return resolveGeminiImageSizeForDpi(dpi);
}

export type PrintGenerationProfile = {
  targetDpi: number;
  geminiImageSize: GeminiImageSizeTier;
  openaiQuality: "low" | "medium" | "high";
  /** Latura lungă maximă pentru canvasul „extend” înainte de API. */
  extendCanvasLongEdge: number;
};

/** Profil generare: 72→1000px · 150→1500px · 300→2000px (latura lungă). */
export function resolvePrintGenerationProfile(
  dpi: number | null | undefined,
): PrintGenerationProfile {
  const targetDpi = normalizeDpi(dpi);
  const extendCanvasLongEdge = resolveAiGenerationLongEdgePx(targetDpi);
  const geminiImageSize = resolveGeminiImageSizeForDpi(targetDpi);

  if (targetDpi >= 300) {
    return {
      targetDpi,
      geminiImageSize,
      openaiQuality: "high",
      extendCanvasLongEdge,
    };
  }

  if (targetDpi >= 150) {
    return {
      targetDpi,
      geminiImageSize,
      openaiQuality: "medium",
      extendCanvasLongEdge,
    };
  }

  return {
    targetDpi,
    geminiImageSize,
    openaiQuality: "low",
    extendCanvasLongEdge,
  };
}

export function formatGenerationProfileHint(profile: PrintGenerationProfile): string {
  return `${profile.extendCanvasLongEdge}px · ${profile.geminiImageSize} · ${profile.targetDpi} DPI`;
}
