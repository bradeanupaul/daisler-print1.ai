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

/** Pentru UI: există cheie din build sau din storage. */
export function hasAnyAiKeyConfigured(): boolean {
  const g =
    (typeof process !== "undefined" &&
      (process.env.GEMINI_API_KEY || process.env.API_KEY || "").trim()) ||
    "";
  const o =
    (typeof process !== "undefined" && (process.env.OPENAI_API_KEY || "").trim()) ||
    "";
  if (typeof window !== "undefined") {
    const lsG = window.localStorage.getItem("gemini_api_key")?.trim() || "";
    const lsO = window.localStorage.getItem("openai_api_key")?.trim() || "";
    return Boolean(g || o || lsG || lsO);
  }
  return Boolean(g || o);
}
