import { loadAiAppSettings } from "./aiAppSettings";
import { GEMINI_IMAGE_MODELS, resolveModelFromCatalog } from "./aiModelCatalog";
import type { GeminiImageSizeTier } from "./printGenerationProfile";

const DEFAULT = "gemini-2.5-flash-image";

/** Model Gemini pentru imagini (upscale, bleed, mockup). Setări AI > .env > implicit. */
export function resolveGeminiImageModel(): string {
  const app = loadAiAppSettings();
  const fromEnv =
    (typeof process !== "undefined" &&
      process.env.GEMINI_IMAGE_MODEL &&
      String(process.env.GEMINI_IMAGE_MODEL).trim()) ||
    "";
  return resolveModelFromCatalog(
    GEMINI_IMAGE_MODELS,
    app.geminiImageModel,
    fromEnv || undefined,
    DEFAULT,
  );
}

export function isImagenModel(modelId: string): boolean {
  return modelId.toLowerCase().includes("imagen-");
}

export function isGeminiNativeImageModel(modelId: string): boolean {
  const id = modelId.toLowerCase();
  return id.includes("gemini") && id.includes("image") && !isImagenModel(id);
}

export function isImagenFastModel(modelId: string): boolean {
  return modelId.toLowerCase().includes("imagen") && modelId.toLowerCase().includes("fast");
}

const DEFAULT_GEMINI_EDIT_MODEL = "gemini-2.5-flash-image";
/** Recompose layout: 2.5 flash tinde să lase miniatura centrată; 3.x e mai bun la redistribuire. */
const DEFAULT_GEMINI_RECOMPOSE_MODEL = "gemini-3.1-flash-image-preview";

/** Upscale / edit cu imagine sursă — forțează Nano Banana, nu Imagen text-only. */
export function resolveGeminiImageModelForEdit(): string {
  const selected = resolveGeminiImageModel();
  if (isGeminiNativeImageModel(selected)) return selected;
  const app = loadAiAppSettings();
  if (app.geminiImageModel && isGeminiNativeImageModel(app.geminiImageModel)) {
    return app.geminiImageModel;
  }
  return DEFAULT_GEMINI_EDIT_MODEL;
}

/** Model dedicat recompose (layout pe format nou) — preferă 3.x față de 2.5 flash. */
export function resolveGeminiImageModelForRecompose(): string {
  const selected = resolveGeminiImageModel();
  const id = selected.toLowerCase();
  if (id.includes("3-pro-image") || id.includes("3.1-flash-image")) return selected;
  if (isGeminiNativeImageModel(selected) && !id.includes("2.5-flash-image")) {
    return selected;
  }
  return DEFAULT_GEMINI_RECOMPOSE_MODEL;
}

/** Upscale (extend + recompose): 2.5 flash dă des IMAGE_OTHER — folosește 3.1 dacă e selectat 2.5. */
export function resolveGeminiImageModelForUpscale(
  mode: "extend" | "recompose",
): string {
  if (mode === "recompose") return resolveGeminiImageModelForRecompose();
  const selected = resolveGeminiImageModel();
  if (selected.toLowerCase().includes("2.5-flash-image")) {
    return DEFAULT_GEMINI_RECOMPOSE_MODEL;
  }
  return resolveGeminiImageModelForEdit();
}

/**
 * Unele modele ignoră 2K sau eșuează cu IMAGE_OTHER la rezoluții mari.
 * gemini-2.5-flash-image e stabil la 1K pentru edit pe sursă.
 */
export function resolveGeminiImageSizeForModel(
  modelId: string,
  requested: GeminiImageSizeTier,
): GeminiImageSizeTier {
  const id = modelId.toLowerCase();
  if (id.includes("2.5-flash-image")) return "1K";
  if (id.includes("flash-image") && !id.includes("3-pro")) {
    return requested === "4K" ? "2K" : requested;
  }
  return requested;
}
