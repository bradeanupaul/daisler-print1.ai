/** Setări comune QA + regenerare (OpenAI și Gemini). */

/** Max. pași imagine per acțiune (prima generare + regenerări). 1–5, implicit 3. */
export function resolveImageMaxPasses(): number {
  const raw =
    (typeof process !== "undefined" &&
      (process.env.OPENAI_IMAGE_MAX_PASSES || process.env.AI_IMAGE_MAX_PASSES) &&
      String(process.env.OPENAI_IMAGE_MAX_PASSES || process.env.AI_IMAGE_MAX_PASSES).trim()) ||
    "";
  const n = parseInt(raw, 10);
  if (Number.isFinite(n) && n >= 1 && n <= 5) return n;
  return 3;
}

/** După fiecare imagine: vision QA + retry dacă e nevoie. Dezactivează cu 0 / false. */
export function resolveImageCritiqueEnabled(): boolean {
  const raw =
    (typeof process !== "undefined" &&
      (process.env.OPENAI_IMAGE_CRITIQUE || process.env.AI_IMAGE_CRITIQUE) &&
      String(process.env.OPENAI_IMAGE_CRITIQUE || process.env.AI_IMAGE_CRITIQUE)
        .trim()
        .toLowerCase()) ||
    "";
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return true;
}
