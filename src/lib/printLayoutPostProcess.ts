/**
 * Adaugă bleed algoritmic ÎNAFARA zonei net.
 * `contain` — păstrează tot canvasul AI. `cover` — umple trim-ul (upscale extend).
 */
import { ensureImageDataUrl } from "./imageDataUrl";
import { PRINT_FORMATS, type ProcessingSettings } from "../types";

export type PrintArtworkFit = "contain" | "cover";

export type AlgorithmicBleedOptions = {
  artworkFit?: PrintArtworkFit;
};

export type PrintLayoutMm = {
  netWidthMm: number;
  netHeightMm: number;
  bleedMm: number;
  safeMarginMm: number;
  dpi: number;
};

type Rect = { x: number; y: number; w: number; h: number };

type PrintLayoutPx = {
  totalW: number;
  totalH: number;
  bleedPx: number;
  trim: Rect;
};

type Rgb = [number, number, number];

function mmToPx(mm: number, dpi: number): number {
  return Math.max(1, Math.round((mm / 25.4) * dpi));
}

export function getPrintLayoutFromSettings(settings: ProcessingSettings): PrintLayoutMm {
  const fmt = PRINT_FORMATS.find((f) => f.id === settings.formatId);
  const netW =
    settings.formatId === "custom" ? settings.customWidth || 90 : fmt?.width || 90;
  const netH =
    settings.formatId === "custom" ? settings.customHeight || 50 : fmt?.height || 50;
  return {
    netWidthMm: netW,
    netHeightMm: netH,
    bleedMm: settings.bleed ?? 3,
    safeMarginMm: settings.safeMargin ?? 3,
    dpi: settings.dpi ?? 300,
  };
}

function computePrintLayoutPx(layout: PrintLayoutMm): PrintLayoutPx {
  const bleedPx = mmToPx(layout.bleedMm, layout.dpi);
  const trimW = mmToPx(layout.netWidthMm, layout.dpi);
  const trimH = mmToPx(layout.netHeightMm, layout.dpi);
  const totalW = trimW + 2 * bleedPx;
  const totalH = trimH + 2 * bleedPx;
  const trim: Rect = { x: bleedPx, y: bleedPx, w: trimW, h: trimH };
  return { totalW, totalH, bleedPx, trim };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Încărcare imagine eșuată"));
    img.src = url;
  });
}

function drawArtworkOnCanvas(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
  fit: PrintArtworkFit,
) {
  const nw = img.naturalWidth || img.width;
  const nh = img.naturalHeight || img.height;
  if (!nw || !nh) return;
  const scale = fit === "cover" ? Math.max(w / nw, h / nh) : Math.min(w / nw, h / nh);
  const dw = nw * scale;
  const dh = nh * scale;
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, dx, dy, dw, dh);
}

function sampleCornerBg(imageData: ImageData, w: number, h: number): Rgb {
  const { data: px, width } = imageData;
  const patch = 6;
  const samples: Rgb[] = [];
  const corners = [
    [0, 0],
    [w - patch, 0],
    [0, h - patch],
    [w - patch, h - patch],
  ];
  for (const [cx, cy] of corners) {
    for (let dy = 0; dy < patch; dy++) {
      for (let dx = 0; dx < patch; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= width || y >= h) continue;
        const i = (y * width + x) * 4;
        samples.push([px[i]!, px[i + 1]!, px[i + 2]!]);
      }
    }
  }
  if (samples.length === 0) return [255, 255, 255];
  const r = samples.reduce((s, c) => s + c[0], 0) / samples.length;
  const g = samples.reduce((s, c) => s + c[1], 0) / samples.length;
  const b = samples.reduce((s, c) => s + c[2], 0) / samples.length;
  return [Math.round(r), Math.round(g), Math.round(b)];
}

function samplePixel(canvas: HTMLCanvasElement, x: number, y: number): Rgb {
  const ctx = canvas.getContext("2d");
  if (!ctx) return [255, 255, 255];
  const d = ctx.getImageData(
    Math.min(x, canvas.width - 1),
    Math.min(y, canvas.height - 1),
    1,
    1,
  ).data;
  return [d[0]!, d[1]!, d[2]!];
}

/** Plasează canvas-ul net centrat pe fișierul final și extrapolează bleed în jur. */
function composeBleedAroundNet(
  netCanvas: HTMLCanvasElement,
  layout: PrintLayoutPx,
  bg: Rgb,
): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = layout.totalW;
  out.height = layout.totalH;
  const ctx = out.getContext("2d");
  if (!ctx) return out;

  const { trim, bleedPx } = layout;
  ctx.fillStyle = `rgb(${bg[0]},${bg[1]},${bg[2]})`;
  ctx.fillRect(0, 0, out.width, out.height);

  if (bleedPx <= 0) {
    ctx.drawImage(netCanvas, 0, 0);
    return out;
  }

  const nw = netCanvas.width;
  const nh = netCanvas.height;

  ctx.drawImage(netCanvas, 0, 0, nw, 1, trim.x, 0, nw, bleedPx);
  ctx.drawImage(netCanvas, 0, nh - 1, nw, 1, trim.x, trim.y + nh, nw, bleedPx);
  ctx.drawImage(netCanvas, 0, 0, 1, nh, 0, trim.y, bleedPx, nh);
  ctx.drawImage(netCanvas, nw - 1, 0, 1, nh, trim.x + nw, trim.y, bleedPx, nh);

  const corners: Array<[number, number, number, number]> = [
    [0, 0, bleedPx, bleedPx],
    [trim.x + nw, 0, bleedPx, bleedPx],
    [0, trim.y + nh, bleedPx, bleedPx],
    [trim.x + nw, trim.y + nh, bleedPx, bleedPx],
  ];
  const cornerSamples: Rgb[] = [
    samplePixel(netCanvas, 0, 0),
    samplePixel(netCanvas, nw - 1, 0),
    samplePixel(netCanvas, 0, nh - 1),
    samplePixel(netCanvas, nw - 1, nh - 1),
  ];
  corners.forEach(([x, y, w, h], idx) => {
    const c = cornerSamples[idx]!;
    ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
    ctx.fillRect(x, y, w, h);
  });

  ctx.drawImage(netCanvas, trim.x, trim.y);
  return out;
}

async function normalizeToNetCanvas(
  imageDataUrl: string,
  trimW: number,
  trimH: number,
  fit: PrintArtworkFit = "contain",
): Promise<string> {
  const img = await loadImage(await ensureImageDataUrl(imageDataUrl));
  const netCanvas = document.createElement("canvas");
  netCanvas.width = trimW;
  netCanvas.height = trimH;
  const ctx = netCanvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponibil");
  drawArtworkOnCanvas(ctx, img, trimW, trimH, fit);
  return netCanvas.toDataURL("image/png");
}

/**
 * Adaugă bleed în jurul imaginii AI (zona net), fără a tăia conținutul.
 */
export async function addAlgorithmicBleed(
  imageDataUrl: string,
  layout: PrintLayoutMm,
  onStage?: (message: string) => void,
  options?: AlgorithmicBleedOptions,
): Promise<string> {
  const fit = options?.artworkFit ?? "contain";
  const px = computePrintLayoutPx(layout);
  const resolvedUrl = await ensureImageDataUrl(imageDataUrl);

  if (px.bleedPx <= 0) {
    onStage?.("Normalizez la dimensiunea netă…");
    return normalizeToNetCanvas(resolvedUrl, px.trim.w, px.trim.h, fit);
  }

  onStage?.("Adaug bleed algoritmic (extrapolare fundal, fără tăiere)…");

  const img = await loadImage(resolvedUrl);
  const netCanvas = document.createElement("canvas");
  netCanvas.width = px.trim.w;
  netCanvas.height = px.trim.h;
  const nctx = netCanvas.getContext("2d");
  if (!nctx) throw new Error("Canvas 2D indisponibil");
  drawArtworkOnCanvas(nctx, img, px.trim.w, px.trim.h, fit);

  const trimData = nctx.getImageData(0, 0, px.trim.w, px.trim.h);
  const bg = sampleCornerBg(trimData, px.trim.w, px.trim.h);

  const finalCanvas = composeBleedAroundNet(netCanvas, px, bg);
  onStage?.("Bleed algoritmic adăugat.");
  return finalCanvas.toDataURL("image/png");
}

/** @deprecated Folosește addAlgorithmicBleed */
export const postProcessPrintImage = addAlgorithmicBleed;
