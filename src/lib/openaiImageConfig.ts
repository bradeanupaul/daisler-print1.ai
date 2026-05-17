import { loadAiAppSettings } from "./aiAppSettings";
import { OPENAI_IMAGE_MODELS, resolveModelFromCatalog } from "./aiModelCatalog";
import { resolvePrintGenerationProfile } from "./printGenerationProfile";

const DEFAULT = "gpt-image-2";

export function resolveOpenAIImageModel(): string {
  const app = loadAiAppSettings();
  const fromEnv =
    (typeof process !== "undefined" &&
      process.env.OPENAI_IMAGE_MODEL &&
      String(process.env.OPENAI_IMAGE_MODEL).trim()) ||
    "";
  return resolveModelFromCatalog(
    OPENAI_IMAGE_MODELS,
    app.openaiImageModel,
    fromEnv || undefined,
    DEFAULT,
  );
}

export function resolveOpenAIImageQuality(): "low" | "medium" | "high" | "auto" {
  const q =
    (typeof process !== "undefined" &&
      process.env.OPENAI_IMAGE_QUALITY &&
      String(process.env.OPENAI_IMAGE_QUALITY).trim().toLowerCase()) ||
    "";
  if (q === "high" || q === "medium" || q === "low" || q === "auto") return q;
  return "high";
}

export function resolveOpenAIImageQualityForDpi(
  targetDpi?: number,
): "low" | "medium" | "high" | "auto" {
  const fromEnv =
    (typeof process !== "undefined" &&
      process.env.OPENAI_IMAGE_QUALITY &&
      String(process.env.OPENAI_IMAGE_QUALITY).trim().toLowerCase()) ||
    "";
  if (fromEnv === "high" || fromEnv === "medium" || fromEnv === "low" || fromEnv === "auto") {
    return fromEnv;
  }
  return resolvePrintGenerationProfile(targetDpi).openaiQuality;
}

export function isOpenAIGptImageModel(modelId: string): boolean {
  return modelId.toLowerCase().includes("gpt-image");
}

export function isOpenAIDalle2Model(modelId: string): boolean {
  return modelId.toLowerCase() === "dall-e-2";
}

export function isOpenAIDalle3Model(modelId: string): boolean {
  return modelId.toLowerCase() === "dall-e-3";
}

export function isOpenAIDalleModel(modelId: string): boolean {
  const id = modelId.toLowerCase();
  return id === "dall-e-2" || id === "dall-e-3";
}

export function resolveDalle3QualityForDpi(
  targetDpi?: number,
): "standard" | "hd" {
  return resolvePrintGenerationProfile(targetDpi).targetDpi >= 300 ? "hd" : "standard";
}

/** images.edit / upscale — DALL-E 3 nu acceptă sursă; folosește GPT Image. */
export function resolveOpenAIImageModelForEdit(): string {
  const selected = resolveOpenAIImageModel();
  if (isOpenAIDalle3Model(selected)) return "gpt-image-2";
  if (isOpenAIGptImageModel(selected) || isOpenAIDalle2Model(selected)) {
    return selected;
  }
  return "gpt-image-2";
}

export {
  resolveImageCritiqueEnabled as resolveOpenAIImageCritiqueEnabled,
  resolveImageMaxPasses as resolveOpenAIImageMaxPasses,
} from "./aiImageQualityConfig";
