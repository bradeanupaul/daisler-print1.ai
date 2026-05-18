/** Mesaje UI prietenoase pentru erori API (Gemini cotă, OpenAI billing, rate limit, etc.). */

export type AiErrorFormatContext = {
  /** Doar pentru prefix la mesaj — nu presupune „cotă epuizată”. */
  provider?: "gemini" | "openai";
};

function truncate(raw: string, max = 220): string {
  if (raw.length <= max) return raw;
  return `${raw.slice(0, max)}…`;
}

/** Extrage text util din erori SDK (mesaj, status, code, cause). */
export function extractApiErrorText(err: unknown): string {
  if (err == null) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) {
    const any = err as Error & {
      status?: number | string;
      code?: string | number;
      statusText?: string;
      cause?: unknown;
      error?: { message?: string; code?: string; status?: string };
    };
    const parts: string[] = [];
    if (err.message) parts.push(err.message);
    if (any.status != null) parts.push(`status ${any.status}`);
    if (any.code != null) parts.push(`code ${any.code}`);
    if (any.statusText) parts.push(any.statusText);
    if (any.error?.message) parts.push(any.error.message);
    if (any.error?.code) parts.push(String(any.error.code));
    if (any.cause) parts.push(extractApiErrorText(any.cause));
    return parts.filter(Boolean).join(" · ") || "Eroare necunoscută";
  }
  if (typeof err === "object") {
    try {
      const o = err as Record<string, unknown>;
      if (typeof o.message === "string") return o.message;
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

/** Erori tipice OpenAI (facturare / cotă cont). */
export function looksLikeOpenAiBillingError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    lower.includes("insufficient_quota") ||
    lower.includes("billing_hard_limit") ||
    lower.includes("hard limit") ||
    (lower.includes("billing") && !lower.includes("google") && !lower.includes("ai studio")) ||
    (lower.includes("openai") && lower.includes("quota") && !lower.includes("rate limit"))
  );
}

/** Prea multe cereri pe minut — nu e același lucru cu „cotă zilnică epuizată”. */
export function looksLikeRateLimitError(msg: string): boolean {
  const lower = msg.toLowerCase();
  if (looksLikeOpenAiBillingError(msg)) return false;
  return (
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("retry in") ||
    lower.includes("requests per") ||
    (lower.includes("429") &&
      (lower.includes("rate") || lower.includes("retry") || !lower.includes("quota")))
  );
}

/** Cotă / facturare Google AI Studio (nu simplu throttle). */
export function looksLikeGeminiQuotaError(msg: string): boolean {
  const lower = msg.toLowerCase();
  if (looksLikeOpenAiBillingError(msg)) return false;
  if (looksLikeRateLimitError(msg) && !lower.includes("quota exceeded")) return false;

  return (
    lower.includes("resource_exhausted") && lower.includes("quota") ||
    lower.includes("quota exceeded") ||
    lower.includes("exceeded your current quota") && lower.includes("google") ||
    lower.includes("generativelanguage.googleapis.com") && lower.includes("quota") ||
    (lower.includes("ai studio") && lower.includes("quota")) ||
    (lower.includes("billing") && lower.includes("google"))
  );
}

export function formatAiApiError(err: unknown, context?: AiErrorFormatContext): string {
  const raw = extractApiErrorText(err);
  const lower = raw.toLowerCase();
  const label =
    context?.provider === "openai"
      ? "OpenAI"
      : context?.provider === "gemini"
        ? "Gemini"
        : null;

  if (
    lower.includes("invalid api key") ||
    lower.includes("401") ||
    lower.includes("incorrect api key") ||
    lower.includes("api key not valid")
  ) {
    return "Cheie API invalidă. Verifică .env.local sau Setări → cheie API.";
  }

  if (looksLikeOpenAiBillingError(raw)) {
    return "Limită OpenAI atinsă (facturare). În modul comparare, alege varianta Gemini din dialog dacă e disponibilă.";
  }

  if (looksLikeRateLimitError(raw)) {
    const who = label ?? "API-ul";
    return `${who}: prea multe cereri într-un interval scurt (limită de ritm, HTTP 429). Așteaptă 1–2 minute și încearcă din nou — de obicei nu înseamnă că ai epuizat toată cota zilnică. Dacă folosești mod comparare + QA cu mai mulți pași, reduce OPENAI_IMAGE_MAX_PASSES=1 în env.`;
  }

  if (looksLikeGeminiQuotaError(raw)) {
    return "Cotă Gemini / facturare atinsă în Google AI Studio. Verifică Usage & Billing; pentru test rapid poți folosi Imagen 4 Fast sau dezactiva QA (OPENAI_IMAGE_CRITIQUE=0).";
  }

  if (lower.includes("aspect_ratio") && lower.includes("must be one of")) {
    return "Format imagine neacceptat de Gemini (raport aspect invalid). Reîncearcă — aplicația a fost actualizată să folosească doar rapoarte permise de API.";
  }

  if (label) {
    return `${label}: ${truncate(raw)}`;
  }

  return truncate(raw) || "Eroare necunoscută la generare imagine.";
}

export function isGeminiQuotaError(err: unknown): boolean {
  return looksLikeGeminiQuotaError(extractApiErrorText(err));
}
