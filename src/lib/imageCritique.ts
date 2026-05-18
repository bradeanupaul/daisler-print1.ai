import type { UpscalePromptMode } from "./aiUpscalePrompts";

export type ImageCritiqueResult = {
  shouldRegenerate: boolean;
  issues: string[];
  promptAddendum: string;
};

/** Ce trimitem la modelul QA (vision). */
export type ImageCritiqueRequest = {
  mode: UpscalePromptMode;
  /** Promptul folosit la generare — OUTPUT trebuie să îl respecte. */
  intentSummary: string;
  /** Imaginea sursă înainte de pasul AI (ground truth conținut). */
  originalImageUrl: string;
};

const EXTEND_QA = `
EXTEND / OUTPAINT QA (compare ORIGINAL vs OUTPUT):
- Inside the original artwork boundaries: same layout, subjects, text, logos — untouched (preserve composition).
- Only outer/new areas may change: seamless environment continuation.
- If GENERATION PROMPT defines SAFE ZONE percentages: no text, logos, faces, or key subjects in those outer bands (decorative background only).
- If GENERATION PROMPT defines BLEED: OUTPUT must be net trim only — no bleed drawn by the model.
- REGENERATE if: center artwork moved, rescaled, or cropped; new subjects/text/logos; duplicated or tiled poster; flat empty bands where background should continue; garbled or missing text from ORIGINAL; critical content inside safe zone bands; whole-image uniform stretch instead of outpaint; clear style or lighting break at seams.
`;

const RECOMPOSE_QA = `
RECOMPOSE QA (compare ORIGINAL vs OUTPUT):
- Composition-only: OUTPUT uses only elements from ORIGINAL (layout may change).
- If GENERATION PROMPT defines SAFE ZONE percentages: no text, logos, faces, or key subjects in those outer bands.
- REGENERATE if: new objects, icons, photos, or readable text not in ORIGINAL; major elements from ORIGINAL missing; uniform whole-image stretch with no real layout change; garbled or cropped text; changed typography content; redesigned individual elements; critical content inside safe zone bands; style drift.
`;

export function buildImageCritiqueInstruction(request: ImageCritiqueRequest): string {
  const modeBlock = request.mode === "extend" ? EXTEND_QA : RECOMPOSE_QA;
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

Set shouldRegenerate true only for clear violations of MODE rules or the GENERATION PROMPT (missing ORIGINAL elements, forbidden new content, wrong operation type, broken text). Minor softness or slight color shift: false.

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
