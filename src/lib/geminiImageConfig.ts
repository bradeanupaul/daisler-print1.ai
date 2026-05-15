import { loadAiAppSettings } from "./aiAppSettings";
import { GEMINI_IMAGE_MODELS, resolveModelFromCatalog } from "./aiModelCatalog";

const DEFAULT = "gemini-3-pro-image-preview";

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
