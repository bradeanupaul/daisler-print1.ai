import type { UpscalePromptMode } from "./aiUpscalePrompts";

export type ImageCritiqueMode = UpscalePromptMode | "bleed";

export type ImageCritiqueResult = {
  shouldRegenerate: boolean;
  issues: string[];
  promptAddendum: string;
};

/** Ce trimitem la modelul QA (vision). */
const BLEED_QA = `
BLEED OUTPAINT QA (compare ORIGINAL net art vs OUTPUT):
- OUTPUT fills outer bleed bands only; center net artwork unchanged.
- Bleed texture must match edge pixels — same detail level, no visible seam at trim line.
- REGENERATE if: texture/style break at trim boundary; extra detail in bleed vs center edges; marbled filler; smear/mirror; white bleed; blur halo; center changed or miniature.
`;

export type ImageCritiqueRequest = {
  mode: ImageCritiqueMode;
  /** Promptul folosit la generare — OUTPUT trebuie să îl respecte. */
  intentSummary: string;
  /** Imaginea sursă înainte de pasul AI (ground truth conținut). */
  originalImageUrl: string;
};

const EXTEND_QA = `
EXTEND / OUTPAINT QA (compare ORIGINAL vs OUTPUT):
- Inside the original artwork boundaries: same layout, subjects, text, logos — untouched (preserve composition).
- Only outer/new areas may change: seamless environment continuation.
- If GENERATION PROMPT defines CONTENT SAFE AREA / margin bands: ALL text, logos, faces, CTAs, and key subjects must lie fully inside the inner safe rectangle — none in the outer margin strips (only decorative background allowed there).
- REGENERATE if: center artwork moved, rescaled, or cropped; new subjects/text/logos; duplicated or tiled poster; flat empty bands where background should continue; garbled or missing text from ORIGINAL; any critical content in outer margin bands or crossing the content safe boundary; whole-image uniform stretch instead of outpaint; clear style or lighting break at seams; orange dashed guide reproduced in OUTPUT.
`;

const RECOMPOSE_QA = `
RECOMPOSE QA (compare ORIGINAL vs OUTPUT):
- Composition-only: OUTPUT uses only elements from ORIGINAL (layout may change).
- If GENERATION PROMPT defines CONTENT SAFE AREA / margin bands: ALL text, logos, faces, CTAs, and key subjects must lie fully inside the inner safe rectangle — none in outer margin strips.
- REGENERATE if: new objects, icons, photos, or readable text not in ORIGINAL; major elements from ORIGINAL missing; uniform whole-image stretch with no real layout change; garbled or cropped text; changed typography content; redesigned individual elements; any critical content in outer margin bands or crossing the content safe boundary; style drift; orange dashed guide reproduced in OUTPUT.
`;

export function buildImageCritiqueInstruction(request: ImageCritiqueRequest): string {
  const modeBlock =
    request.mode === "bleed"
      ? BLEED_QA
      : request.mode === "extend"
        ? EXTEND_QA
        : RECOMPOSE_QA;
  return `You are strict QA for AI image resizing (print / marketing artwork).

MODE: ${request.mode.toUpperCase()}

GENERATION PROMPT (OUTPUT must comply):
${request.intentSummary.slice(0, 4000)}

You receive two images in order:
1) ORIGINAL — source artwork BEFORE this AI step (ground truth: what must be preserved or reused).
2) OUTPUT — AI-generated result to judge against ORIGINAL and the GENERATION PROMPT.

${modeBlock}

Return ONE JSON object only:
{
  "shouldRegenerate": boolean,
  "issues": string[],
  "promptAddendum": string
}

Set shouldRegenerate true for clear violations of MODE rules or the GENERATION PROMPT (missing ORIGINAL elements, forbidden new content, wrong operation type, broken text, critical content outside content safe area). Minor softness or slight color shift: false. Content safe area violations are never minor.

issues: short English bullets naming specific defects (max 6).
promptAddendum: concise English fix instructions for the NEXT image generation (max 600 characters). Empty string if shouldRegenerate is false.`;
}

export function parseImageCritiqueJson(text: string | undefined | null): ImageCritiqueResult {
  if (!text?.trim()) {
    return { shouldRegenerate: false, issues: [], promptAddendum: "" };
  }
  try {
    const parsed = JSON.parse(text.replace(/```json\n?|\n?```/g, "").trim());
    return {
      shouldRegenerate: !!parsed.shouldRegenerate,
      issues: Array.isArray(parsed.issues) ? parsed.issues.map(String) : [],
      promptAddendum: typeof parsed.promptAddendum === "string" ? parsed.promptAddendum : "",
    };
  } catch {
    return { shouldRegenerate: false, issues: [], promptAddendum: "" };
  }
}

export function appendCritiqueToPrompt(
  basePrompt: string,
  passIndex: number,
  maxPasses: number,
  issues: string[],
  promptAddendum: string,
): string {
  const issueBlock =
    issues.length > 0 ? issues.map((x, i) => `${i + 1}. ${x}`).join("\n") : "(see corrections below)";
  return `${basePrompt}\n\n--- QA refinement (attempt ${passIndex + 2} of ${maxPasses}) ---\nObserved issues:\n${issueBlock}\n\nApply these corrections:\n${promptAddendum}`;
}
