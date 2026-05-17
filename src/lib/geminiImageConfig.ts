import { loadAiAppSettings } from "./aiAppSettings";
import { GEMINI_IMAGE_MODELS, resolveModelFromCatalog } from "./aiModelCatalog";

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
