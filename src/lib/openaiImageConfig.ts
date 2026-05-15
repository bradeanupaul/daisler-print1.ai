import { loadAiAppSettings } from "./aiAppSettings";
import { OPENAI_IMAGE_MODELS, resolveModelFromCatalog } from "./aiModelCatalog";

const DEFAULT = "gpt-image-2";

/** Model OpenAI pentru images.edit. Setări AI > .env > implicit. */
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

/** Număr maxim de apeluri images.edit (prima + regenerări). 1–5, implicit 3. */
export function resolveOpenAIImageMaxPasses(): number {
  const raw =
    (typeof process !== "undefined" &&
      process.env.OPENAI_IMAGE_MAX_PASSES &&
      String(process.env.OPENAI_IMAGE_MAX_PASSES).trim()) ||
    "";
  const n = parseInt(raw, 10);
  if (Number.isFinite(n) && n >= 1 && n <= 5) return n;
  return 3;
}

/** După generare: vision QA + retry dacă e nevoie. Dezactivează cu 0 / false. */
export function resolveOpenAIImageCritiqueEnabled(): boolean {
  const raw =
    (typeof process !== "undefined" &&
      process.env.OPENAI_IMAGE_CRITIQUE &&
      String(process.env.OPENAI_IMAGE_CRITIQUE).trim().toLowerCase()) ||
    "";
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return true;
}
