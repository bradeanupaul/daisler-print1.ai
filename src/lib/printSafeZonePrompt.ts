/** Instrucțiuni safe zone pentru prompturile AI (nu post-procesare, nu bleed). */

export function computeSafeZonePercents(
  safeMarginMm: number,
  netWidthMm: number,
  netHeightMm: number,
): { insetXPct: number; insetYPct: number } | null {
  if (!safeMarginMm || safeMarginMm <= 0) return null;
  if (netWidthMm <= 0 || netHeightMm <= 0) return null;
  return {
    insetXPct: Math.round((safeMarginMm / netWidthMm) * 1000) / 10,
    insetYPct: Math.round((safeMarginMm / netHeightMm) * 1000) / 10,
  };
}

export function buildSafeZoneInstruction(
  safeMarginMm: number,
  netWidthMm: number,
  netHeightMm: number,
): string {
  const pct = computeSafeZonePercents(safeMarginMm, netWidthMm, netHeightMm);
  if (!pct) return "";

  return `
SAFE ZONE (obligatoriu la generare):
- Trim net: ${netWidthMm}×${netHeightMm} mm.
- Margine safe: ${safeMarginMm} mm pe fiecare latură ≈ ${pct.insetXPct}% din lățime (stânga/dreapta) și ≈ ${pct.insetYPct}% din înălțime (sus/jos).
- TOT textul, logo-urile, fețele, codurile QR și elementele critice trebuie să rămână ÎNĂUNTRUL zonei safe (nu mai aproape de marginea trim decât procentele de mai sus).
- Doar fundal decorativ (gradient, textură, culoare uniformă) poate intra în banda dintre safe zone și marginea trim.
- NU desena bleed — bleed-ul de tipar este adăugat automat DUPĂ generare, în afara celor ${netWidthMm}×${netHeightMm} mm.`;
}
