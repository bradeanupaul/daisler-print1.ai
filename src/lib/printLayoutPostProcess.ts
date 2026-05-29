/**
 * Post-proces după AI: imaginea modelului rămâne neschimbată (fără scalare / cover / contain).
 * Se aplică doar bleed algoritmic din ultimul rând/coloană de pixeli de pe margini.
 */
import { ensureImageDataUrl } from "./imageDataUrl";
import { fillSafeZoneMarginsOnCanvas } from "./printSafeZoneFill";
import { pickUpscaleNetCanvasPixels } from "./upscaleCompose";
import { PRINT_FORMATS, type ProcessingSettings } from "../types";

export type PrintArtworkFit = "contain" | "cover";

export type AlgorithmicBleedOptions = {
  /**
   * Umple benzile exterioare (în afara content safe area) cu fundal extrapolat.
   * Implicit true când există safe margin — acoperă conținut plasat greșit de model.
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

/** Dimensiune tipar (mm) care păstrează rezoluția nativă a bitmap-ului la DPI-ul dat. */
export function printSizeMmFromImagePixels(
  widthPx: number,
  heightPx: number,
  dpi: number,
): { widthMm: number; heightMm: number } {
  const safeDpi = dpi > 0 ? dpi : 72;
  const toMm = (px: number) => Math.round(((px / safeDpi) * 25.4) * 10) / 10;
  return {
    widthMm: toMm(Math.max(1, widthPx)),
    heightMm: toMm(Math.max(1, heightPx)),
  };
}

/**
 * Bleed în pixeli proporțional cu bitmap-ul net (nu mm×DPI tipar).
 * Necesar după normalizare la rezoluția AI (1000/1500/2000 pe latura lungă).
 */
export function bleedPxForNetImage(
  netWpx: number,
  netHpx: number,
  layout: PrintLayoutMm,
): number {
  if (layout.bleedMm <= 0 || !netWpx || !netHpx) return 0;
  const pxPerMm = Math.min(
    netWpx / Math.max(layout.netWidthMm, 1e-6),
    netHpx / Math.max(layout.netHeightMm, 1e-6),
  );
  return Math.max(1, Math.round(layout.bleedMm * pxPerMm));
}

/** Dimensiuni pixel pentru net (trim) sau total (net + bleed) după setările de tipar (mm × DPI). */
export function getLayoutPixelSize(
  layout: PrintLayoutMm,
  target: "net" | "total",
): { width: number; height: number } {
  const px = computePrintLayoutPxFromMm(layout);
  if (target === "net") return { width: px.trim.w, height: px.trim.h };
  return { width: px.totalW, height: px.totalH };
}

/** Plasează imaginea la dimensiunile țintă (utilitar separat de fluxul AI). */
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
  const safeMargin =
    settings.addSafeZone === false ? 0 : Math.max(0, settings.safeMargin ?? 3);
  return {
    netWidthMm: netW,
    netHeightMm: netH,
    bleedMm: settings.bleed ?? 3,
    safeMarginMm: safeMargin,
    dpi: settings.dpi ?? 72,
  };
}

function computePrintLayoutPxFromMm(layout: PrintLayoutMm): PrintLayoutPx {
  const bleedPx = mmToPx(layout.bleedMm, layout.dpi);
  const trimW = mmToPx(layout.netWidthMm, layout.dpi);
  const trimH = mmToPx(layout.netHeightMm, layout.dpi);
  return computeBleedLayoutPx(trimW, trimH, bleedPx);
}

/** Layout bleed pentru o zonă net de dimensiuni reale (ex. pixelii returnați de model). */
function computeBleedLayoutPx(netW: number, netH: number, bleedPx: number): PrintLayoutPx {
  const totalW = netW + 2 * bleedPx;
  const totalH = netH + 2 * bleedPx;
  const trim: Rect = { x: bleedPx, y: bleedPx, w: netW, h: netH };
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

/**
 * Pas 2: forțează output-ul modelului la exact targetW×targetH px
 * (72→1000 · 150→1500 · 300→2000 pe latura lungă, apoi raport format).
 */
export async function normalizeImageDataUrlToExactPixels(
  imageDataUrl: string,
  targetW: number,
  targetH: number,
): Promise<string> {
  const resolved = await ensureImageDataUrl(imageDataUrl);
  const img = await loadImage(resolved);
  const nw = img.naturalWidth || img.width;
  const nh = img.naturalHeight || img.height;
  if (!nw || !nh) return resolved;
  if (nw === targetW && nh === targetH) return resolved;

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponibil");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const targetR = targetW / targetH;
  const sourceR = nw / nh;
  const ratioClose =
    Math.abs(targetR - sourceR) / Math.max(targetR, sourceR, 1e-9) < 0.002;

  if (ratioClose) {
    ctx.drawImage(img, 0, 0, nw, nh, 0, 0, targetW, targetH);
  } else {
    const scale = Math.max(targetW / nw, targetH / nh);
    const dw = nw * scale;
    const dh = nh * scale;
    ctx.drawImage(img, (targetW - dw) / 2, (targetH - dh) / 2, dw, dh);
  }

  return canvas.toDataURL("image/png");
}

/** Normalizează la pixelii țintă AI, apoi bleed algoritmic. */
export async function prepareAiWorkspaceImage(
  imageDataUrl: string,
  layout: PrintLayoutMm,
  onStage?: (message: string) => void,
  options?: AlgorithmicBleedOptions,
): Promise<string> {
  const { width: targetW, height: targetH } = pickUpscaleNetCanvasPixels(
    layout.netWidthMm,
    layout.netHeightMm,
    layout.dpi,
  );
  onStage?.(`Normalizez la ${targetW}×${targetH}px (țintă AI pentru ${layout.dpi} DPI)…`);
  const netUrl = await normalizeImageDataUrlToExactPixels(imageDataUrl, targetW, targetH);
  return addAlgorithmicBleed(netUrl, layout, onStage, options);
}

/** Copiază imaginea la rezoluția ei nativă, fără scalare. */
function buildNetCanvasFromImage(img: HTMLImageElement): HTMLCanvasElement {
  const nw = img.naturalWidth || img.width;
  const nh = img.naturalHeight || img.height;
  if (!nw || !nh) throw new Error("Dimensiuni imagine invalide");
  const netCanvas = document.createElement("canvas");
  netCanvas.width = nw;
  netCanvas.height = nh;
  const ctx = netCanvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponibil");
  ctx.drawImage(img, 0, 0);
  return netCanvas;
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

/**
 * Imaginea modelului rămâne la pixelii returnați; opțional bleed algoritmic în jur.
 */
export async function addAlgorithmicBleed(
  imageDataUrl: string,
  layout: PrintLayoutMm,
  onStage?: (message: string) => void,
  options?: AlgorithmicBleedOptions,
): Promise<string> {
  const resolvedUrl = await ensureImageDataUrl(imageDataUrl);
  const img = await loadImage(resolvedUrl);
  const nw = img.naturalWidth || img.width;
  const nh = img.naturalHeight || img.height;
  const bleedPx = bleedPxForNetImage(nw, nh, layout);

  if (bleedPx <= 0 || layout.bleedMm <= 0) {
    onStage?.("Fără bleed — păstrez imaginea AI neschimbată.");
    return resolvedUrl;
  }

  onStage?.("Pregătesc imaginea AI (fără scalare)…");
  const netCanvas = buildNetCanvasFromImage(img);

  const pxPerMm = Math.min(
    nw / Math.max(layout.netWidthMm, 1e-6),
    nh / Math.max(layout.netHeightMm, 1e-6),
  );
  const safePx =
    layout.safeMarginMm > 0 ? Math.max(1, Math.round(layout.safeMarginMm * pxPerMm)) : 0;
  const shouldFillSafe =
    options?.applySafeZoneFill !== false && safePx > 0;
  if (shouldFillSafe) {
    onStage?.("Generez fundal safe zone (extrapolare sintetică din margini)…");
    fillSafeZoneMarginsOnCanvas(netCanvas, safePx);
  }

  const bleedLayout = computeBleedLayoutPx(nw, nh, bleedPx);
  const trimData = netCanvas.getContext("2d")!.getImageData(0, 0, nw, nh);
  const bg = sampleCornerBg(trimData, nw, nh);
  onStage?.(`Generez bleed (${layout.bleedMm} mm ≈ ${bleedPx}px/latură) din marginea imaginii…`);
  const finalCanvas = composeBleedAroundNet(netCanvas, bleedLayout, bg);
  return finalCanvas.toDataURL("image/png");
}

/**
 * Export / PDF: mărește uniform doar dacă imaginea e sub pixelii tipar (mm × DPI).
 * Nu micșorează output-ul AI dacă e deja mai mare decât ținta.
 */
export async function upscaleDataUrlToPrintPixels(
  imageDataUrl: string,
  layout: PrintLayoutMm,
  target: "net" | "total" = "total",
  onStage?: (message: string) => void,
): Promise<string> {
  const { width: targetW, height: targetH } = getLayoutPixelSize(layout, target);
  const resolved = await ensureImageDataUrl(imageDataUrl);
  const img = await loadImage(resolved);
  const nw = img.naturalWidth || img.width;
  const nh = img.naturalHeight || img.height;
  if (!nw || !nh) return resolved;

  if (nw >= targetW && nh >= targetH) {
    return resolved;
  }

  onStage?.(`Export la ${targetW}×${targetH}px (${layout.dpi} DPI)…`);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponibil");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const scale = Math.max(targetW / nw, targetH / nh);
  const dw = nw * scale;
  const dh = nh * scale;
  const dx = (targetW - dw) / 2;
  const dy = (targetH - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
  return canvas.toDataURL("image/png");
}

/** DPI efectiv al bitmap-ului față de zona net (mm). */
export function computeEffectiveDpiForImage(
  imgWidthPx: number,
  imgHeightPx: number,
  layout: PrintLayoutMm,
): number {
  if (!layout.netWidthMm || !layout.netHeightMm) return 0;
  const totalWmm = layout.netWidthMm + 2 * layout.bleedMm;
  const totalHmm = layout.netHeightMm + 2 * layout.bleedMm;
  const netWpx = imgWidthPx * (layout.netWidthMm / Math.max(totalWmm, 1e-6));
  const netHpx = imgHeightPx * (layout.netHeightMm / Math.max(totalHmm, 1e-6));
  return Math.min(
    netWpx / (layout.netWidthMm / 25.4),
    netHpx / (layout.netHeightMm / 25.4),
  );
}

/** @deprecated Folosește addAlgorithmicBleed */
export const postProcessPrintImage = addAlgorithmicBleed;
