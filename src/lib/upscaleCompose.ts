import {
  resolveAiGenerationLongEdgePx,
  resolvePrintGenerationProfile,
} from "./printGenerationProfile";
import type { ExtendMarginBands } from "./aiUpscalePrompts";

export type { ExtendMarginBands };

export type ComposeAiCanvasOpts = {
  safeMarginMm?: number;
  netWmm?: number;
  netHmm?: number;
};

/** Ghid vizual pe INPUT (nu apare în output) — dreptunghi portocaliu punctat. */
export function drawInputSafeZoneGuide(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  safeMarginMm: number,
  netWmm: number,
  netHmm: number,
): void {
  if (safeMarginMm <= 0 || netWmm <= 0 || netHmm <= 0) return;
  const insetX = Math.max(1, Math.round((safeMarginMm / netWmm) * canvasW));
  const insetY = Math.max(1, Math.round((safeMarginMm / netHmm) * canvasH));
  if (insetX * 2 >= canvasW || insetY * 2 >= canvasH) return;

  ctx.save();
  ctx.strokeStyle = "rgba(251, 146, 60, 0.62)";
  ctx.lineWidth = Math.max(1, Math.round(canvasW / 420));
  const dash = ctx.lineWidth * 5;
  ctx.setLineDash([dash, dash * 0.75]);
  ctx.strokeRect(insetX + 0.5, insetY + 0.5, canvasW - 2 * insetX - 1, canvasH - 2 * insetY - 1);
  ctx.restore();
}

function applyInputSafeGuideIfNeeded(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  opts?: ComposeAiCanvasOpts,
): void {
  const safe = opts?.safeMarginMm ?? 0;
  const netW = opts?.netWmm ?? 0;
  const netH = opts?.netHmm ?? 0;
  if (safe > 0 && netW > 0 && netH > 0) {
    drawInputSafeZoneGuide(ctx, canvasW, canvasH, safe, netW, netH);
  }
}

/**
 * Canvas trimis la AI: latura lungă după DPI (72→1000 · 150→1500 · 300→2000 px),
 * raport exact mmW:mmH.
 */
export function pickUpscaleNetCanvasPixels(
  netWmm: number,
  netHmm: number,
  targetDpi?: number,
): { width: number; height: number } {
  const long = resolveAiGenerationLongEdgePx(targetDpi);
  if (netWmm <= 0 || netHmm <= 0) {
    const fallback = resolvePrintGenerationProfile(targetDpi).extendCanvasLongEdge;
    return { width: fallback, height: fallback };
  }
  const r = netWmm / netHmm;
  if (r >= 1) {
    return { width: long, height: Math.max(1, Math.round(long / r)) };
  }
  return { width: Math.max(1, Math.round(long * r)), height: long };
}

function aspectsClose(a: number, b: number, tolerance = 0.035): boolean {
  return Math.abs(a - b) / Math.max(a, b, 1e-6) < tolerance;
}

function inferExtendBands(
  canvasW: number,
  canvasH: number,
  artW: number,
  artH: number,
): ExtendMarginBands {
  const emptyW = canvasW - artW;
  const emptyH = canvasH - artH;
  if (emptyW > emptyH * 1.08) return "left-right";
  if (emptyH > emptyW * 1.08) return "top-bottom";
  return "minimal";
}

/**
 * Extend: artă centrată (contain) pe canvas la raportul țintă — benzile goale = zone de outpaint.
 * Fără blur — modelul vede clar ce trebuie umplut.
 */
export async function composeExtendOutpaintCanvas(
  sourceDataUrl: string,
  canvasW: number,
  canvasH: number,
  opts?: ComposeAiCanvasOpts,
): Promise<{ dataUrl: string; bands: ExtendMarginBands }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvasW;
      canvas.height = canvasH;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2D indisponibil"));
        return;
      }
      const nw = img.naturalWidth || img.width;
      const nh = img.naturalHeight || img.height;
      if (!nw || !nh) {
        reject(new Error("Dimensiuni imagine invalide"));
        return;
      }

      const targetR = canvasW / canvasH;
      const sourceR = nw / nh;
      const useCover = aspectsClose(targetR, sourceR);

      let dw: number;
      let dh: number;
      let dx: number;
      let dy: number;
      let bands: ExtendMarginBands = "minimal";

      if (useCover) {
        const scale = Math.max(canvasW / nw, canvasH / nh);
        dw = nw * scale;
        dh = nh * scale;
        dx = (canvasW - dw) / 2;
        dy = (canvasH - dh) / 2;
      } else {
        const scaleContain = Math.min(canvasW / nw, canvasH / nh);
        dw = nw * scaleContain;
        dh = nh * scaleContain;
        dx = (canvasW - dw) / 2;
        dy = (canvasH - dh) / 2;
        bands = inferExtendBands(canvasW, canvasH, dw, dh);
      }

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvasW, canvasH);
      ctx.drawImage(img, dx, dy, dw, dh);
      applyInputSafeGuideIfNeeded(ctx, canvasW, canvasH, opts);

      resolve({
        dataUrl: canvas.toDataURL("image/png"),
        bands,
      });
    };
    img.onerror = () => reject(new Error("Încărcare imagine eșuată"));
    img.src = sourceDataUrl;
  });
}

/** @deprecated Folosește composeExtendOutpaintCanvas */
export async function composeExtendCenterContain(
  sourceDataUrl: string,
  canvasW: number,
  canvasH: number,
): Promise<string> {
  const { dataUrl } = await composeExtendOutpaintCanvas(sourceDataUrl, canvasW, canvasH);
  return dataUrl;
}

/** Recompose: imagine mare pe canvas (fără blur). */
export async function composeRecomposeCanvasForGemini(
  sourceDataUrl: string,
  canvasW: number,
  canvasH: number,
  opts?: ComposeAiCanvasOpts,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvasW;
      canvas.height = canvasH;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2D indisponibil"));
        return;
      }
      const nw = img.naturalWidth || img.width;
      const nh = img.naturalHeight || img.height;
      if (!nw || !nh) {
        reject(new Error("Dimensiuni imagine invalide"));
        return;
      }
      const scale = Math.max(canvasW / nw, canvasH / nh);
      const dw = nw * scale;
      const dh = nh * scale;
      const dx = (canvasW - dw) / 2;
      const dy = (canvasH - dh) / 2;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvasW, canvasH);
      ctx.drawImage(img, dx, dy, dw, dh);
      applyInputSafeGuideIfNeeded(ctx, canvasW, canvasH, opts);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("Încărcare imagine eșuată"));
    img.src = sourceDataUrl;
  });
}
