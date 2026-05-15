/** Gemini / AI Studio — injectat de Vite `define` + localStorage. */
export function resolveGeminiApiKey(): string {
  const fromEnv =
    (typeof process !== "undefined" &&
      (process.env.API_KEY || process.env.GEMINI_API_KEY)) ||
    "";
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined") {
    return window.localStorage.getItem("gemini_api_key") || "";
  }
  return "";
}

/** OpenAI — injectat de Vite + localStorage `openai_api_key`. */
export function resolveOpenAIApiKey(): string {
  const fromEnv =
    (typeof process !== "undefined" && process.env.OPENAI_API_KEY) || "";
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined") {
    return window.localStorage.getItem("openai_api_key") || "";
  }
  return "";
}

export function preferOpenAI(): boolean {
  return resolveOpenAIApiKey().trim().length > 0;
}

/** Gemini configurat (.env Vite sau localStorage). */
export function hasGeminiKeyConfigured(): boolean {
  const env =
    (typeof process !== "undefined" &&
      (process.env.GEMINI_API_KEY || process.env.API_KEY || "").trim()) ||
    "";
  if (env) return true;
  if (typeof window !== "undefined") {
    return Boolean(window.localStorage.getItem("gemini_api_key")?.trim());
  }
  return false;
}

/** OpenAI configurat (.env sau localStorage). */
export function hasOpenAIKeyConfigured(): boolean {
  const env = (typeof process !== "undefined" && (process.env.OPENAI_API_KEY || "").trim()) || "";
  if (env) return true;
  if (typeof window !== "undefined") {
    return Boolean(window.localStorage.getItem("openai_api_key")?.trim());
  }
  return false;
}

/** Pentru UI: există cheie din build sau din storage. */
export function hasAnyAiKeyConfigured(): boolean {
  return hasGeminiKeyConfigured() || hasOpenAIKeyConfigured();
}
