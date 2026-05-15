import { loadAiAppSettings } from "./aiAppSettings";
import { OPENAI_TEXT_MODELS, resolveModelFromCatalog } from "./aiModelCatalog";

const DEFAULT_AGENT = "gpt-4o-mini";
const DEFAULT_VISION = "gpt-4o";

export function resolveOpenAIAgentModel(): string {
  const app = loadAiAppSettings();
  const fromEnv =
    (typeof process !== "undefined" &&
      process.env.OPENAI_AGENT_MODEL &&
      String(process.env.OPENAI_AGENT_MODEL).trim()) ||
    "";
  return resolveModelFromCatalog(
    OPENAI_TEXT_MODELS,
    app.openaiAgentModel,
    fromEnv || undefined,
    DEFAULT_AGENT,
  );
}

/** Vision / analiză calitate — implicit GPT-4o; poate fi același catalog. */
export function resolveOpenAIVisionModel(): string {
  const app = loadAiAppSettings();
  const fromEnv =
    (typeof process !== "undefined" &&
      process.env.OPENAI_VISION_MODEL &&
      String(process.env.OPENAI_VISION_MODEL).trim()) ||
    "";
  return resolveModelFromCatalog(
    OPENAI_TEXT_MODELS,
    app.openaiVisionModel,
    fromEnv || undefined,
    DEFAULT_VISION,
  );
}
