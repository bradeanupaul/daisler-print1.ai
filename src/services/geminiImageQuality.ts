/**
 * Generare imagine Gemini + buclă QA (text/vision) + regenerare — echivalent OpenAI.
 */
import { GoogleGenAI, Type } from "@google/genai";
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
  type ImageCritiqueResult,
} from "../lib/imageCritique";
import { ensureImageDataUrl, resolveImageForGemini } from "../lib/imageDataUrl";
import type { ProcessingStageReporter } from "../lib/processingStage";
import { usageFromReporter } from "../lib/processingStage";

export type GeminiCritiqueContext = {
  intentSummary: string;
  referenceForCritique: string;
};

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

function extractImageDataUrl(response: {
  candidates?: Array<{
    content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string }; text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
}): string | null {
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData?.data) {
      return `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`;
    }
  }
  return null;
}

function requireGeminiImageOutput(
  response: Parameters<typeof extractImageDataUrl>[0],
  model: string,
): string {
  const url = extractImageDataUrl(response);
  if (url) return url;
  const c0 = response.candidates?.[0];
  const reason = c0?.finishReason || "UNKNOWN";
  const block = response.promptFeedback?.blockReason;
  const text = c0?.content?.parts?.find((p) => p.text)?.text?.trim();
  const bits = [
    `Gemini (${model}) nu a generat imagine`,
    reason ? `finish: ${reason}` : "",
    block ? `block: ${block}` : "",
    text ? text.slice(0, 160) : "",
  ].filter(Boolean);
  throw new Error(bits.join(" · "));
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
): Promise<string | null> {
  const ai = getAI(apiKey);
  const model = resolveGeminiImageModelForEdit();
  const imagePart = await geminiInlineImage(await ensureImageDataUrl(inputDataUrl));

  const response = await ai.models.generateContent({
    model,
    contents: [{ parts: [{ text: prompt }, imagePart] }],
    config: {
      imageConfig: {
        aspectRatio: imageConfig.aspectRatio,
        ...(imageConfig.imageSize ? { imageSize: imageConfig.imageSize } : {}),
      },
    },
  });

  usageFromReporter(reporter)?.recordGemini(
    model,
    usageLabel,
    response.usageMetadata,
    imageConfig.imageSize ?? "2K",
  );
  return requireGeminiImageOutput(response, model);
}

async function geminiGenerateImageOnce(
  prompt: string,
  inputDataUrl: string,
  imageConfig: GeminiImageGenConfig,
  reporter: ProcessingStageReporter | undefined,
  usageLabel: string,
  apiKey?: string,
): Promise<string | null> {
  const model = resolveGeminiImageModelForEdit();
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
  );
}

export async function critiqueGeneratedImageGemini(
  generatedDataUrl: string,
  intentSummary: string,
  referenceDataUrl: string,
  reporter?: ProcessingStageReporter,
  apiKey?: string,
): Promise<ImageCritiqueResult> {
  const ai = getAI(apiKey);
  const textModel = resolveGeminiTextModel();
  const instruction = buildImageCritiqueInstruction(intentSummary);

  try {
    const refPart = await geminiInlineImage(referenceDataUrl);
    const outPart = await geminiInlineImage(generatedDataUrl);

    const response = await ai.models.generateContent({
      model: textModel,
      contents: [
        {
          parts: [
            { text: instruction },
            { text: "REFERENCE:" },
            refPart,
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
  } = params;

  const maxPasses = resolveImageMaxPasses();
  const useCritique = resolveImageCritiqueEnabled();
  const imageModel = resolveGeminiImageModelForEdit();
  const profile = resolvePrintGenerationProfile(targetDpi);
  const tier = imageConfig.imageSize ?? profile.geminiImageSize;
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
      );
    } catch (e) {
      if (pass === 0) throw e;
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
    const c = await critiqueGeneratedImageGemini(
      out,
      critique.intentSummary,
      critique.referenceForCritique,
      reporter,
      apiKey,
    );
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
