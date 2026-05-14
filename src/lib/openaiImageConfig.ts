/** Config injectată de Vite `define` pentru fluxuri imagine OpenAI. */
export function resolveOpenAIImageModel(): string {
  const raw =
    (typeof process !== "undefined" &&
      process.env.OPENAI_IMAGE_MODEL &&
      String(process.env.OPENAI_IMAGE_MODEL).trim()) ||
    "";
  return raw || "gpt-image-2";
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
