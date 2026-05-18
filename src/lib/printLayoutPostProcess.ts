/**
 * Post-proces AI upscale: imaginea modelului → strict în zona NET (linie tăiere),
 * apoi bleed algoritmic doar în afara net-ului, până la marginile fișierului (fără AI).
 */
import { ensureImageDataUrl } from "./imageDataUrl";
import { fillSafeZoneMarginsOnCanvas } from "./printSafeZoneFill";
import { PRINT_FORMATS, type ProcessingSettings } from "../types";

export type PrintArtworkFit = "contain" | "cover";

export type AlgorithmicBleedOptions = {
  /**
   * Umple safe zone cu extrapolare sintetică (rare). Implicit false — safe zone vine din prompt la AI.
   */
  applySafeZoneFill?: boolean;
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

export function mmToPx(mm: number, dpi: number): number {
  return Math.max(1, Math.round((mm / 25.4) * dpi));
}

/** Dimensiuni pixel pentru net (trim) sau total (net + bleed). */
export function getLayoutPixelSize(
  layout: PrintLayoutMm,
  target: "net" | "total",
): { width: number; height: number } {
  const px = computePrintLayoutPx(layout);
  if (target === "net") return { width: px.trim.w, height: px.trim.h };
  return { width: px.totalW, height: px.totalH };
}

/** Plasează imaginea la dimensiunile țintă (contain = tot conținutul în cadru; cover = umple, poate tăia). */
export async function fitImageToLayoutPixels(
  imageDataUrl: string,
  layout: PrintLayoutMm,
  target: "net" | "total",
  fit: PrintArtworkFit = "cover",
): Promise<string> {
  const { width, height } = getLayoutPixelSize(layout, target);
  const img = await loadImage(await ensureImageDataUrl(imageDataUrl));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponibil");
  drawArtworkOnCanvas(ctx, img, width, height, fit);
  return canvas.toDataURL("image/png");
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

/** După upscale: 1:1 dacă modelul returnează exact net-ul; altfel o singură scalare uniformă dacă raportul coincide; cover doar la discrepanță mare. */
function drawAiUpscaleOutputOntoTrim(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  trimW: number,
  trimH: number,
) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, trimW, trimH);
  if (!iw || !ih) return;
  if (iw === trimW && ih === trimH) {
    ctx.drawImage(img, 0, 0);
    return;
  }
  const targetR = trimW / trimH;
  const sourceR = iw / ih;
  const ratioClose = Math.abs(targetR - sourceR) / Math.max(targetR, sourceR, 1e-9) < 0.002;
  if (ratioClose) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, iw, ih, 0, 0, trimW, trimH);
    return;
  }
  drawArtworkOnCanvas(ctx, img, trimW, trimH, "cover");
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

/**
 * Bleed: doar ultimul rând/coloană de pixeli de pe marginea net-ului, întins în banda de bleed.
 * Zona net (artwork) rămâne neschimbată — `drawImage` o copiază pixel-perfect peste extrapolare.
 */
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
    ctx.drawImage(netCanvas, trim.x, trim.y);
    return out;
  }

  const nw = netCanvas.width;
  const nh = netCanvas.height;
  const nctxNet = netCanvas.getContext("2d");
  if (!nctxNet) {
    ctx.drawImage(netCanvas, trim.x, trim.y);
    return out;
  }

  ctx.drawImage(netCanvas, 0, 0, nw, 1, trim.x, 0, nw, bleedPx);
  ctx.drawImage(netCanvas, 0, nh - 1, nw, 1, trim.x, trim.y + nh, nw, bleedPx);
  ctx.drawImage(netCanvas, 0, 0, 1, nh, 0, trim.y, bleedPx, nh);
  ctx.drawImage(netCanvas, nw - 1, 0, 1, nh, trim.x + nw, trim.y, bleedPx, nh);

  function sampleNetPixel(x: number, y: number): Rgb {
    const sx = Math.min(Math.max(0, x), nw - 1);
    const sy = Math.min(Math.max(0, y), nh - 1);
    const d = nctxNet.getImageData(sx, sy, 1, 1).data;
    return [d[0]!, d[1]!, d[2]!];
  }

  const corners: Array<[number, number, number, number, number, number]> = [
    [0, 0, bleedPx, bleedPx, 0, 0],
    [trim.x + nw, 0, bleedPx, bleedPx, nw - 1, 0],
    [0, trim.y + nh, bleedPx, bleedPx, 0, nh - 1],
    [trim.x + nw, trim.y + nh, bleedPx, bleedPx, nw - 1, nh - 1],
  ];
  for (const [dx, dy, w, h, px, py] of corners) {
    const c = sampleNetPixel(px, py);
    ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
    ctx.fillRect(dx, dy, w, h);
  }

  ctx.drawImage(netCanvas, trim.x, trim.y);
  return out;
}

/** Pregătește canvas net (dimensiune trim) + safe zone sintetică. */
export async function prepareNetTrimCanvas(
  imageDataUrl: string,
  layout: PrintLayoutMm,
  onStage?: (message: string) => void,
  options?: Pick<AlgorithmicBleedOptions, "applySafeZoneFill">,
): Promise<string> {
  const px = computePrintLayoutPx(layout);
  const resolvedUrl = await ensureImageDataUrl(imageDataUrl);
  const safePx = mmToPx(layout.safeMarginMm, layout.dpi);
  const shouldFillSafe = options?.applySafeZoneFill === true && safePx > 0;

  const img = await loadImage(resolvedUrl);
  const netCanvas = document.createElement("canvas");
  netCanvas.width = px.trim.w;
  netCanvas.height = px.trim.h;
  const nctx = netCanvas.getContext("2d");
  if (!nctx) throw new Error("Canvas 2D indisponibil");

  onStage?.("Normalizez la dimensiunea netă…");
  drawAiUpscaleOutputOntoTrim(nctx, img, px.trim.w, px.trim.h);

  if (shouldFillSafe) {
    onStage?.("Generez fundal safe zone (extrapolare sintetică din margini)…");
    fillSafeZoneMarginsOnCanvas(netCanvas, safePx);
  }

  return netCanvas.toDataURL("image/png");
}

function addAlgorithmicBleedFromNetUrl(
  netDataUrl: string,
  layout: PrintLayoutMm,
  onStage: ((message: string) => void) | undefined,
): Promise<string> {
  const px = computePrintLayoutPx(layout);
  return loadImage(netDataUrl).then((img) => {
    const netCanvas = document.createElement("canvas");
    netCanvas.width = px.trim.w;
    netCanvas.height = px.trim.h;
    const nctx = netCanvas.getContext("2d");
    if (!nctx) throw new Error("Canvas 2D indisponibil");
    drawAiUpscaleOutputOntoTrim(nctx, img, px.trim.w, px.trim.h);
    const trimData = nctx.getImageData(0, 0, px.trim.w, px.trim.h);
    const bg = sampleCornerBg(trimData, px.trim.w, px.trim.h);
    onStage?.(`Generez bleed (${layout.bleedMm} mm) din marginea net, până la marginile fișierului…`);
    const finalCanvas = composeBleedAroundNet(netCanvas, px, bg);
    return finalCanvas.toDataURL("image/png");
  });
}

/**
 * Post-proces complet: net + safe zone + bleed algoritmic (cod).
 */
export async function addAlgorithmicBleed(
  imageDataUrl: string,
  layout: PrintLayoutMm,
  onStage?: (message: string) => void,
  options?: AlgorithmicBleedOptions,
): Promise<string> {
  const px = computePrintLayoutPx(layout);
  const netUrl = await prepareNetTrimCanvas(imageDataUrl, layout, onStage, options);

  if (px.bleedPx <= 0 || layout.bleedMm <= 0) {
    onStage?.("Fără bleed — folosesc rezultatul la dimensiunea netă…");
    return netUrl;
  }

  /** Fișierul final e deja totalW×totalH — fără al doilea resize (ar strica linia de tăiere). */
  return addAlgorithmicBleedFromNetUrl(netUrl, layout, onStage);
}

/** @deprecated Folosește addAlgorithmicBleed */
export const postProcessPrintImage = addAlgorithmicBleed;
