export type ImageCritiqueResult = {
  shouldRegenerate: boolean;
  issues: string[];
  promptAddendum: string;
};

export function buildImageCritiqueInstruction(intentSummary: string): string {
  return `You are strict QA for AI print / outpainting / mockup generation.

INTENT (what the edit should achieve):
${intentSummary.slice(0, 3500)}

Two images follow in order:
1) REFERENCE = input before this generation step (layout / artwork as sent to the image model).
2) OUTPUT = the generated image to judge.

Return ONE JSON object only:
{
  "shouldRegenerate": boolean,
  "issues": string[],
  "promptAddendum": string
}

Set shouldRegenerate true ONLY for clear defects: obvious seams; large flat-color fills where the reference shows structured patterns (radial rays, stripes, grids); cropped or damaged central artwork that must stay intact; unreadable garbled text; watermarks; severe banding.
For OUTPAINTING / EXTEND jobs specifically: broad empty bands of solid cream, beige, off-white, or flat "paper" directly beside rich decorative edges (sunburst, stripes, frames) that clearly demanded pattern continuation — treat as a defect (shouldRegenerate true) and name which margin needs continued ornament.
For PRINT RECOMPOSITION / LAYOUT-ONLY intents (when INTENT forbids new content): shouldRegenerate true if OUTPUT adds logos, icons, mascots, clipart, QR codes, new photos, new decorative illustrations, or clearly new readable text/slogans not present in REFERENCE. Slight paraphrase or illegible blur alone is not enough — focus on visibly NEW objects or copy.
Also for recomposition: shouldRegenerate true if OUTPUT is clearly just a uniform global stretch/squash of the whole piece with almost no change in relative positions of major blocks (lazy scale-to-fit) — promptAddendum should demand discrete repositioning and independent per-element scaling, not whole-image stretch.
Minor style differences or slight softness: shouldRegenerate false.

promptAddendum: concise English instructions for the NEXT image-edit prompt (empty if shouldRegenerate is false). Max 900 characters. Be specific (e.g. "continue red-blue radial rays into top margin; do not use solid red fill").`;
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
  return `${basePrompt}\n\n--- QA refinement (attempt ${passIndex + 2} of ${maxPasses}) ---\nObserved issues:\n${issueBlock}\n\nApply these corrections in the next render:\n${promptAddendum}`;
}
