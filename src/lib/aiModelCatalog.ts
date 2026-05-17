/** Opțiuni de model afișate în Setări AI (prețuri orientative, nu facturare reală). */

export type AiModelOption = {
  id: string;
  label: string;
  description: string;
  /** Nivel relativ pentru sortare vizuală */
  tier: "low" | "medium" | "high";
  /** Text scurt pentru UI, ex. „~$0.08 / imagine” */
  costHint: string;
};

export const GEMINI_IMAGE_MODELS: AiModelOption[] = [
  {
    id: "imagen-4.0-fast-generate-001",
    label: "Imagen 4 Fast",
    description: "Cel mai ieftin (~$0.02/img). Generare din prompt; sursa e descrisă automat.",
    tier: "low",
    costHint: "Ieftin · ~$0.02 / imagine 1024px",
  },
  {
    id: "imagen-4.0-generate-001",
    label: "Imagen 4 Standard",
    description: "Calitate producție (~$0.04/img). 1K/2K după DPI; fără edit direct pe pixeli.",
    tier: "medium",
    costHint: "Mediu · ~$0.04 / imagine",
  },
  {
    id: "gemini-2.5-flash-image",
    label: "Nano Banana (2.5 Flash)",
    description: "Edit cu imagine sursă — rapid, economic, păstrează designul.",
    tier: "low",
    costHint: "Ieftin · ~$0.02–0.05 / imagine",
  },
  {
    id: "gemini-3.1-flash-image-preview",
    label: "Nano Banana 2",
    description: "Echilibru viteză/calitate; edit pe sursă.",
    tier: "medium",
    costHint: "Mediu · ~$0.04–0.10 / imagine",
  },
  {
    id: "gemini-3-pro-image-preview",
    label: "Nano Banana Pro",
    description: "Calitate maximă, 2K — edit pe sursă, recomandat pentru tipar fin.",
    tier: "high",
    costHint: "Scump · ~$0.12–0.24 / imagine 2K",
  },
];

export const GEMINI_TEXT_MODELS: AiModelOption[] = [
  {
    id: "gemini-3-flash-preview",
    label: "Gemini 3 Flash",
    description: "Agent AI, analiză calitate tipar.",
    tier: "medium",
    costHint: "Mediu · ~$0.50 / 1M token intrare",
  },
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    description: "Mai rapid și mai ieftin decât 3 Flash.",
    tier: "low",
    costHint: "Ieftin · ~$0.15 / 1M token intrare",
  },
  {
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    description: "Raționament mai puternic; cost mai mare.",
    tier: "high",
    costHint: "Scump · ~$1.25 / 1M token intrare",
  },
];

export const OPENAI_IMAGE_MODELS: AiModelOption[] = [
  {
    id: "gpt-image-2",
    label: "GPT Image 2",
    description: "Recomandat — upscale, bleed, mockup (images.edit, păstrează sursa).",
    tier: "medium",
    costHint: "Mediu–scump · ~$0.06–0.16 / imagine (high)",
  },
  {
    id: "dall-e-2",
    label: "DALL-E 2",
    description: "Economic — images.edit cu imagine sursă (max 1024px).",
    tier: "low",
    costHint: "Ieftin · ~$0.02 / imagine 1024px",
  },
  {
    id: "dall-e-3",
    label: "DALL-E 3",
    description: "Generare HD din prompt (fără edit pe sursă). Slab la upscale.",
    tier: "medium",
    costHint: "Mediu · ~$0.04 standard, ~$0.08 HD / imagine",
  },
  {
    id: "gpt-image-1",
    label: "GPT Image 1",
    description: "Generație anterioară; folosește dacă contul nu are Image 2.",
    tier: "medium",
    costHint: "Mediu · ~$0.04–0.12 / imagine",
  },
];

export const OPENAI_TEXT_MODELS: AiModelOption[] = [
  {
    id: "gpt-4o-mini",
    label: "GPT-4o mini",
    description: "Agent AI (comenzi vocale/text) — rapid și ieftin.",
    tier: "low",
    costHint: "Ieftin · ~$0.15 / 1M token intrare",
  },
  {
    id: "gpt-4o",
    label: "GPT-4o",
    description: "Analiză calitate tipar + verificare QA imagini (vision).",
    tier: "high",
    costHint: "Scump · ~$2.50 / 1M token intrare",
  },
  {
    id: "gpt-4.1-mini",
    label: "GPT-4.1 mini",
    description: "Alternativă economică pentru agent.",
    tier: "low",
    costHint: "Ieftin · ~$0.40 / 1M token intrare",
  },
  {
    id: "gpt-4.1",
    label: "GPT-4.1",
    description: "Alternativă premium pentru agent și analiză.",
    tier: "high",
    costHint: "Scump · ~$2.00 / 1M token intrare",
  },
];

export function findModelOption(
  catalog: AiModelOption[],
  id: string | undefined,
): AiModelOption | undefined {
  if (!id) return undefined;
  return catalog.find((m) => m.id === id);
}

export function resolveModelFromCatalog(
  catalog: AiModelOption[],
  storedId: string | undefined,
  envId: string | undefined,
  defaultId: string,
): string {
  if (storedId && catalog.some((m) => m.id === storedId)) return storedId;
  if (envId && catalog.some((m) => m.id === envId)) return envId;
  if (catalog.some((m) => m.id === defaultId)) return defaultId;
  return catalog[0]?.id ?? defaultId;
}

export function tierColor(tier: AiModelOption["tier"]): string {
  switch (tier) {
    case "low":
      return "text-emerald-400";
    case "high":
      return "text-amber-400";
    default:
      return "text-sky-300";
  }
}
