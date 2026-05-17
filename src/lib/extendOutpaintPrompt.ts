import { buildSafeZoneInstruction } from "./printSafeZonePrompt";

export function buildUpscaleExtendOutpaintPrompt(opts: {
  formatName: string;
  netW: number;
  netH: number;
  safeMarginMm: number;
}): string {
  const { formatName, netW, netH, safeMarginMm } = opts;
  const safe = buildSafeZoneInstruction(safeMarginMm, netW, netH);

  return `PRINT IMAGE RECREATION — EXTEND & REBUILD FOR TRIM ${netW}×${netH} mm (${formatName}).

RECREATE a complete print-ready image from the reference. The input may show the design centered with white margins — FILL empty areas by extending real graphics (patterns, rays, frames, texture). Edge-to-edge artwork; no leftover white margins. Bleed is added after generation — do NOT paint bleed.
${safe}

RULES:
1) Preserve and enhance the brand design — integrate margins into one unified layout.
2) Extend real structure from edges; no large flat voids beside busy patterns.
3) Respect safe zone percentages for all critical content.
4) No watermarks or unrelated imagery.

Output: one recreated image for ${netW}×${netH} mm trim only.`;
}
