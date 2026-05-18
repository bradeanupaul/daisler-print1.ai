/** Safe zone + bleed în prompturi AI — doar procente, fără mm. */

export type SafeZonePercents = {
  insetXPct: number;
  insetYPct: number;
};

export type BleedPercents = {
  bleedXPctPerSide: number;
  bleedYPctPerSide: number;
};

export function computeSafeZonePercents(
  safeMarginMm: number,
  netWidthMm: number,
  netHeightMm: number,
): SafeZonePercents | null {
  if (!safeMarginMm || safeMarginMm <= 0) return null;
  if (netWidthMm <= 0 || netHeightMm <= 0) return null;
  return {
    insetXPct: Math.round((safeMarginMm / netWidthMm) * 1000) / 10,
    insetYPct: Math.round((safeMarginMm / netHeightMm) * 1000) / 10,
  };
}

export function computeBleedPercents(
  bleedMm: number,
  netWidthMm: number,
  netHeightMm: number,
): BleedPercents | null {
  if (!bleedMm || bleedMm <= 0) return null;
  if (netWidthMm <= 0 || netHeightMm <= 0) return null;
  return {
    bleedXPctPerSide: Math.round((bleedMm / netWidthMm) * 1000) / 10,
    bleedYPctPerSide: Math.round((bleedMm / netHeightMm) * 1000) / 10,
  };
}

export type PrintMarginsPromptOpts = {
  netWidthMm: number;
  netHeightMm: number;
  safeMarginMm?: number;
  bleedMm?: number;
};

/**
 * Bloc universal pentru extend + recompose: safe zone (%) + bleed (%) — post-procesare automată.
 */
export function buildPrintMarginsPromptBlock(opts: PrintMarginsPromptOpts): string {
  const { netWidthMm, netHeightMm, safeMarginMm = 0, bleedMm = 0 } = opts;
  const lines: string[] = [
    `PRINT CANVAS: output = NET trim only (${netWidthMm}×${netHeightMm} mm).`,
  ];

  const safe = computeSafeZonePercents(safeMarginMm, netWidthMm, netHeightMm);
  if (safe) {
    lines.push(
      "",
      "SAFE ZONE (inset from each trim edge — use percentages, not mm):",
      `- Left and right: ${safe.insetXPct}% of total width each (no effective content in this band).`,
      `- Top and bottom: ${safe.insetYPct}% of total height each (no effective content in this band).`,
      "- FORBIDDEN inside safe zone: text, typography, logos, faces, QR codes, product photos, icons, buttons, CTAs, key subjects, readable copy.",
      "- ALLOWED in safe zone only: seamless decorative background (solid color, gradient, texture, pattern) that continues from the artwork.",
      "- All critical content must stay inside the inner area (beyond these percentages from the trim edge).",
    );
  }

  const bleed = computeBleedPercents(bleedMm, netWidthMm, netHeightMm);
  if (bleed) {
    lines.push(
      "",
      "BLEED (added automatically after generation — do not draw it):",
      `- ${bleed.bleedXPctPerSide}% of width per side and ${bleed.bleedYPctPerSide}% of height per side will be extrapolated OUTSIDE this trim image.`,
      "- Do NOT include bleed, crop marks, registration marks, or extra canvas beyond the net trim in your output.",
    );
  }

  return lines.join("\n");
}

/** @deprecated Folosește buildPrintMarginsPromptBlock */
export function buildSafeZoneInstruction(
  safeMarginMm: number,
  netWidthMm: number,
  netHeightMm: number,
): string {
  return buildPrintMarginsPromptBlock({
    netWidthMm,
    netHeightMm,
    safeMarginMm,
  });
}
