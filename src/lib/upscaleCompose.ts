import { resolvePrintGenerationProfile } from "./printGenerationProfile";

/**
 * Canvas extend înainte de API — dimensiune după DPI (300 → 1536px lungime).
 */
export function pickCanvasSizeForMmAspect(mmW: number, mmH: number, targetDpi?: number) {
  const long = resolvePrintGenerationProfile(targetDpi).extendCanvasLongEdge;
  const short = Math.round(long * (1024 / 1536));
  if (mmW <= 0 || mmH <= 0) return { width: long, height: long };
  const r = mmW / mmH;
  if (r >= 1.35) return { width: long, height: short };
  if (r <= 0.75) return { width: short, height: long };
  return { width: short, height: short };
}

export async function composeExtendCenterContain(
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
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvasW, canvasH);
      const nw = img.naturalWidth || img.width;
      const nh = img.naturalHeight || img.height;
      if (!nw || !nh) {
        reject(new Error("Dimensiuni imagine invalide"));
        return;
      }
      const scale = Math.min(canvasW / nw, canvasH / nh);
      const dw = nw * scale;
      const dh = nh * scale;
      const dx = (canvasW - dw) / 2;
      const dy = (canvasH - dh) / 2;
      ctx.drawImage(img, dx, dy, dw, dh);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("Încărcare imagine eșuată"));
    img.src = sourceDataUrl;
  });
}
