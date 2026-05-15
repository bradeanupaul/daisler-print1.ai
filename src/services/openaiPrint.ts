/**
 * OpenAI: imagini (images.edit), vision (gpt-4o), agent, TTS.
 * Implicit gpt-image-2 + opțional ciclu critică vision + regenerare.
 */
import OpenAI, { toFile } from "openai";
import { resolveOpenAIApiKey } from "../lib/aiKeys";
import {
  resolveOpenAIImageCritiqueEnabled,
  resolveOpenAIImageMaxPasses,
  resolveOpenAIImageModel,
  resolveOpenAIImageQuality,
} from "../lib/openaiImageConfig";
import { buildUpscaleExtendOutpaintPrompt } from "../lib/extendOutpaintPrompt";
import { buildUpscaleRecomposePrompt } from "../lib/recomposePrompt";
import { composeExtendCenterContain, pickCanvasSizeForMmAspect } from "../lib/upscaleCompose";
import type { UpscaleMode } from "../types";
import type { ProcessingStageReporter } from "../lib/processingStage";
import { resolveOpenAIAgentModel, resolveOpenAIVisionModel } from "../lib/openaiTextConfig";

function getClient(): OpenAI {
  const apiKey = resolveOpenAIApiKey().trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");
  return new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
}

async function dataUrlToUploadable(dataUrl: string) {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const type =
    blob.type && blob.type !== "application/octet-stream"
      ? blob.type
      : "image/png";
  return toFile(blob, "input.png", { type });
}

function pickEditSize(
  wMm: number,
  hMm: number
): "1024x1024" | "1536x1024" | "1024x1536" | "auto" {
  if (wMm <= 0 || hMm <= 0) return "auto";
  const r = wMm / hMm;
  if (r >= 1.35) return "1536x1024";
  if (r <= 0.75) return "1024x1536";
  return "1024x1024";
}

async function imageEditSingle(
  imageData: string,
  prompt: string,
  widthMmHint: number,
  heightMmHint: number
): Promise<string | null> {
  const client = getClient();
  const image = await dataUrlToUploadable(imageData);
  const size = pickEditSize(widthMmHint, heightMmHint);
  const rsp = await client.images.edit({
    model: resolveOpenAIImageModel() as any,
    image,
    prompt,
    quality: resolveOpenAIImageQuality(),
    size,
  });
  const b64 = rsp.data?.[0]?.b64_json;
  if (!b64) return null;
  return `data:image/png;base64,${b64}`;
}

/** Un singur pas images.edit — pentru rafinări rapide din UI (comparare duală). */
export async function quickImageEditFromPrompt(
  imageData: string,
  userInstruction: string,
  widthMmHint = 210,
  heightMmHint = 297
): Promise<string | null> {
  const prompt = `Edit this image for professional print output. Apply the user's change precisely. No watermarks; preserve readability.

User instruction:
${userInstruction}`;
  return imageEditSingle(imageData, prompt, widthMmHint, heightMmHint);
}

type CritiqueContext = {
  intentSummary: string;
  referenceForCritique: string;
};

async function critiqueGeneratedImage(
  generatedDataUrl: string,
  intentSummary: string,
  referenceDataUrl: string
): Promise<{
  shouldRegenerate: boolean;
  issues: string[];
  promptAddendum: string;
}> {
  const client = getClient();
  const instruction = `You are strict QA for AI print / outpainting / mockup generation.

INTENT (what the edit should achieve):
${intentSummary.slice(0, 3500)}

Two images follow in order:
1) REFERENCE = input before this generation step (layout / artwork as sent to the image model).
2) OUTPUT = the generated image to judge.

Return ONE JSON object only:
{
  "shouldRegenerate": boolean,
  "issues": string[],
  "promptAddendum": string
}

Set shouldRegenerate true ONLY for clear defects: obvious seams; large flat-color fills where the reference shows structured patterns (radial rays, stripes, grids); cropped or damaged central artwork that must stay intact; unreadable garbled text; watermarks; severe banding.
For OUTPAINTING / EXTEND jobs specifically: broad empty bands of solid cream, beige, off-white, or flat "paper" directly beside rich decorative edges (sunburst, stripes, frames) that clearly demanded pattern continuation — treat as a defect (shouldRegenerate true) and name which margin needs continued ornament.
For PRINT RECOMPOSITION / LAYOUT-ONLY intents (when INTENT forbids new content): shouldRegenerate true if OUTPUT adds logos, icons, mascots, clipart, QR codes, new photos, new decorative illustrations, or clearly new readable text/slogans not present in REFERENCE. Slight paraphrase or illegible blur alone is not enough — focus on visibly NEW objects or copy.
Also for recomposition: shouldRegenerate true if OUTPUT is clearly just a uniform global stretch/squash of the whole piece with almost no change in relative positions of major blocks (lazy scale-to-fit) — promptAddendum should demand discrete repositioning and independent per-element scaling, not whole-image stretch.
Minor style differences or slight softness: shouldRegenerate false.

promptAddendum: concise English instructions for the NEXT image-edit prompt (empty if shouldRegenerate is false). Max 900 characters. Be specific (e.g. "continue red-blue radial rays into top margin; do not use solid red fill").`;

  try {
    const completion = await client.chat.completions.create({
      model: resolveOpenAIVisionModel(),
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: instruction },
            { type: "text", text: "REFERENCE:" },
            { type: "image_url", image_url: { url: referenceDataUrl } },
            { type: "text", text: "OUTPUT:" },
            { type: "image_url", image_url: { url: generatedDataUrl } },
          ],
        },
      ],
      max_tokens: 900,
    });
    const text = completion.choices[0]?.message?.content;
    if (!text) {
      return { shouldRegenerate: false, issues: [], promptAddendum: "" };
    }
    const parsed = JSON.parse(text.replace(/```json\n?|\n?```/g, "").trim());
    return {
      shouldRegenerate: !!parsed.shouldRegenerate,
      issues: Array.isArray(parsed.issues) ? parsed.issues.map(String) : [],
      promptAddendum: typeof parsed.promptAddendum === "string" ? parsed.promptAddendum : "",
    };
  } catch (e) {
    console.warn("critiqueGeneratedImage failed, skipping retry:", e);
    return { shouldRegenerate: false, issues: [], promptAddendum: "" };
  }
}

async function imageEditFromDataUrlWithQualityLoop(
  editSourceDataUrl: string,
  basePrompt: string,
  widthMmHint: number,
  heightMmHint: number,
  critique: CritiqueContext,
  reporter?: ProcessingStageReporter,
): Promise<string | null> {
  const maxPasses = resolveOpenAIImageMaxPasses();
  const useCritique = resolveOpenAIImageCritiqueEnabled();
  const model = resolveOpenAIImageModel();
  let prompt = basePrompt;
  let last: string | null = null;

  for (let pass = 0; pass < maxPasses; pass++) {
    reporter?.progressStep?.(pass, maxPasses, `OpenAI (${model}): generare ${pass + 1}/${maxPasses}…`);
    const out = await imageEditSingle(
      editSourceDataUrl,
      prompt,
      widthMmHint,
      heightMmHint
    );
    if (!out) return last;
    last = out;

    if (!useCritique || pass >= maxPasses - 1) break;

    reporter?.stage(`OpenAI: verificare calitate (pas ${pass + 1})…`);
    const c = await critiqueGeneratedImage(
      out,
      critique.intentSummary,
      critique.referenceForCritique
    );
    if (!c.shouldRegenerate || !String(c.promptAddendum || "").trim()) {
      reporter?.stage("OpenAI: verificare OK, nu e nevoie de regenerare.");
      break;
    }

    reporter?.stage(`OpenAI: regenerare cu corecții (${pass + 2}/${maxPasses})…`);
    const issueBlock =
      c.issues.length > 0
        ? c.issues.map((x, i) => `${i + 1}. ${x}`).join("\n")
        : "(see corrections below)";
    prompt = `${basePrompt}\n\n--- QA refinement (attempt ${pass + 2} of ${maxPasses}) ---\nObserved issues:\n${issueBlock}\n\nApply these corrections in the next render:\n${c.promptAddendum}`;
  }
  if (last) reporter?.stage("OpenAI: imagine finalizată.");
  return last;
}

export async function analyzePrintQuality(
  imageData: string,
  targetDpi: number,
  targetWidthMm: number,
  targetHeightMm: number
) {
  try {
    const client = getClient();
    const prompt = `Analyze this image for professional printing.
Target print size: ${targetWidthMm}x${targetHeightMm} mm at ${targetDpi} DPI.

Reply with a single JSON object ONLY (no markdown), with keys:
- currentEstimatedQuality: "low" | "medium" | "high"
- issues: string[]
- recommendations: string[]
- canUpscaleHelp: boolean
- colorWarnings: array of { "color": string, "reason": string }
- boundingBoxes: array of { "box_2d": [number, number, number, number], "label": string } where box_2d is [ymin, xmin, ymax, xmax] on a 0-1000 normalized scale

Writing rules for issues and recommendations:
- Use concrete, technical phrases (e.g. effective resolution vs target DPI, trim/safe margins, blur, banding, out-of-gamut hues, small text size).
- Do NOT use vague one-word judgments or misspelled shorthand alone, such as: "slab", "slabă", "bun", "bon", "prost", "ok", "naspa" as a full line. Avoid standalone subjective ratings; pair every claim with a measurable detail.`;

    const completion = await client.chat.completions.create({
      model: resolveOpenAIVisionModel(),
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageData } },
          ],
        },
      ],
      max_tokens: 1500,
    });

    const text = completion.choices[0]?.message?.content;
    if (!text) return null;
    const clean = text.replace(/```json\n?|\n?```/g, "").trim();
    const result = JSON.parse(clean);
    return {
      currentEstimatedQuality: result.currentEstimatedQuality || "medium",
      issues: result.issues || [],
      recommendations: result.recommendations || [],
      canUpscaleHelp: !!result.canUpscaleHelp,
      colorWarnings: result.colorWarnings || [],
      boundingBoxes: result.boundingBoxes || [],
    };
  } catch (e: unknown) {
    console.error("OpenAI analyzePrintQuality failed:", e);
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("429") || msg.toLowerCase().includes("rate")) {
      throw new Error("QUOTA_EXHAUSTED");
    }
    return null;
  }
}

export async function processAgentMessage(
  message: string,
  currentSettings: unknown,
  hasFile: boolean
) {
  const client = getClient();
  const system = `You are print1.ai Print Agent. Help prepare files for printing. Reply in Romanian in the "reply" field.

Current settings JSON: ${JSON.stringify(currentSettings)}
Has file uploaded: ${hasFile}

Formats: business-card (90x50mm), a4 (210x297mm), a3 (297x420mm), a5 (148x210mm), banner-100-200 (1000x2000mm), mug-wrap (200x90mm), sticker (100x100mm).

Return ONE JSON object only with keys:
- reply: string (Romanian)
- settingsUpdate: optional object with keys: formatId, dpi, bleed, safeMargin, addCutLine, simulateCMYK
- action: one of process, download, request_file, upscale, imposition, none`;

  const completion = await client.chat.completions.create({
    model: resolveOpenAIAgentModel(),
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: message },
    ],
    max_tokens: 800,
  });

  const text = completion.choices[0]?.message?.content;
  if (!text)
    return { reply: "Răspuns gol de la model.", action: "none" as const };
  try {
    return JSON.parse(text);
  } catch {
    return {
      reply: "Nu am putut interpreta răspunsul. Reformulează te rog.",
      action: "none" as const,
    };
  }
}

export async function generateSpeech(text: string): Promise<string | null> {
  const client = getClient();
  const res = await client.audio.speech.create({
    model: "tts-1-hd",
    voice: "nova",
    input: text.slice(0, 4000),
    response_format: "wav",
  });
  const buf = await res.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export async function upscaleImage(
  imageData: string,
  targetW: number,
  targetH: number,
  formatName: string,
  bleedMm: number,
  mode: UpscaleMode = "extend",
  reporter?: ProcessingStageReporter,
) {
  if (mode === "extend") {
    const { width: cw, height: ch } = pickCanvasSizeForMmAspect(targetW, targetH);
    reporter?.stage(`OpenAI: compun canvas extend (${cw}×${ch}px)…`);
    const composite = await composeExtendCenterContain(imageData, cw, ch);
    const prompt = buildUpscaleExtendOutpaintPrompt({
      formatName,
      targetW,
      targetH,
      bleedMm,
    });
    return imageEditFromDataUrlWithQualityLoop(composite, prompt, targetW, targetH, {
      intentSummary: prompt,
      referenceForCritique: composite,
    }, reporter);
  }

  reporter?.stage("OpenAI: pregătesc upscale recompose…");
  const prompt = buildUpscaleRecomposePrompt({
    formatName,
    targetW,
    targetH,
    bleedMm,
  });
  return imageEditFromDataUrlWithQualityLoop(imageData, prompt, targetW, targetH, {
    intentSummary: prompt,
    referenceForCritique: imageData,
  }, reporter);
}

export async function generativeFill(
  imageData: string,
  bleedMm: number,
  targetWidthMm: number,
  targetHeightMm: number,
  reporter?: ProcessingStageReporter,
) {
  reporter?.stage(`OpenAI: extind bleed (${bleedMm}mm pe latură)…`);
  const prompt = `DESIGN EXTENSION for print bleed (~${bleedMm}mm on each side). The central ${targetWidthMm}×${targetHeightMm} mm artwork must stay pixel-identical — only the outer bleed band is edited.

You must continue REAL graphic structure from the edges (sunbursts, rays, stripes, frames, halftone, texture, ornamental borders) into the new area. FORBIDDEN: wide flat cream/beige/paper voids next to busy patterned edges; no white “picture frame” halo. Seamless continuation of the same visual language.`;
  const totalW = targetWidthMm + 2 * bleedMm;
  const totalH = targetHeightMm + 2 * bleedMm;
  return imageEditFromDataUrlWithQualityLoop(imageData, prompt, totalW, totalH, {
    intentSummary: prompt,
    referenceForCritique: imageData,
  }, reporter);
}

export async function generateCustomMockup(
  userPrompt: string,
  designImageData: string,
  _apiKey?: string
) {
  const prompt = `Photorealistic product mockup. ${userPrompt}

The attached image is the print artwork. Integrate it realistically onto the product with correct lighting, perspective, and material. Studio background, professional product photo.`;
  return imageEditFromDataUrlWithQualityLoop(designImageData, prompt, 1, 1, {
    intentSummary: prompt,
    referenceForCritique: designImageData,
  });
}
