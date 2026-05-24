/** Safe zone în prompturi AI — procente + mm din setări, fără bleed (post-proces algoritmic). */

export type SafeZonePercents = {
  insetXPct: number;
  insetYPct: number;
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

export type PrintSafeZonePromptOpts = {
  netWidthMm: number;
  netHeightMm: number;
  safeMarginMm?: number;
  /** Dacă input-ul include ghid vizual portocaliu (dashed). */
  inputHasSafeGuide?: boolean;
};

const INPUT_SAFE_GUIDE = `INPUT LAYOUT GUIDE (reference only — never reproduce in OUTPUT):
The INPUT image may show a faint dashed orange rectangle. That rectangle marks the CONTENT SAFE AREA — the only region where text, logos, faces, and CTAs may appear. Use it for layout. Do NOT draw, label, crop marks, or reproduce this guide in the OUTPUT.`;

/**
 * Bloc safe zone pentru extend + recompose (Gemini + OpenAI).
 * Valorile mm/% provin din setările utilizatorului (sidebar), nu sunt fixe în cod.
 */
export function buildPrintSafeZonePromptBlock(opts: PrintSafeZonePromptOpts): string {
  const { netWidthMm, netHeightMm, safeMarginMm = 0, inputHasSafeGuide } = opts;
  const lines: string[] = [
    `PRINT CANVAS: output = NET trim only (${netWidthMm}×${netHeightMm} mm).`,
    "Do NOT draw percentage labels, dimension text, crop marks, magenta trim lines, or guide overlays on the image.",
  ];

  const safe = computeSafeZonePercents(safeMarginMm, netWidthMm, netHeightMm);
  if (safe && safeMarginMm > 0) {
    if (inputHasSafeGuide) {
      lines.push("", INPUT_SAFE_GUIDE);
    }
    lines.push(
      "",
      `PRINT SAFE MARGINS (${safeMarginMm} mm inset from each trim edge on ${netWidthMm}×${netHeightMm} mm net):`,
      "",
      "CONTENT SAFE AREA (inner rectangle — mandatory for all critical content):",
      `- Inset from each trim edge: ${safe.insetXPct}% of width (${safeMarginMm} mm) on left and right; ${safe.insetYPct}% of height (${safeMarginMm} mm) on top and bottom.`,
      "- Place ENTIRELY inside this inner area: all text, typography, logos, brand marks, faces, QR codes, product photos, icons, buttons, CTAs, key subjects, readable copy.",
      "- Critical content must not touch, cross, or sit in the outer margin bands. Leave clear breathing room inside the safe area when possible.",
      "",
      "MARGIN BANDS (outer strips between trim and content safe area):",
      "- No effective content here — only seamless decorative background (solid, gradient, texture, pattern) continuing from the artwork.",
      "- Backgrounds and atmosphere may extend to the trim edges; critical content may NOT.",
      "",
      "PRIORITY: Content safe area rules override any instruction to fill the frame edge-to-edge or maximize edge placement.",
    );
  }

  return lines.join("\n");
}

/** @deprecated Folosește buildPrintSafeZonePromptBlock */
export const buildPrintMarginsPromptBlock = buildPrintSafeZonePromptBlock;

/** @deprecated Folosește buildPrintSafeZonePromptBlock */
export function buildSafeZoneInstruction(
  safeMarginMm: number,
  netWidthMm: number,
  netHeightMm: number,
): string {
  return buildPrintSafeZonePromptBlock({
    netWidthMm,
    netHeightMm,
    safeMarginMm,
  });
}
