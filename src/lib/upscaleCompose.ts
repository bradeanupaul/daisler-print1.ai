import { resolvePrintGenerationProfile } from "./printGenerationProfile";
import type { ExtendMarginBands } from "./aiUpscalePrompts";

export type { ExtendMarginBands };

const DEFAULT_MAX_UPSCALE_CANVAS_EDGE = 4096;

function mmToTrimPx(mm: number, dpi: number): number {
  return Math.max(1, Math.round((mm / 25.4) * dpi));
}

/**
 * Pixeli pentru zona NET trimisă la upscale: aceeași formulă ca la tipar (mm × DPI),
 * cu scară uniformă dacă depășește plafonul — raportul rămâne cel al formatului (ex. 16:9).
 */
export function pickUpscaleNetCanvasPixels(
  netWmm: number,
  netHmm: number,
  targetDpi?: number,
  maxEdgePx = DEFAULT_MAX_UPSCALE_CANVAS_EDGE,
): { width: number; height: number } {
  const profile = resolvePrintGenerationProfile(targetDpi);
  const dpi = profile.targetDpi;
  const fallback = profile.extendCanvasLongEdge;
  if (netWmm <= 0 || netHmm <= 0) {
    return { width: fallback, height: fallback };
  }
  let w = mmToTrimPx(netWmm, dpi);
  let h = mmToTrimPx(netHmm, dpi);
  if (w > maxEdgePx || h > maxEdgePx) {
    const s = Math.min(maxEdgePx / w, maxEdgePx / h, 1);
    w = Math.max(1, Math.round(w * s));
    h = Math.max(1, Math.round(h * s));
  }
  return { width: w, height: h };
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
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("Încărcare imagine eșuată"));
    img.src = sourceDataUrl;
  });
}
