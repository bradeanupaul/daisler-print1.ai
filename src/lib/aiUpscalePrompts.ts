/**
 * Prompturi upscale — structură unică: TASK + ALLOWED + PRESERVATION + CONSTRAINTS + QUALITY.
 * Tier: short | premium (env AI_UPSCALE_PROMPT_TIER, implicit premium).
 */
import { buildPrintMarginsPromptBlock } from "./printSafeZonePrompt";

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
  bleedMm?: number;
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
  const margins = buildPrintMarginsPromptBlock({
    netWidthMm: ctx.netW,
    netHeightMm: ctx.netH,
    safeMarginMm: ctx.safeMarginMm,
    bleedMm: ctx.bleedMm,
  });
  if (margins) block += `\n\n${margins}`;
  return block;
}

const NEGATIVE_EXTEND = `STRICT CONSTRAINTS:
No new subjects. No duplicated objects. No redesign. No style changes. No altered proportions inside the original frame. No warped geometry. No modified text. No inconsistent lighting. No letterboxing or white bars.`;

const NEGATIVE_RECOMPOSE = `STRICT CONSTRAINTS:
No generated elements. No deletion of existing elements. No content replacement. No new graphics. No hallucinated details. No typography changes. No visual redesign of individual elements. No style drift. No letterboxing or inner white margins inside the trim — the design must fill the frame.`;

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
FRAME FILL (mandatory for print trim): The output must completely fill the pixel frame edge to edge — no white margins inside the trim area, no letterboxing, no small centered design with empty bands on the sides or top/bottom. Scale and spread the layout to use the full width and height of the frame. Critical text/logos stay inside the safe zone from the margins block; backgrounds and visuals may extend to the trim edges.`;

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
