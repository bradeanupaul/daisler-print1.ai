/**
 * Prompt comun pentru modul „Extend”: outpainting care continuă designul,
 * nu bande goale / câmpuri plate lângă pattern-uri bogate.
 */
export function buildUpscaleExtendOutpaintPrompt(opts: {
  formatName: string;
  targetW: number;
  targetH: number;
  bleedMm: number;
}): string {
  const { formatName, targetW, targetH, bleedMm } = opts;
  const netW = Math.max(0, targetW - 2 * bleedMm);
  const netH = Math.max(0, targetH - 2 * bleedMm);

  return `DESIGN EXTENSION — PROFESSIONAL PRINT OUTPAINTING.

The input shows the complete original artwork centered on the canvas. The PURE WHITE bands (RGB 255,255,255) are intentional EMPTY ZONES: your job is to FILL THEM by extending the existing VISUAL DESIGN (graphics, ornament, texture), not by leaving big neutral voids.

NON-NEGOTIABLE RULES:
1) PRESERVE the central artwork: do not crop, rescale, shift, or repaint the non-white composition. Only pixels in the white margin areas may change.
2) EXTEND REAL DESIGN ELEMENTS that already meet the white edge — e.g. radial or concentric sunbursts, rays, arcs, chevrons, stripes, zigzags, scalloped borders, ticket stubs / perforations, halftone screens, paper grain, vignettes, thick frame bands, stars, bunting, decorative typography blocks (without inventing new readable words). Those structures must CONTINUE through the margin toward the outer edge with matching angles, rhythm, colors, and stroke weight.
3) FORBIDDEN: large rectangles of flat cream / beige / off-white / “empty paper” when the adjacent artwork shows strong pattern, color alternation, or ornamental edges — that is a failed extend. Replace such voids with believable continuation of the same graphic language.
4) Use the outermost few percent of pixels along each artwork↔white boundary as the seed; extrapolate coherently (no random new motifs unrelated to the piece’s era and style).
5) No visible seams, halo frames, watermarks, QR codes, or unrelated stock imagery.

Print context: format ${formatName}; total target sheet ~${targetW}×${targetH} mm including ~${bleedMm} mm bleed per side; net trim area ~${netW}×${netH} mm.`;
}
