/**
 * Prompt pentru modul „recompose”: reconstrucție de layout din piese existente
 * (mutare, reordonare, scale per-element) — fără conținut nou; evită stretch global leneș.
 */
export function buildUpscaleRecomposePrompt(opts: {
  formatName: string;
  targetW: number;
  targetH: number;
  bleedMm: number;
}): string {
  const { formatName, targetW, targetH, bleedMm } = opts;
  return `PRINT RECOMPOSITION — REAL LAYOUT REBUILD (not a global stretch).

Target: ${formatName}, total ~${targetW}×${targetH} mm including ~${bleedMm} mm bleed per side.

PRIMARY TASK — DO THIS, NOT STRETCH:
Treat the source as a set of SEPARATE visual pieces (background bands, frames, logos, type blocks, icons, photos, ornaments). You MUST actively RE-POSITION and RE-ORDER them on the new canvas so the composition fits the target aspect ratio. You may place pieces in ANY spatial order you want (top/bottom/left/right/center, stacked, split columns, hero + footer band, etc.). Each piece may be scaled, rotated, or cropped INDEPENDENTLY — non-uniform layout is encouraged. Per-element scale may differ strongly from neighbor elements.

FORBIDDEN AS THE MAIN SOLUTION:
- Do NOT solve the new aspect ratio mainly by one uniform scale or squash of the entire artwork (whole-image stretch). That is a failed recomposition. If you only stretch globally, the job is wrong.

ALLOWED TRANSFORMS ON EXISTING CONTENT ONLY:
- Move, overlap, reorder layers, change gaps, rotate, crop to frame, scale each motif or text block separately, break one text block into multiple lines using the SAME words/letters already in the source.
- You may warp or perspective-correct existing regions if it helps integration, as long as every visible graphic or letterform is traceable to the source (no new drawings or new words).

ABSOLUTE CONSTRAINT — NO NEW CONTENT:
1) Do NOT add logos, icons, mascots, clipart, photos, QR codes, watermarks, badges, ornaments, illustrations, or shapes that do not already appear in the reference.
2) Do NOT invent new readable text, slogans, addresses, or dates. Only rearrange or restyle text that already exists in the source; do not substitute new copy.
3) Empty areas after rearrangement: fill with minimal bleed from existing nearby colors/patterns only — no new pictorial scenes.

The result must still read as the SAME brand/design, but physically re-laid out — not a stretched photocopy.`;
}
