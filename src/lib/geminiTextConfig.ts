import { loadAiAppSettings } from "./aiAppSettings";
import { GEMINI_TEXT_MODELS, resolveModelFromCatalog } from "./aiModelCatalog";

const DEFAULT = "gemini-3-flash-preview";

export function resolveGeminiTextModel(): string {
  const app = loadAiAppSettings();
  const fromEnv =
    (typeof process !== "undefined" &&
      process.env.GEMINI_TEXT_MODEL &&
      String(process.env.GEMINI_TEXT_MODEL).trim()) ||
    "";
  return resolveModelFromCatalog(
    GEMINI_TEXT_MODELS,
    app.geminiTextModel,
    fromEnv || undefined,
    DEFAULT,
  );
}
