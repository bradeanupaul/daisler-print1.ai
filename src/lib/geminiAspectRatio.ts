/**
 * Rapoarte acceptate de Gemini imageConfig (generateContent / Imagen).
 * @see https://ai.google.dev/gemini-api/docs/image-generation
 */
export const GEMINI_ALLOWED_ASPECT_RATIOS = [
  "1:1",
  "1:4",
  "1:8",
  "2:3",
  "3:2",
  "3:4",
  "4:1",
  "4:3",
  "4:5",
  "5:4",
  "8:1",
  "9:16",
  "16:9",
] as const;

export type GeminiAspectRatio = (typeof GEMINI_ALLOWED_ASPECT_RATIOS)[number];

function parseRatio(name: GeminiAspectRatio): number {
  const [w, h] = name.split(":").map(Number);
  return w / h;
}

const RATIO_LOOKUP: { name: GeminiAspectRatio; value: number }[] =
  GEMINI_ALLOWED_ASPECT_RATIOS.map((name) => ({
    name,
    value: parseRatio(name),
  }));

/** Alege cel mai apropiat aspect_ratio valid pentru dimensiuni în mm (sau px). */
export function pickGeminiAspectRatio(width: number, height: number): GeminiAspectRatio {
  const safeW = width > 0 ? width : 1;
  const safeH = height > 0 ? height : 1;
  const ratio = safeW / safeH;

  return RATIO_LOOKUP.reduce((prev, curr) =>
    Math.abs(curr.value - ratio) < Math.abs(prev.value - ratio) ? curr : prev,
  ).name;
}

/** Validează sau înlocuiește cu cel mai apropiat raport permis. */
export function coerceGeminiAspectRatio(
  value: string | undefined,
  widthMm: number,
  heightMm: number,
): GeminiAspectRatio {
  if (value && GEMINI_ALLOWED_ASPECT_RATIOS.includes(value as GeminiAspectRatio)) {
    return value as GeminiAspectRatio;
  }
  return pickGeminiAspectRatio(widthMm, heightMm);
}
