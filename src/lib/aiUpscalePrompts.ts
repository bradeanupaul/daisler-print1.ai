/**
 * Prompturi upscale — structură unică: TASK + ALLOWED + PRESERVATION + CONSTRAINTS + QUALITY.
 * Tier: short | premium (env AI_UPSCALE_PROMPT_TIER, implicit premium).
 */
import { buildPrintSafeZonePromptBlock } from "./printSafeZonePrompt";

export type UpscalePromptMode = "extend" | "recompose";
export type UpscalePromptTier = "short" | "premium";
export type ExtendMarginBands = "top-bottom" | "left-right" | "minimal";

export type UpscaleTargetContext = {
  formatName: string;
  netW: number;
  netH: number;
  /** Extend: dimensiune canvas trimis la model. */
  canvasPxW?: number;
  canvasPxH?: number;
  bands?: ExtendMarginBands;
  safeMarginMm?: number;
};

export function resolveUpscalePromptTier(): UpscalePromptTier {
  const raw =
    (typeof process !== "undefined" &&
      process.env.AI_UPSCALE_PROMPT_TIER &&
      String(process.env.AI_UPSCALE_PROMPT_TIER).trim().toLowerCase()) ||
    "";
  return raw === "short" ? "short" : "premium";
}

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

function formatAspect(netW: number, netH: number): string {
  const g = gcd(netW, netH);
  return `${Math.round(netW / g)}:${Math.round(netH / g)}`;
}

function targetBlock(ctx: UpscaleTargetContext): string {
  const aspect = formatAspect(ctx.netW, ctx.netH);
  let block = `TARGET: ${ctx.netW}×${ctx.netH} mm (${ctx.formatName}), aspect ratio ${aspect}.`;
  if (ctx.canvasPxW && ctx.canvasPxH) {
    block += `\nINPUT FRAME: ${ctx.canvasPxW}×${ctx.canvasPxH} px (final aspect ratio).`;
  }
  if (ctx.bands === "top-bottom") {
    block += "\nEmpty bands to fill: top and bottom (center artwork unchanged).";
  } else if (ctx.bands === "left-right") {
    block += "\nEmpty bands to fill: left and right (center artwork unchanged).";
  }
  const safeBlock = buildPrintSafeZonePromptBlock({
    netWidthMm: ctx.netW,
    netHeightMm: ctx.netH,
    safeMarginMm: ctx.safeMarginMm,
    inputHasSafeGuide: (ctx.safeMarginMm ?? 0) > 0,
  });
  if (safeBlock) block += `\n\n${safeBlock}`;
  return block;
}

const NEGATIVE_EXTEND = `STRICT CONSTRAINTS:
No new subjects. No duplicated objects. No redesign. No style changes. No altered proportions inside the original frame. No warped geometry. No modified text. No inconsistent lighting. No letterboxing or white bars.`;

const NEGATIVE_RECOMPOSE = `STRICT CONSTRAINTS:
No generated elements. No deletion of existing elements. No content replacement. No new graphics. No hallucinated details. No typography changes. No visual redesign of individual elements. No style drift. No letterboxing or inner white margins inside the trim. No reproducing input layout guides (dashed orange rectangle) in the output.`;

function buildExtendShort(ctx: UpscaleTargetContext): string {
  return `${targetBlock(ctx)}

TASK — SEAMLESS EXTEND / OUTPAINT (V1: complete what is missing)

Extend the image seamlessly to fit the target aspect ratio.

Preserve the original composition, proportions, subject placement, colors, lighting, perspective, and visual identity.

Only expand the existing environment naturally beyond the original frame boundaries.

Do not redesign the layout. Do not move existing elements. Do not add new objects. Do not remove anything. Do not modify the original content inside the initial frame.

The original image must remain untouched inside its initial boundaries.

The extension must look like a natural continuation of the original image with consistent texture, depth, lighting, and style.

${NEGATIVE_EXTEND}

QUALITY TARGET: The result should appear as if the original image was always created at the target aspect ratio.`;
}

function buildExtendPremium(ctx: UpscaleTargetContext): string {
  return `${targetBlock(ctx)}

TASK — SEAMLESS EXTEND / OUTPAINT (production)

Seamlessly outpaint this image to the target aspect ratio while preserving the original image completely intact.

ALLOWED OPERATIONS:
- seamless outpaint / extend canvas
- continue environment beyond the current frame boundaries
- expand existing background, texture, gradients, patterns from inner edges only
- natural continuation of lighting, depth, and atmosphere

PRESERVATION RULES (preserve composition — layout stays the same inside the initial frame):
- original composition unchanged
- exact subject positioning inside the initial boundaries
- perspective consistency
- lighting direction, shadows, reflections
- texture continuity and color palette
- all original text, logos, and subjects unchanged
- The original image must remain untouched inside its initial boundaries.

${NEGATIVE_EXTEND}

QUALITY TARGET: The result should appear as if the original image was always created in the new aspect ratio.`;
}

const RECOMPOSE_FRAME_FILL = `
FRAME FILL (print trim — backgrounds only at edges): The output must fill the pixel frame with no letterboxing or inner white margins. Scale and balance the layout for the target aspect ratio. Decorative backgrounds, textures, gradients, and atmosphere may extend to all trim edges. ALL critical content (text, logos, faces, CTAs, key subjects) must remain fully inside the CONTENT SAFE AREA from the margins block — never in the outer margin bands. Content safe area rules take priority over edge-to-edge placement.`;

function buildRecomposeShort(ctx: UpscaleTargetContext): string {
  return `${targetBlock(ctx)}
${RECOMPOSE_FRAME_FILL}

TASK — RECOMPOSITION / LAYOUT ADAPTATION (V2: redo layout without inventing anything)

Recompose the image for the target aspect ratio using only the existing elements already present in the original image.

Use only the assets already available in the original image.

Reposition, resize, crop, and rearrange existing elements to optimize composition and balance for the new format.

Do not generate new content. Do not remove anything. Do not redesign individual elements. Do not alter text, graphics, or subjects.

${NEGATIVE_RECOMPOSE}

QUALITY TARGET: Professional layout adaptation of the same image for the new format using only original assets.`;
}

function buildRecomposePremium(ctx: UpscaleTargetContext): string {
  return `${targetBlock(ctx)}
${RECOMPOSE_FRAME_FILL}

TASK — RECOMPOSITION / LAYOUT ADAPTATION (production)

Adapt this image to the target aspect ratio through composition-only redesign.

Use exclusively the visual elements already present in the original image.
Use only the assets already available in the original image.

ALLOWED OPERATIONS (adapt composition — layout may change, elements must not):
- reposition existing elements
- rebalance spacing and negative space
- adjust scale proportionally per element
- reorganize layout hierarchy
- optimize alignment
- intelligent crop
- redistribute elements within the frame

PRESERVATION RULES:
- original visual identity, style, colors, design language
- every element from the original must remain present (nothing removed)
- typography content unchanged; all text fully legible
- facial identity and object appearance unchanged

${NEGATIVE_RECOMPOSE}

QUALITY TARGET: Professionally art-directed adaptation for the new format using only original assets.`;
}

export type AiBleedPromptContext = {
  formatName: string;
  netW: number;
  netH: number;
  bleedMm: number;
  canvasPxW: number;
  canvasPxH: number;
  safeMarginMm?: number;
};

function buildAiBleedPremium(ctx: AiBleedPromptContext): string {
  const totalW = ctx.netW + 2 * ctx.bleedMm;
  const totalH = ctx.netH + 2 * ctx.bleedMm;
  const safeBlock = buildPrintSafeZonePromptBlock({
    netWidthMm: ctx.netW,
    netHeightMm: ctx.netH,
    safeMarginMm: ctx.safeMarginMm,
    inputHasSafeGuide: (ctx.safeMarginMm ?? 0) > 0,
  });
  return `TARGET PRINT: net trim ${ctx.netW}×${ctx.netH} mm (${ctx.formatName}).
BLEED: ${ctx.bleedMm} mm on each side → total sheet ${totalW}×${totalH} mm.
OUTPUT FRAME: ${ctx.canvasPxW}×${ctx.canvasPxH} px (full bleed included).

TASK — EXPAND NET ARTWORK WITH PRINT BLEED

INPUT: the NET TRIM artwork only (no bleed margins yet).
OUTPUT: expand the canvas to ${ctx.canvasPxW}×${ctx.canvasPxH} px by adding ${ctx.bleedMm} mm bleed on EACH side.

Naturally continue the illustration at all four edges — textures, colors, lighting, brush strokes, line work, and style must flow outward seamlessly. The original net artwork content must remain intact at the same relative scale in the center (not shrunk into a miniature).

ALLOWED:
- generative outpaint in the new outer margin areas only
- organic edge continuation matching the existing illustration style
- print-ready seamless bleed for trimming

FORBIDDEN:
- pixel-stretch, smear, mirror reflection, or 1px extrapolation
- abstract marbled/swirly filler unrelated to the edge pixels
- blur, glow, halo, vignette, or soft shadow around the artwork
- shrinking the design into a miniature with a blurred copy behind it
- white borders, empty margins, or letterboxing anywhere in the output
- any change, recrop, or redesign inside the original net artwork
- new objects, text, logos, or hallucinated details in the center

The result must look like the same illustration extended outward — edge pixels continued naturally.

${safeBlock ? `\n${safeBlock}\n` : ""}
QUALITY TARGET: Production-ready print file with ${ctx.bleedMm} mm bleed; center identical to input; bleed bands seamless at trim.`;
}

/** Prompt dedicat bleed generativ (margini exterioare doar). */
export function buildAiBleedPrompt(
  ctx: AiBleedPromptContext,
  tier: UpscalePromptTier = resolveUpscalePromptTier(),
): string {
  if (tier === "short") {
    return `Expand net ${ctx.netW}×${ctx.netH}mm (${ctx.formatName}) with ${ctx.bleedMm}mm bleed/side. Outpaint edges naturally to ${ctx.canvasPxW}×${ctx.canvasPxH}px. Keep center art unchanged. No smear/marble/white borders.`;
  }
  return buildAiBleedPremium(ctx);
}

/** Prompt universal upscale — același text pentru OpenAI și Gemini. */
export function buildUpscalePrompt(
  mode: UpscalePromptMode,
  ctx: UpscaleTargetContext,
  tier: UpscalePromptTier = resolveUpscalePromptTier(),
): string {
  if (mode === "extend") {
    return tier === "short" ? buildExtendShort(ctx) : buildExtendPremium(ctx);
  }
  return tier === "short" ? buildRecomposeShort(ctx) : buildRecomposePremium(ctx);
}
