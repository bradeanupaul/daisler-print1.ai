import { hasGeminiKeyConfigured, hasOpenAIKeyConfigured } from "./aiKeys";

export type PrimaryImageProvider = "gemini" | "openai";

export type AiAppSettings = {
  primaryImageProvider: PrimaryImageProvider;
  /** Generează mockup cu Gemini și OpenAI în paralel; alegerea imaginii în UI. */
  debugCompareImageModels: boolean;
  geminiImageModel?: string;
  geminiTextModel?: string;
  openaiImageModel?: string;
  openaiAgentModel?: string;
  openaiVisionModel?: string;
};

const STORAGE_KEY = "print1_ai_app_settings_v2";

function defaultPrimary(): PrimaryImageProvider {
  const g = hasGeminiKeyConfigured();
  const o = hasOpenAIKeyConfigured();
  if (o && !g) return "openai";
  if (g && !o) return "gemini";
  return "gemini";
}

function readStoredSettings(): Partial<AiAppSettings> | null {
  if (typeof window === "undefined") return null;
  for (const key of [STORAGE_KEY, "print1_ai_app_settings_v1"]) {
    const raw = window.localStorage.getItem(key);
    if (!raw) continue;
    try {
      return JSON.parse(raw) as Partial<AiAppSettings>;
    } catch {
      continue;
    }
  }
  return null;
}

export function loadAiAppSettings(): AiAppSettings {
  try {
    const parsed = readStoredSettings();
    if (!parsed) {
      return {
        primaryImageProvider: defaultPrimary(),
        debugCompareImageModels: false,
      };
    }
    return {
      primaryImageProvider:
        parsed.primaryImageProvider === "openai" || parsed.primaryImageProvider === "gemini"
          ? parsed.primaryImageProvider
          : defaultPrimary(),
      debugCompareImageModels: Boolean(parsed.debugCompareImageModels),
      geminiImageModel:
        typeof parsed.geminiImageModel === "string" ? parsed.geminiImageModel : undefined,
      geminiTextModel:
        typeof parsed.geminiTextModel === "string" ? parsed.geminiTextModel : undefined,
      openaiImageModel:
        typeof parsed.openaiImageModel === "string" ? parsed.openaiImageModel : undefined,
      openaiAgentModel:
        typeof parsed.openaiAgentModel === "string" ? parsed.openaiAgentModel : undefined,
      openaiVisionModel:
        typeof parsed.openaiVisionModel === "string" ? parsed.openaiVisionModel : undefined,
    };
  } catch {
    return {
      primaryImageProvider: defaultPrimary(),
      debugCompareImageModels: false,
    };
  }
}

export function saveAiAppSettings(patch: Partial<AiAppSettings>): AiAppSettings {
  const next: AiAppSettings = { ...loadAiAppSettings(), ...patch };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}
