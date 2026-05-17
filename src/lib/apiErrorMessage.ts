/** Mesaje UI prietenoase pentru erori API (Gemini cotă, OpenAI billing, etc.). */

export type AiErrorFormatContext = {
  /** Când știm furnizorul (ex. coloană în mod comparare). */
  provider?: "gemini" | "openai";
};

function rawMessage(err: unknown): string {
  return err instanceof Error
    ? err.message
    : typeof err === "string"
      ? err
      : JSON.stringify(err);
}

/** Erori tipice OpenAI (facturare / cotă cont). */
export function looksLikeOpenAiBillingError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    lower.includes("insufficient_quota") ||
    lower.includes("billing_hard_limit") ||
    lower.includes("hard limit") ||
    (lower.includes("billing") && !lower.includes("google") && !lower.includes("ai studio")) ||
    (lower.includes("openai") && (lower.includes("quota") || lower.includes("limit"))) ||
    /you exceeded your current quota/i.test(msg)
  );
}

/** Erori tipice Gemini / Google AI. */
export function looksLikeGeminiQuotaError(msg: string): boolean {
  const lower = msg.toLowerCase();
  if (looksLikeOpenAiBillingError(msg)) return false;
  return (
    lower.includes("resource_exhausted") ||
    lower.includes("generativelanguage.googleapis.com") ||
    (lower.includes("google") && lower.includes("quota")) ||
    (lower.includes("ai studio") && lower.includes("quota")) ||
    (lower.includes("quota") && lower.includes("gemini"))
  );
}

export function formatAiApiError(err: unknown, context?: AiErrorFormatContext): string {
  const raw = rawMessage(err);
  const lower = raw.toLowerCase();

  const openAi =
    context?.provider === "openai" || looksLikeOpenAiBillingError(raw);
  const gemini =
    context?.provider === "gemini" || looksLikeGeminiQuotaError(raw);

  if (openAi && !gemini) {
    return "Limită OpenAI atinsă (facturare). În modul comparare, alege varianta Gemini din dialog dacă e disponibilă.";
  }

  if (gemini && !openAi) {
    return "Cotă Gemini epuizată sau limită atinsă. Verifică Google AI Studio sau alege varianta OpenAI din dialog.";
  }

  if (lower.includes("invalid api key") || lower.includes("401") || lower.includes("incorrect api key")) {
    return "Cheie API invalidă. Verifică .env.local sau Setări → cheie API.";
  }

  if (raw.length > 200) return `${raw.slice(0, 200)}…`;
  return raw || "Eroare necunoscută la generare imagine.";
}

export function isGeminiQuotaError(err: unknown): boolean {
  return looksLikeGeminiQuotaError(rawMessage(err));
}
