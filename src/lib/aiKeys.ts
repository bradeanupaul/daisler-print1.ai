/**
 * Chei API: injectate la build (Vite `define` din .env.local sau Vercel env) + localStorage în browser.
 * Nu folosi `typeof process` — în producție `process` nu există în browser, iar cheile erau ignorate.
 */

function trimKey(value: string | undefined): string {
  return (value || "").trim();
}

/** Înlocuit la build cu string literal (vezi vite.config.ts `define`). */
function geminiKeyFromBuild(): string {
  return trimKey(process.env.GEMINI_API_KEY || process.env.API_KEY);
}

/** Înlocuit la build cu string literal. */
function openaiKeyFromBuild(): string {
  return trimKey(process.env.OPENAI_API_KEY);
}

/** Suport opțional `VITE_*` dacă le setezi explicit pe Vercel. */
function geminiKeyFromImportMeta(): string {
  const env = import.meta.env as ImportMetaEnv & {
    VITE_GEMINI_API_KEY?: string;
    VITE_API_KEY?: string;
  };
  return trimKey(env.VITE_GEMINI_API_KEY || env.VITE_API_KEY);
}

function openaiKeyFromImportMeta(): string {
  const env = import.meta.env as ImportMetaEnv & { VITE_OPENAI_API_KEY?: string };
  return trimKey(env.VITE_OPENAI_API_KEY);
}

/** Gemini / AI Studio — build + localStorage. */
export function resolveGeminiApiKey(): string {
  const fromBuild = geminiKeyFromBuild() || geminiKeyFromImportMeta();
  if (fromBuild) return fromBuild;
  if (typeof window !== "undefined") {
    return window.localStorage.getItem("gemini_api_key") || "";
  }
  return "";
}

/** OpenAI — build + localStorage. */
export function resolveOpenAIApiKey(): string {
  const fromBuild = openaiKeyFromBuild() || openaiKeyFromImportMeta();
  if (fromBuild) return fromBuild;
  if (typeof window !== "undefined") {
    return window.localStorage.getItem("openai_api_key") || "";
  }
  return "";
}

export function preferOpenAI(): boolean {
  return resolveOpenAIApiKey().trim().length > 0;
}

export function hasGeminiKeyConfigured(): boolean {
  if (resolveGeminiApiKey()) return true;
  return false;
}

export function hasOpenAIKeyConfigured(): boolean {
  if (resolveOpenAIApiKey()) return true;
  return false;
}

export function hasAnyAiKeyConfigured(): boolean {
  return hasGeminiKeyConfigured() || hasOpenAIKeyConfigured();
}
