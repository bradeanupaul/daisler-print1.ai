/**
 * Generare imagine Gemini + buclă QA (text/vision) + regenerare — echivalent OpenAI.
 */
import { GoogleGenAI, Modality, Type } from "@google/genai";
import { resolveGeminiApiKey } from "../lib/aiKeys";
import {
  resolveImageCritiqueEnabled,
  resolveImageMaxPasses,
} from "../lib/aiImageQualityConfig";
import {
  isImagenFastModel,
  isImagenModel,
  resolveGeminiImageModel,
  resolveGeminiImageModelForEdit,
  resolveGeminiImageSizeForModel,
} from "../lib/geminiImageConfig";
import {
  formatGenerationProfileHint,
  resolvePrintGenerationProfile,
} from "../lib/printGenerationProfile";
import { resolveGeminiTextModel } from "../lib/geminiTextConfig";
import {
  appendCritiqueToPrompt,
  buildImageCritiqueInstruction,
  parseImageCritiqueJson,
  type ImageCritiqueRequest,
  type ImageCritiqueResult,
} from "../lib/imageCritique";
import { extractApiErrorText } from "../lib/apiErrorMessage";
import { ensureImageDataUrl, resolveImageForGemini } from "../lib/imageDataUrl";
import type { ProcessingStageReporter } from "../lib/processingStage";
import { usageFromReporter } from "../lib/processingStage";

export type GeminiCritiqueContext = ImageCritiqueRequest;

type GeminiImageGenConfig = {
  aspectRatio: string;
  imageSize?: "1K" | "2K" | "4K";
};

function getAI(apiKey?: string) {
  return new GoogleGenAI({ apiKey: apiKey || resolveGeminiApiKey() });
}

async function geminiInlineImage(imageUrl: string) {
  const { mimeType, data } = await resolveImageForGemini(imageUrl);
  return { inlineData: { data, mimeType } };
}

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string }; text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  /** SDK helper — base64 imagine din primul candidat. */
  data?: string;
};

function extractImageDataUrl(response: GeminiGenerateResponse): string | null {
  for (const candidate of response.candidates || []) {
    for (const part of candidate.content?.parts || []) {
      if (part.inlineData?.data) {
        return `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`;
      }
    }
  }
  const sdkData = response.data?.trim();
  if (sdkData) {
    if (sdkData.startsWith("data:image/")) return sdkData;
    return `data:image/png;base64,${sdkData}`;
  }
  return null;
}

function friendlyFinishReason(reason: string, model: string): string {
  switch (reason) {
    case "IMAGE_OTHER":
      return `Gemini (${model}) nu a returnat imagine (IMAGE_OTHER — uneori la 2K sau prompt complex). Am încercat automat 1K; dacă persistă, schimbă modelul în Setări AI (ex. Nano Banana Pro) sau reduce OPENAI_IMAGE_MAX_PASSES=1.`;
    case "NO_IMAGE":
      return `Gemini (${model}) nu a generat imagine (NO_IMAGE). Verifică că modelul suportă edit cu imagine sursă.`;
    case "IMAGE_PROHIBITED_CONTENT":
      return `Gemini (${model}): conținut blocat de filtrele de siguranță.`;
    case "IMAGE_RECITATION":
      return `Gemini (${model}): generare oprită (posibilă copiere din sursă protejată).`;
    default:
      return `Gemini (${model}) nu a generat imagine · finish: ${reason}`;
  }
}

function requireGeminiImageOutput(response: GeminiGenerateResponse, model: string): string {
  const url = extractImageDataUrl(response);
  if (url) return url;
  const c0 = response.candidates?.[0];
  const reason = c0?.finishReason || "UNKNOWN";
  const block = response.promptFeedback?.blockReason;
  const text = c0?.content?.parts?.find((p) => p.text)?.text?.trim();
  const base = friendlyFinishReason(reason, model);
  const bits = [base, block ? `block: ${block}` : "", text ? text.slice(0, 160) : ""].filter(Boolean);
  throw new Error(bits.join(" · "));
}

function buildNativeGenerateConfig(
  model: string,
  imageConfig: GeminiImageGenConfig,
): { responseModalities: Modality[]; imageConfig: { aspectRatio: string; imageSize?: string } } {
  const imageSize = resolveGeminiImageSizeForModel(model, imageConfig.imageSize ?? "1K");
  return {
    responseModalities: [Modality.TEXT, Modality.IMAGE],
    imageConfig: {
      aspectRatio: imageConfig.aspectRatio,
      imageSize,
    },
  };
}

function isRetryableImageFinish(err: unknown): boolean {
  const msg = extractApiErrorText(err).toUpperCase();
  return (
    msg.includes("IMAGE_OTHER") ||
    msg.includes("NO_IMAGE") ||
    msg.includes("NU A GENERAT IMAGINE") ||
    msg.includes("RĂSPUNS GOL")
  );
}

/** Imagen: max ~480 tokeni — trunchiem promptul. */
function truncateForImagen(prompt: string, maxChars = 1600): string {
  const t = prompt.trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars - 1)}…`;
}

/** Pentru Imagen (fără imagine în API): descriere scurtă a sursei + instrucțiune. */
async function buildImagenPromptWithReference(
  taskPrompt: string,
  referenceDataUrl: string,
  reporter?: ProcessingStageReporter,
  apiKey?: string,
): Promise<string> {
  const ai = getAI(apiKey);
  const textModel = resolveGeminiTextModel();
  const imagePart = await geminiInlineImage(await ensureImageDataUrl(referenceDataUrl));

  try {
    reporter?.stage("Imagen: descriu designul sursă (vision)…");
    const response = await ai.models.generateContent({
      model: textModel,
      contents: [
        {
          parts: [
            {
              text: "Describe this print design in English for image regeneration: layout, colors, typography, graphics, borders. Max 120 words. No markdown.",
            },
            imagePart,
          ],
        },
      ],
    });
    usageFromReporter(reporter)?.recordGemini(
      textModel,
      "generateContent (descriere sursă Imagen)",
      response.usageMetadata,
    );
    const desc = (response.text || "").trim();
    const task = taskPrompt.trim();
    return truncateForImagen(
      `${task}\n\nREFERENCE DESIGN (match closely):\n${desc || "See task above."}`,
    );
  } catch (e) {
    console.warn("buildImagenPromptWithReference failed, using task only:", e);
    return truncateForImagen(taskPrompt);
  }
}

async function imagenGenerateOnce(
  prompt: string,
  imageConfig: GeminiImageGenConfig,
  reporter: ProcessingStageReporter | undefined,
  usageLabel: string,
  apiKey?: string,
): Promise<string | null> {
  const ai = getAI(apiKey);
  const model = resolveGeminiImageModel();
  const config: {
    numberOfImages: number;
    aspectRatio: string;
    imageSize?: string;
  } = {
    numberOfImages: 1,
    aspectRatio: imageConfig.aspectRatio,
  };
  if (!isImagenFastModel(model) && imageConfig.imageSize) {
    config.imageSize = imageConfig.imageSize === "2K" ? "2K" : "1K";
  }

  const response = await ai.models.generateImages({
    model,
    prompt: truncateForImagen(prompt),
    config,
  });

  usageFromReporter(reporter)?.recordGeminiImagen(model, usageLabel);

  const generated = response.generatedImages?.[0];
  const bytes = generated?.image?.imageBytes;
  if (!bytes) return null;
  const mime = generated?.image?.mimeType || "image/png";
  const b64 =
    typeof bytes === "string"
      ? bytes
      : btoa(
          Array.from(
            bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes as ArrayBuffer),
            (b) => String.fromCharCode(b),
          ).join(""),
        );
  return `data:${mime};base64,${b64}`;
}

async function geminiNativeGenerateImageOnce(
  prompt: string,
  inputDataUrl: string,
  imageConfig: GeminiImageGenConfig,
  reporter: ProcessingStageReporter | undefined,
  usageLabel: string,
  apiKey?: string,
  modelOverride?: string,
): Promise<string | null> {
  const ai = getAI(apiKey);
  const model = modelOverride ?? resolveGeminiImageModelForEdit();
  const imagePart = await geminiInlineImage(await ensureImageDataUrl(inputDataUrl));

  const tiers: Array<"1K" | "2K" | "4K"> = [];
  const primary = resolveGeminiImageSizeForModel(model, imageConfig.imageSize ?? "1K");
  tiers.push(primary);
  if (primary !== "1K") tiers.push("1K");

  let lastErr: unknown;
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i]!;
    const cfg = buildNativeGenerateConfig(model, { ...imageConfig, imageSize: tier });
    if (i > 0) {
      reporter?.stage(`${model}: reîncerc cu ${tier} (IMAGE_OTHER / fără imagine)…`);
    }
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ parts: [{ text: prompt }, imagePart] }],
        config: cfg,
      });

      usageFromReporter(reporter)?.recordGemini(
        model,
        i > 0 ? `${usageLabel} (retry ${tier})` : usageLabel,
        response.usageMetadata,
        tier,
      );
      return requireGeminiImageOutput(response as GeminiGenerateResponse, model);
    } catch (e) {
      lastErr = e;
      if (i < tiers.length - 1 && isRetryableImageFinish(e)) continue;
      throw e instanceof Error ? e : new Error(extractApiErrorText(e));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(extractApiErrorText(lastErr));
}

async function geminiGenerateImageOnce(
  prompt: string,
  inputDataUrl: string,
  imageConfig: GeminiImageGenConfig,
  reporter: ProcessingStageReporter | undefined,
  usageLabel: string,
  apiKey?: string,
  modelOverride?: string,
): Promise<string | null> {
  const model = modelOverride ?? resolveGeminiImageModelForEdit();
  if (isImagenModel(model)) {
    return imagenGenerateOnce(prompt, imageConfig, reporter, usageLabel, apiKey);
  }
  return geminiNativeGenerateImageOnce(
    prompt,
    inputDataUrl,
    imageConfig,
    reporter,
    usageLabel,
    apiKey,
    model,
  );
}

export async function critiqueGeneratedImageGemini(
  generatedDataUrl: string,
  request: ImageCritiqueRequest,
  reporter?: ProcessingStageReporter,
  apiKey?: string,
): Promise<ImageCritiqueResult> {
  const ai = getAI(apiKey);
  const textModel = resolveGeminiTextModel();
  const instruction = buildImageCritiqueInstruction(request);

  try {
    const originalPart = await geminiInlineImage(request.originalImageUrl);
    const outPart = await geminiInlineImage(generatedDataUrl);

    const response = await ai.models.generateContent({
      model: textModel,
      contents: [
        {
          parts: [
            { text: instruction },
            { text: "ORIGINAL:" },
            originalPart,
            { text: "OUTPUT:" },
            outPart,
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            shouldRegenerate: { type: Type.BOOLEAN },
            issues: { type: Type.ARRAY, items: { type: Type.STRING } },
            promptAddendum: { type: Type.STRING },
          },
          required: ["shouldRegenerate", "issues", "promptAddendum"],
        },
      },
    });

    usageFromReporter(reporter)?.recordGemini(
      textModel,
      "generateContent (QA imagine)",
      response.usageMetadata,
    );
    return parseImageCritiqueJson(response.text);
  } catch (e) {
    console.warn("critiqueGeneratedImageGemini failed, skipping retry:", e);
    return { shouldRegenerate: false, issues: [], promptAddendum: "" };
  }
}

/** Buclă generare + QA + regenerare (ca OpenAI imageEditFromDataUrlWithQualityLoop). */
export async function geminiImageWithQualityLoop(params: {
  editSourceDataUrl: string;
  basePrompt: string;
  imageConfig: GeminiImageGenConfig;
  critique: GeminiCritiqueContext;
  reporter?: ProcessingStageReporter;
  apiKey?: string;
  providerLabel?: string;
  targetDpi?: number;
  /** Model explicit (ex. recompose → 3.1 flash). */
  forcedImageModel?: string;
  maxPasses?: number;
  skipCritique?: boolean;
}): Promise<string | null> {
  const {
    editSourceDataUrl,
    basePrompt,
    imageConfig,
    critique,
    reporter,
    apiKey,
    providerLabel = "Gemini",
    targetDpi,
    forcedImageModel,
    maxPasses: maxPassesParam,
    skipCritique,
  } = params;

  const maxPasses = maxPassesParam ?? resolveImageMaxPasses();
  const useCritique = !skipCritique && resolveImageCritiqueEnabled();
  const imageModel = forcedImageModel ?? resolveGeminiImageModelForEdit();
  const profile = resolvePrintGenerationProfile(targetDpi);
  const tier = resolveGeminiImageSizeForModel(
    imageModel,
    imageConfig.imageSize ?? profile.geminiImageSize,
  );
  const profileHint = isImagenModel(imageModel)
    ? `${imageModel.includes("fast") ? "Imagen 4 Fast" : "Imagen 4"} · ${profile.targetDpi} DPI`
    : formatGenerationProfileHint({ ...profile, geminiImageSize: tier });
  const resolvedConfig: GeminiImageGenConfig = { ...imageConfig, imageSize: tier };
  const imagenPromptBase = isImagenModel(imageModel)
    ? await buildImagenPromptWithReference(basePrompt, editSourceDataUrl, reporter, apiKey)
    : null;
  let prompt = imagenPromptBase ?? basePrompt;
  let last: string | null = null;

  reporter?.stage(`${providerLabel}: ${profileHint}…`);

  for (let pass = 0; pass < maxPasses; pass++) {
    reporter?.progressStep?.(
      pass,
      maxPasses,
      `${providerLabel} (${imageModel}, ${profileHint}): generare ${pass + 1}/${maxPasses}…`,
    );

    const usageLabel = isImagenModel(imageModel)
      ? `generateImages (Imagen${pass > 0 ? `, pas ${pass + 1}` : ""})`
      : `generateContent (imagine${pass > 0 ? `, pas ${pass + 1}` : ""})`;

    let out: string | null;
    try {
      out = await geminiGenerateImageOnce(
        prompt,
        editSourceDataUrl,
        resolvedConfig,
        reporter,
        usageLabel,
        apiKey,
        imageModel,
      );
    } catch (e) {
      if (pass === 0) {
        throw new Error(extractApiErrorText(e), { cause: e instanceof Error ? e : undefined });
      }
      console.warn("geminiGenerateImageOnce retry failed:", e);
      break;
    }
    if (!out) {
      if (pass === 0) {
        throw new Error(`${providerLabel}: răspuns gol de la API (fără imagine).`);
      }
      break;
    }
    last = out;

    if (!useCritique || pass >= maxPasses - 1) break;

    reporter?.stage(`${providerLabel}: verificare calitate (pas ${pass + 1})…`);
    const c = await critiqueGeneratedImageGemini(out, critique, reporter, apiKey);
    if (!c.shouldRegenerate || !String(c.promptAddendum || "").trim()) {
      reporter?.stage(`${providerLabel}: verificare OK, nu e nevoie de regenerare.`);
      break;
    }

    reporter?.stage(`${providerLabel}: regenerare cu corecții (${pass + 2}/${maxPasses})…`);
    const revised = appendCritiqueToPrompt(basePrompt, pass, maxPasses, c.issues, c.promptAddendum);
    prompt = imagenPromptBase
      ? truncateForImagen(
          `${imagenPromptBase}\n\nREGENERATION FIXES:\n${revised.slice(basePrompt.length).trim() || revised}`,
        )
      : revised;
  }

  if (last) reporter?.stage(`${providerLabel}: imagine finalizată.`);
  return last;
}
