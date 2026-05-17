/** Mapare DPI tipar → rezoluție/calitate la generare AI (Gemini + OpenAI). */

export type GeminiImageSizeTier = "1K" | "2K" | "4K";

export type PrintGenerationProfile = {
  targetDpi: number;
  geminiImageSize: GeminiImageSizeTier;
  openaiQuality: "low" | "medium" | "high";
  /** Latura lungă maximă pentru canvasul „extend” înainte de API. */
  extendCanvasLongEdge: number;
};

function normalizeDpi(dpi: number | null | undefined): number {
  if (dpi == null || !Number.isFinite(dpi) || dpi <= 0) return 300;
  return Math.round(dpi);
}

/**
 * 300 DPI → 2K + calitate mare OpenAI.
 * 150 DPI → 1K + medium.
 * 72 DPI (și mai jos) → 1K + low.
 * Peste 300 (custom) → 2K (nu 4K automat, ca să nu explodeze costul).
 */
export function resolvePrintGenerationProfile(
  dpi: number | null | undefined,
): PrintGenerationProfile {
  const targetDpi = normalizeDpi(dpi);

  if (targetDpi >= 300) {
    return {
      targetDpi,
      geminiImageSize: "2K",
      openaiQuality: "high",
      extendCanvasLongEdge: 1536,
    };
  }

  if (targetDpi >= 150) {
    return {
      targetDpi,
      geminiImageSize: "1K",
      openaiQuality: "medium",
      extendCanvasLongEdge: 1024,
    };
  }

  return {
    targetDpi,
    geminiImageSize: "1K",
    openaiQuality: "low",
    extendCanvasLongEdge: 1024,
  };
}

export function formatGenerationProfileHint(profile: PrintGenerationProfile): string {
  return `${profile.geminiImageSize} · ${profile.targetDpi} DPI`;
}
