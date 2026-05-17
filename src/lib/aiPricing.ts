/**
 * Prețuri Standard API (USD / 1M tokeni), surse oficiale:
 * - OpenAI: https://openai.com/api/pricing/ , https://platform.openai.com/docs/pricing
 * - Gemini: https://ai.google.dev/gemini-api/docs/pricing
 *
 * Actualizează la schimbările vendor; costul afișat este estimativ.
 */

export type TokenRates = {
  inputPer1M: number;
  outputPer1M: number;
  /** OpenAI GPT Image: text în prompt */
  textInputPer1M?: number;
  /** OpenAI GPT Image: imagini în prompt */
  imageInputPer1M?: number;
  /** Gemini: tokeni imagine la ieșire (ex. $120/1M) */
  imageOutputPer1M?: number;
};

/** Potrivire parțială pe id model (ex. „gemini-3-pro-image-preview”). */
export function resolveTokenRates(modelId: string): TokenRates {
  const id = modelId.toLowerCase();

  // —— OpenAI GPT Image ——
  if (id.includes("gpt-image-2")) {
    return { inputPer1M: 8, outputPer1M: 30, textInputPer1M: 5, imageInputPer1M: 8 };
  }
  if (id.includes("gpt-image-1-mini")) {
    return { inputPer1M: 2.5, outputPer1M: 8, textInputPer1M: 2, imageInputPer1M: 2.5 };
  }
  if (id.includes("gpt-image-1")) {
    return { inputPer1M: 10, outputPer1M: 40, textInputPer1M: 10, imageInputPer1M: 10 };
  }

  // DALL-E: facturare per imagine (nu tokeni) — rate placeholder pentru estimări
  if (id.includes("dall-e-3")) {
    return { inputPer1M: 0, outputPer1M: 0 };
  }
  if (id.includes("dall-e-2")) {
    return { inputPer1M: 0, outputPer1M: 0 };
  }

  // —— OpenAI text / vision ——
  if (id.includes("gpt-4o-mini")) {
    return { inputPer1M: 0.15, outputPer1M: 0.6 };
  }
  if (id.includes("gpt-4o")) {
    return { inputPer1M: 2.5, outputPer1M: 10 };
  }
  if (id.includes("gpt-4.1-mini")) {
    return { inputPer1M: 0.4, outputPer1M: 1.6 };
  }
  if (id.includes("gpt-4.1")) {
    return { inputPer1M: 2, outputPer1M: 8 };
  }

  // —— Gemini image ——
  if (id.includes("gemini-3-pro-image") || id.includes("gemini-3.1-pro-image")) {
    return {
      inputPer1M: 2,
      outputPer1M: 12,
      imageOutputPer1M: 120,
    };
  }
  if (id.includes("gemini-3.1-flash-image") || id.includes("gemini-3-flash-image")) {
    return {
      inputPer1M: 0.5,
      outputPer1M: 3,
      imageOutputPer1M: 60,
    };
  }
  if (id.includes("gemini-2.5-flash-image")) {
    return { inputPer1M: 0.3, outputPer1M: 2.5, imageOutputPer1M: 30 };
  }

  // Imagen: facturare per imagine
  if (id.includes("imagen")) {
    return { inputPer1M: 0, outputPer1M: 0 };
  }

  // —— Gemini text ——
  if (id.includes("gemini-3-flash")) {
    return { inputPer1M: 0.5, outputPer1M: 3 };
  }
  if (id.includes("gemini-2.5-pro")) {
    return { inputPer1M: 1.25, outputPer1M: 10 };
  }
  if (id.includes("gemini-2.5-flash")) {
    return { inputPer1M: 0.3, outputPer1M: 2.5 };
  }

  return { inputPer1M: 1, outputPer1M: 4 };
}

export function isGeminiImageModel(modelId: string): boolean {
  const id = modelId.toLowerCase();
  return (id.includes("gemini") && id.includes("image")) || id.includes("imagen");
}

export function isImagenModel(modelId: string): boolean {
  return modelId.toLowerCase().includes("imagen-");
}

export function isGeminiNativeImageModel(modelId: string): boolean {
  return isGeminiImageModel(modelId) && !isImagenModel(modelId);
}

/** Cost fix per imagine Imagen (USD), sursă Gemini API pricing. */
export function estimateImagenImageUsd(modelId: string): number {
  const id = modelId.toLowerCase();
  if (id.includes("fast")) return 0.02;
  if (id.includes("ultra")) return 0.06;
  if (id.includes("imagen")) return 0.04;
  return 0.04;
}

export function isOpenAIImageModel(modelId: string): boolean {
  return modelId.toLowerCase().includes("gpt-image");
}

export function isOpenAIDalleModel(modelId: string): boolean {
  const id = modelId.toLowerCase();
  return id === "dall-e-2" || id === "dall-e-3";
}

/** Cost fix per imagine DALL-E (USD), sursă OpenAI pricing. */
export function estimateDalleImageUsd(
  modelId: string,
  opts?: { quality?: "standard" | "hd"; size?: string },
): number {
  const id = modelId.toLowerCase();
  if (id.includes("dall-e-3")) {
    const q = opts?.quality ?? "standard";
    const size = opts?.size ?? "1024x1024";
    if (q === "hd") {
      if (size === "1024x1792" || size === "1792x1024") return 0.12;
      return 0.08;
    }
    if (size === "1024x1792" || size === "1792x1024") return 0.08;
    return 0.04;
  }
  if (id.includes("dall-e-2")) {
    const size = opts?.size ?? "1024x1024";
    if (size === "256x256") return 0.016;
    if (size === "512x512") return 0.018;
    return 0.02;
  }
  return 0.04;
}
