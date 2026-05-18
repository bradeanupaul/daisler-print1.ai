/**
 * OpenAI: imagini (images.edit), vision (gpt-4o), agent, TTS.
 * Implicit gpt-image-2 + opțional ciclu critică vision + regenerare.
 */
import OpenAI, { toFile } from "openai";
import { resolveOpenAIApiKey } from "../lib/aiKeys";
import { aiError, aiLog } from "../lib/aiUpscaleLog";
import {
  resolveImageCritiqueEnabled,
  resolveImageMaxPasses,
} from "../lib/aiImageQualityConfig";
import {
  isOpenAIDalle2Model,
  isOpenAIDalle3Model,
  resolveDalle3QualityForDpi,
  resolveOpenAIImageModel,
  resolveOpenAIImageModelForEdit,
  resolveOpenAIImageQualityForDpi,
} from "../lib/openaiImageConfig";
import {
  appendCritiqueToPrompt,
  buildImageCritiqueInstruction,
  parseImageCritiqueJson,
  type ImageCritiqueRequest,
} from "../lib/imageCritique";
import {
  formatGenerationProfileHint,
  resolvePrintGenerationProfile,
} from "../lib/printGenerationProfile";
import { prepareImageForAiUpscale } from "../lib/imageDataUrl";
import { buildUpscalePrompt } from "../lib/aiUpscalePrompts";
import { addAlgorithmicBleed, type PrintLayoutMm } from "../lib/printLayoutPostProcess";
import {
  composeExtendOutpaintCanvas,
  composeRecomposeCanvasForGemini,
  pickUpscaleNetCanvasPixels,
} from "../lib/upscaleCompose";
import type { UpscaleMode } from "../types";
import type { ProcessingStageReporter } from "../lib/processingStage";
import { usageFromReporter } from "../lib/processingStage";
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

function pickGptImageEditSize(
  wMm: number,
  hMm: number,
): "1024x1024" | "1536x1024" | "1024x1536" | "auto" {
  if (wMm <= 0 || hMm <= 0) return "auto";
  const r = wMm / hMm;
  if (r >= 1.35) return "1536x1024";
  if (r <= 0.75) return "1024x1536";
  return "1024x1024";
}

function pickDalle2EditSize(): "256x256" | "512x512" | "1024x1024" {
  return "1024x1024";
}

function pickDalle3Size(
  wMm: number,
  hMm: number,
): "1024x1024" | "1792x1024" | "1024x1792" {
  if (wMm <= 0 || hMm <= 0) return "1024x1024";
  const r = wMm / hMm;
  if (r >= 1.35) return "1792x1024";
  if (r <= 0.75) return "1024x1792";
  return "1024x1024";
}

function extractB64FromImagesResponse(rsp: OpenAI.Images.ImagesResponse): string | null {
  return rsp.data?.[0]?.b64_json ?? null;
}

async function ensureSquarePngDataUrl(imageData: string, side: number): Promise<string> {
  const dataUrl = await prepareImageForAiUpscale(imageData);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = side;
      canvas.height = side;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2D indisponibil"));
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, side, side);
      const nw = img.naturalWidth || img.width;
      const nh = img.naturalHeight || img.height;
      const scale = Math.min(side / nw, side / nh);
      const dw = nw * scale;
      const dh = nh * scale;
      ctx.drawImage(img, (side - dw) / 2, (side - dh) / 2, dw, dh);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("Încărcare imagine eșuată"));
    img.src = dataUrl;
  });
}

async function dalle3GenerateSingle(
  prompt: string,
  widthMmHint: number,
  heightMmHint: number,
  reporter?: ProcessingStageReporter,
  targetDpi?: number,
): Promise<string | null> {
  const client = getClient();
  const model = "dall-e-3";
  const size = pickDalle3Size(widthMmHint, heightMmHint);
  const quality = resolveDalle3QualityForDpi(targetDpi);
  const rsp = await client.images.generate({
    model,
    prompt: prompt.slice(0, 4000),
    n: 1,
    size,
    quality,
    response_format: "b64_json",
  });
  usageFromReporter(reporter)?.recordOpenAIImageEdit(model, "images.generate (DALL-E 3)", rsp, {
    quality,
    size,
  });
  const b64 = extractB64FromImagesResponse(rsp);
  if (b64) return `data:image/png;base64,${b64}`;
  return null;
}

async function imageEditSingle(
  imageData: string,
  prompt: string,
  widthMmHint: number,
  heightMmHint: number,
  reporter?: ProcessingStageReporter,
  targetDpi?: number,
): Promise<string | null> {
  const client = getClient();
  const model = resolveOpenAIImageModelForEdit();

  if (isOpenAIDalle3Model(model)) {
    return dalle3GenerateSingle(prompt, widthMmHint, heightMmHint, reporter, targetDpi);
  }

  if (isOpenAIDalle2Model(model)) {
    const size = pickDalle2EditSize();
    const side = size === "1024x1024" ? 1024 : 512;
    const square = await ensureSquarePngDataUrl(imageData, side);
    const image = await dataUrlToUploadable(square);
    const rsp = await client.images.edit({
      model: "dall-e-2",
      image,
      prompt: prompt.slice(0, 1000),
      n: 1,
      size,
      response_format: "b64_json",
    });
    usageFromReporter(reporter)?.recordOpenAIImageEdit(model, "images.edit (DALL-E 2)", rsp, { size });
    const b64 = extractB64FromImagesResponse(rsp);
    if (b64) return `data:image/png;base64,${b64}`;
    return null;
  }

  const image = await dataUrlToUploadable(imageData);
  const size = pickGptImageEditSize(widthMmHint, heightMmHint);
  const quality = resolveOpenAIImageQualityForDpi(targetDpi);
  const rsp = await client.images.edit({
    model: model as "gpt-image-1" | "gpt-image-2",
    image,
    prompt,
    quality,
    size,
  });
  usageFromReporter(reporter)?.recordOpenAIImageEdit(model, "images.edit", rsp);
  const b64 = extractB64FromImagesResponse(rsp);
  if (!b64) return null;
  return `data:image/png;base64,${b64}`;
}

/** Un singur pas images.edit — pentru rafinări rapide din UI (comparare duală). */
export async function quickImageEditFromPrompt(
  imageData: string,
  userInstruction: string,
  widthMmHint = 210,
  heightMmHint = 297,
  reporter?: ProcessingStageReporter,
  targetDpi?: number,
): Promise<string | null> {
  const prompt = `Edit this image for professional print output. Apply the user's change precisely. No watermarks; preserve readability.

User instruction:
${userInstruction}`;
  return imageEditSingle(imageData, prompt, widthMmHint, heightMmHint, reporter, targetDpi);
}

async function critiqueGeneratedImage(
  generatedDataUrl: string,
  request: ImageCritiqueRequest,
  reporter?: ProcessingStageReporter,
): Promise<{
  shouldRegenerate: boolean;
  issues: string[];
  promptAddendum: string;
}> {
  const client = getClient();
  const instruction = buildImageCritiqueInstruction(request);

  try {
    const visionModel = resolveOpenAIVisionModel();
    const completion = await client.chat.completions.create({
      model: visionModel,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: instruction },
            { type: "text", text: "ORIGINAL:" },
            { type: "image_url", image_url: { url: request.originalImageUrl } },
            { type: "text", text: "OUTPUT:" },
            { type: "image_url", image_url: { url: generatedDataUrl } },
          ],
        },
      ],
      max_tokens: 900,
    });
    usageFromReporter(reporter)?.recordOpenAIChat(visionModel, "chat.completions (QA imagine)", completion.usage);
    return parseImageCritiqueJson(completion.choices[0]?.message?.content);
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
  critique: ImageCritiqueRequest,
  reporter?: ProcessingStageReporter,
  targetDpi?: number,
  opts?: { maxPasses?: number; skipCritique?: boolean },
): Promise<string | null> {
  const maxPasses = opts?.maxPasses ?? resolveImageMaxPasses();
  const useCritique = !opts?.skipCritique && resolveImageCritiqueEnabled();
  const model = resolveOpenAIImageModelForEdit();
  const profile = resolvePrintGenerationProfile(targetDpi);
  const profileHint = formatGenerationProfileHint(profile);
  let prompt = basePrompt;
  let last: string | null = null;

  reporter?.stage(`OpenAI: ${profileHint}…`);

  for (let pass = 0; pass < maxPasses; pass++) {
    reporter?.progressStep?.(
      pass,
      maxPasses,
      `OpenAI (${model}, ${profileHint}): generare ${pass + 1}/${maxPasses}…`,
    );
    let out: string | null;
    try {
      out = await imageEditSingle(
        editSourceDataUrl,
        prompt,
        widthMmHint,
        heightMmHint,
        reporter,
        targetDpi,
      );
    } catch (e) {
      if (pass === 0) throw e;
      aiError("openai imageEdit retry failed", e);
      break;
    }
    if (!out) {
      if (pass === 0) throw new Error("OpenAI: răspuns gol de la images.edit (fără imagine).");
      break;
    }
    last = out;

    if (!useCritique || pass >= maxPasses - 1) break;

    reporter?.stage(`OpenAI: verificare calitate (pas ${pass + 1})…`);
    const c = await critiqueGeneratedImage(out, critique, reporter);
    if (!c.shouldRegenerate || !String(c.promptAddendum || "").trim()) {
      reporter?.stage("OpenAI: verificare OK, nu e nevoie de regenerare.");
      break;
    }

    reporter?.stage(`OpenAI: regenerare cu corecții (${pass + 2}/${maxPasses})…`);
    prompt = appendCritiqueToPrompt(basePrompt, pass, maxPasses, c.issues, c.promptAddendum);
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
    throw e;
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
  netW: number,
  netH: number,
  formatName: string,
  mode: UpscaleMode = "extend",
  reporter?: ProcessingStageReporter,
  targetDpi?: number,
  safeMarginMm = 0,
  bleedMm = 0,
) {
  aiLog("openai upscale start", { mode, netW, netH, targetDpi, safeMarginMm, bleedMm });
  const prepared = await prepareImageForAiUpscale(imageData);
  let editSource = prepared;
  let prompt: string;

  const promptCtx = { formatName, netW, netH, safeMarginMm, bleedMm };
  const { width: cw, height: ch } = pickUpscaleNetCanvasPixels(netW, netH, targetDpi);

  if (mode === "extend") {
    reporter?.stage(`OpenAI: canvas extend ${cw}×${ch}px…`);
    const composed = await composeExtendOutpaintCanvas(prepared, cw, ch);
    editSource = composed.dataUrl;
    prompt = buildUpscalePrompt("extend", {
      ...promptCtx,
      canvasPxW: cw,
      canvasPxH: ch,
      bands: composed.bands,
    });
  } else {
    reporter?.stage(`OpenAI: canvas recompose ${cw}×${ch}px…`);
    editSource = await composeRecomposeCanvasForGemini(prepared, cw, ch);
    prompt = buildUpscalePrompt("recompose", {
      ...promptCtx,
      canvasPxW: cw,
      canvasPxH: ch,
    });
  }

  const url = await imageEditFromDataUrlWithQualityLoop(
    editSource,
    prompt,
    netW,
    netH,
    { mode, intentSummary: prompt, originalImageUrl: prepared },
    reporter,
    targetDpi,
  );
  aiLog("openai upscale done", { hasUrl: Boolean(url) });
  return url;
}

export async function generativeFill(
  imageData: string,
  bleedMm: number,
  targetWidthMm: number,
  targetHeightMm: number,
  reporter?: ProcessingStageReporter,
  targetDpi?: number,
) {
  const layout: PrintLayoutMm = {
    netWidthMm: targetWidthMm,
    netHeightMm: targetHeightMm,
    bleedMm,
    safeMarginMm: 0,
    dpi: targetDpi ?? 300,
  };
  return addAlgorithmicBleed(imageData, layout, reporter?.stage, {
    applySafeZoneFill: false,
  });
}

export async function generateCustomMockup(
  userPrompt: string,
  designImageData: string,
  _apiKey?: string
) {
  const prompt = `Photorealistic product mockup. ${userPrompt}

The attached image is the print artwork. Integrate it realistically onto the product with correct lighting, perspective, and material. Studio background, professional product photo.`;
  return imageEditFromDataUrlWithQualityLoop(designImageData, prompt, 1, 1, {
    mode: "recompose",
    intentSummary: prompt,
    originalImageUrl: designImageData,
  });
}
