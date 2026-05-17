import { buildSafeZoneInstruction } from "./printSafeZonePrompt";

export function buildUpscaleRecomposePrompt(opts: {
  formatName: string;
  netW: number;
  netH: number;
  safeMarginMm: number;
}): string {
  const { formatName, netW, netH, safeMarginMm } = opts;
  const safe = buildSafeZoneInstruction(safeMarginMm, netW, netH);

  return `PRINT IMAGE RECREATION — GENERATE A COMPLETE NEW LAYOUT (not a lazy stretch).

You must RECREATE the full print artwork for trim ${netW}×${netH} mm (${formatName}). Output = one cohesive, print-ready image filling the frame edge-to-edge. Bleed is added separately after you finish — do NOT paint bleed bands.
${safe}

PRIMARY TASK:
Treat the reference as separate visual pieces (background, frames, logos, type, icons, photos). RE-POSITION and RE-ORDER them so the composition fits ${netW}×${netH} mm. Each piece may be scaled, rotated, or cropped independently.

FORBIDDEN:
- Solving the new ratio only by stretching the entire source.
- Adding new logos, text, clipart, or imagery not present in the reference.
- Placing critical content inside the safe-zone margins defined above.

ALLOWED:
- Move, overlap, reorder, crop, per-element scale, line breaks using existing words only.
- Fill empty areas with colors/patterns already visible in the source.

Deliver a fully recreated professional print design respecting safe zone percentages.`;
}
