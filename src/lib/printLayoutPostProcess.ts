/**
 * Post-proces după AI: imaginea modelului rămâne neschimbată (fără scalare / cover / contain).
 * Se aplică doar bleed algoritmic din ultimul rând/coloană de pixeli de pe margini.
 */
import { ensureImageDataUrl } from "./imageDataUrl";
import { drawInputSafeZoneGuide, pickUpscaleNetCanvasPixels } from "./upscaleCompose";
import { PRINT_FORMATS, type ProcessingSettings } from "../types";

export type PrintArtworkFit = "contain" | "cover";

export type AlgorithmicBleedOptions = {
  /** @deprecated Bleed-ul folosește întotdeauna marginea bitmap-ului, nu safe zone. */
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

function layoutPixelTolerance(px: number): number {
  return Math.max(4, Math.round(px * 0.02));
}

/** Pixelii canvas AI pentru bleed (total + zona net interioară). */
export function getAiBleedCanvasPixels(layout: PrintLayoutMm): {
  totalW: number;
  totalH: number;
  innerW: number;
  innerH: number;
  bleedPxX: number;
  bleedPxY: number;
} {
  const totalWmm = layout.netWidthMm + 2 * layout.bleedMm;
  const totalHmm = layout.netHeightMm + 2 * layout.bleedMm;
  const { width: totalW, height: totalH } = pickUpscaleNetCanvasPixels(
    totalWmm,
    totalHmm,
    layout.dpi,
  );
  const bleedPxX = Math.max(
    1,
    Math.round(totalW * (layout.bleedMm / Math.max(totalWmm, 1e-6))),
  );
  const bleedPxY = Math.max(
    1,
    Math.round(totalH * (layout.bleedMm / Math.max(totalHmm, 1e-6))),
  );
  return {
    totalW,
    totalH,
    innerW: Math.max(1, totalW - 2 * bleedPxX),
    innerH: Math.max(1, totalH - 2 * bleedPxY),
    bleedPxX,
    bleedPxY,
  };
}

/** Sursa are deja benzi de bleed la pixelii total (net + 2×bleed). */
export function artworkIncludesBleedMargins(
  widthPx: number,
  heightPx: number,
  layout: PrintLayoutMm,
): boolean {
  const printTotalPx = getLayoutPixelSize(layout, "total");
  const aiTotalPx = getAiBleedCanvasPixels(layout);
  const netPx = getLayoutPixelSize(layout, "net");
  const tol = layoutPixelTolerance(Math.min(widthPx, heightPx));
  const matchesPrintTotal =
    Math.abs(widthPx - printTotalPx.width) <= tol &&
    Math.abs(heightPx - printTotalPx.height) <= tol;
  const matchesAiTotal =
    Math.abs(widthPx - aiTotalPx.totalW) <= tol &&
    Math.abs(heightPx - aiTotalPx.totalH) <= tol;
  const matchesNet =
    Math.abs(widthPx - netPx.width) <= tol &&
    Math.abs(heightPx - netPx.height) <= tol;
  const matchesAiInner =
    Math.abs(widthPx - aiTotalPx.innerW) <= tol &&
    Math.abs(heightPx - aiTotalPx.innerH) <= tol;
  return (matchesPrintTotal || matchesAiTotal) && !matchesNet && !matchesAiInner;
}

/**
 * Pregătește arta pentru bleed: doar zona net, fără margini albe de preview.
 * Dacă bitmap-ul e deja total (cu bleed), extrage trim-ul; altfel umple net cu cover.
 */
export async function normalizeNetArtworkForBleed(
  imageDataUrl: string,
  layout: PrintLayoutMm,
  onStage?: (message: string) => void,
): Promise<string> {
  const resolved = await ensureImageDataUrl(imageDataUrl);
  const img = await loadImage(resolved);
  const nw = img.naturalWidth || img.width;
  const nh = img.naturalHeight || img.height;
  if (!nw || !nh) return resolved;

  const netPx = getLayoutPixelSize(layout, "net");
  const tol = layoutPixelTolerance(Math.min(nw, nh));
  const matchesNet =
    Math.abs(nw - netPx.width) <= tol && Math.abs(nh - netPx.height) <= tol;

  if (matchesNet) {
    onStage?.("Artă net — folosesc bitmap-ul fără margini de preview.");
    return resolved;
  }

  if (artworkIncludesBleedMargins(nw, nh, layout) && layout.bleedMm > 0) {
    onStage?.("Extrag zona net (fără bleed de preview)…");
    const bleedPx = mmToPx(layout.bleedMm, layout.dpi);
    const canvas = document.createElement("canvas");
    canvas.width = netPx.width;
    canvas.height = netPx.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return resolved;
    ctx.drawImage(
      img,
      bleedPx,
      bleedPx,
      netPx.width,
      netPx.height,
      0,
      0,
      netPx.width,
      netPx.height,
    );
    return canvas.toDataURL("image/png");
  }

  onStage?.(`Normalizez arta la ${netPx.width}×${netPx.height}px (cover, fără letterbox)…`);
  return normalizeImageDataUrlToExactPixels(resolved, netPx.width, netPx.height);
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

/** Scale cover la dimensiune exactă — fără fundal alb / letterbox. */
export async function normalizeImageCoverToExactPixels(
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
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const scale = Math.max(targetW / nw, targetH / nh);
  const dw = nw * scale;
  const dh = nh * scale;
  ctx.drawImage(img, (targetW - dw) / 2, (targetH - dh) / 2, dw, dh);
  return canvas.toDataURL("image/png");
}

/** Artă net la pixelii interiori AI (înainte de extindere). */
export async function prepareNetArtworkForAiBleedInner(
  netArtworkDataUrl: string,
  layout: PrintLayoutMm,
): Promise<string> {
  const { innerW, innerH } = getAiBleedCanvasPixels(layout);
  return normalizeImageCoverToExactPixels(
    await ensureImageDataUrl(netArtworkDataUrl),
    innerW,
    innerH,
  );
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
  return addAlgorithmicBleed(netUrl, layout, onStage, {
    ...options,
    applySafeZoneFill: false,
  });
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

/**
 * Bleed rapid: fiecare pixel de pe margine e prelungit perpendicular (fără interpolare / blur).
 */
function composeBleedAroundNet(
  netCanvas: HTMLCanvasElement,
  layout: PrintLayoutPx,
): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = layout.totalW;
  out.height = layout.totalH;
  const ctx = out.getContext("2d");
  if (!ctx) return out;

  const { trim, bleedPx: bp } = layout;
  const nw = netCanvas.width;
  const nh = netCanvas.height;

  if (bp <= 0) {
    ctx.drawImage(netCanvas, trim.x, trim.y);
    return out;
  }

  const srcCtx = netCanvas.getContext("2d");
  if (!srcCtx) {
    ctx.drawImage(netCanvas, trim.x, trim.y);
    return out;
  }

  const src = srcCtx.getImageData(0, 0, nw, nh).data;
  const image = ctx.createImageData(out.width, out.height);
  const dst = image.data;
  const outW = out.width;

  const put = (ox: number, oy: number, sx: number, sy: number) => {
    const si = (sy * nw + sx) * 4;
    const oi = (oy * outW + ox) * 4;
    dst[oi] = src[si]!;
    dst[oi + 1] = src[si + 1]!;
    dst[oi + 2] = src[si + 2]!;
    dst[oi + 3] = src[si + 3]!;
  };

  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      put(x + bp, y + bp, x, y);
    }
  }

  for (let y = 0; y < bp; y++) {
    for (let x = 0; x < nw; x++) {
      put(x + bp, y, x, 0);
    }
  }

  for (let y = 0; y < bp; y++) {
    for (let x = 0; x < nw; x++) {
      put(x + bp, nh + bp + y, x, nh - 1);
    }
  }

  for (let x = 0; x < bp; x++) {
    for (let y = 0; y < nh; y++) {
      put(x, y + bp, 0, y);
    }
  }

  for (let x = 0; x < bp; x++) {
    for (let y = 0; y < nh; y++) {
      put(nw + bp + x, y + bp, nw - 1, y);
    }
  }

  for (let y = 0; y < bp; y++) {
    for (let x = 0; x < bp; x++) {
      put(x, y, 0, 0);
      put(nw + bp + x, y, nw - 1, 0);
      put(x, nh + bp + y, 0, nh - 1);
      put(nw + bp + x, nh + bp + y, nw - 1, nh - 1);
    }
  }

  ctx.putImageData(image, 0, 0);
  return out;
}

/**
 * Input Bleed AI: artă net centrată + benzile exterioare goale (fără bleed rapid/oglindire).
 * Modelul completează spațiul liber cu continuare naturală a imaginii.
 */
export async function composeBleedAiInputCanvas(
  sourceDataUrl: string,
  canvasW: number,
  canvasH: number,
  netWmm: number,
  netHmm: number,
  bleedMm: number,
  opts?: { safeMarginMm?: number },
): Promise<{ dataUrl: string }> {
  const resolved = await ensureImageDataUrl(sourceDataUrl);
  const img = await loadImage(resolved);
  const nw = img.naturalWidth || img.width;
  const nh = img.naturalHeight || img.height;
  if (!nw || !nh) throw new Error("Dimensiuni imagine invalide");

  const totalWmm = netWmm + 2 * bleedMm;
  const totalHmm = netHmm + 2 * bleedMm;
  const bleedPxX = Math.max(1, Math.round(canvasW * (bleedMm / Math.max(totalWmm, 1e-6))));
  const bleedPxY = Math.max(1, Math.round(canvasH * (bleedMm / Math.max(totalHmm, 1e-6))));
  const innerW = Math.max(1, canvasW - 2 * bleedPxX);
  const innerH = Math.max(1, canvasH - 2 * bleedPxY);

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponibil");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasW, canvasH);

  const scale = Math.max(innerW / nw, innerH / nh);
  const dw = nw * scale;
  const dh = nh * scale;
  const dx = bleedPxX + (innerW - dw) / 2;
  const dy = bleedPxY + (innerH - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);

  const safe = opts?.safeMarginMm ?? 0;
  if (safe > 0) {
    drawInputSafeZoneGuide(ctx, canvasW, canvasH, safe, netWmm, netHmm);
  }

  return { dataUrl: canvas.toDataURL("image/png") };
}

function smoothstep01(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/**
 * După Bleed AI: margini din output-ul modelului; centru din arta net, cu blend la linia trim
 * (fără chenar dur între textura AI și original).
 */
export async function sealNetArtworkOnBleedOutput(
  aiBleedDataUrl: string,
  netArtworkDataUrl: string,
  layout: PrintLayoutMm,
  targetW?: number,
  targetH?: number,
): Promise<string> {
  const aiCanvas = getAiBleedCanvasPixels(layout);
  const outW = targetW ?? aiCanvas.totalW;
  const outH = targetH ?? aiCanvas.totalH;
  const scaleX = outW / aiCanvas.totalW;
  const scaleY = outH / aiCanvas.totalH;
  const bleedPxX = Math.round(aiCanvas.bleedPxX * scaleX);
  const bleedPxY = Math.round(aiCanvas.bleedPxY * scaleY);
  const innerW = Math.max(1, outW - 2 * bleedPxX);
  const innerH = Math.max(1, outH - 2 * bleedPxY);
  const featherX = Math.max(2, Math.min(Math.round(bleedPxX * 0.4), 20));
  const featherY = Math.max(2, Math.min(Math.round(bleedPxY * 0.4), 20));

  const aiResolved = await ensureImageDataUrl(aiBleedDataUrl);
  const aiNormalized = await normalizeImageCoverToExactPixels(aiResolved, outW, outH);
  const imgAi = await loadImage(aiNormalized);

  const netNormalized = await prepareNetArtworkForAiBleedInner(netArtworkDataUrl, layout);
  const imgNet = await loadImage(netNormalized);

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return aiNormalized;

  ctx.drawImage(imgAi, 0, 0, outW, outH);
  const aiData = ctx.getImageData(0, 0, outW, outH);

  const netLayer = document.createElement("canvas");
  netLayer.width = outW;
  netLayer.height = outH;
  const netCtx = netLayer.getContext("2d");
  if (!netCtx) return aiNormalized;
  netCtx.drawImage(imgNet, bleedPxX, bleedPxY, innerW, innerH);
  const netData = netCtx.getImageData(0, 0, outW, outH);

  const out = ctx.createImageData(outW, outH);
  const innerL = bleedPxX;
  const innerT = bleedPxY;
  const innerR = bleedPxX + innerW;
  const innerB = bleedPxY + innerH;

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const i = (y * outW + x) * 4;
      const inNet =
        x >= innerL && x < innerR && y >= innerT && y < innerB;

      if (!inNet) {
        out.data[i] = aiData.data[i]!;
        out.data[i + 1] = aiData.data[i + 1]!;
        out.data[i + 2] = aiData.data[i + 2]!;
        out.data[i + 3] = aiData.data[i + 3]!;
        continue;
      }

      const distIn = Math.min(
        x - innerL,
        y - innerT,
        innerR - 1 - x,
        innerB - 1 - y,
      );
      const fx = x < innerL + featherX || x >= innerR - featherX ? featherX : featherX * 2;
      const fy = y < innerT + featherY || y >= innerB - featherY ? featherY : featherY * 2;
      const feather = Math.min(fx, fy);
      const w = distIn >= feather ? 1 : smoothstep01(distIn / feather);

      out.data[i] = Math.round(netData.data[i]! * w + aiData.data[i]! * (1 - w));
      out.data[i + 1] = Math.round(netData.data[i + 1]! * w + aiData.data[i + 1]! * (1 - w));
      out.data[i + 2] = Math.round(netData.data[i + 2]! * w + aiData.data[i + 2]! * (1 - w));
      out.data[i + 3] = 255;
    }
  }

  ctx.putImageData(out, 0, 0);
  return canvas.toDataURL("image/png");
}

/**
 * Imaginea modelului rămâne la pixelii returnați; bleed algoritmic în jur, extrapolat din marginea bitmap-ului.
 */
export async function addAlgorithmicBleed(
  imageDataUrl: string,
  layout: PrintLayoutMm,
  onStage?: (message: string) => void,
  _options?: AlgorithmicBleedOptions,
): Promise<string> {
  const netArtworkUrl = await normalizeNetArtworkForBleed(imageDataUrl, layout, onStage);
  const resolvedUrl = await ensureImageDataUrl(netArtworkUrl);
  const img = await loadImage(resolvedUrl);
  const nw = img.naturalWidth || img.width;
  const nh = img.naturalHeight || img.height;
  const bleedPx = bleedPxForNetImage(nw, nh, layout);

  if (bleedPx <= 0 || layout.bleedMm <= 0) {
    onStage?.("Fără bleed — păstrez imaginea AI neschimbată.");
    return resolvedUrl;
  }

  onStage?.("Pregătesc imaginea (fără scalare)…");
  const netCanvas = buildNetCanvasFromImage(img);

  const bleedLayout = computeBleedLayoutPx(nw, nh, bleedPx);
  onStage?.(
    `Generez bleed (${layout.bleedMm} mm ≈ ${bleedPx}px/latură) — prelungire pixel cu pixel…`,
  );
  const finalCanvas = composeBleedAroundNet(netCanvas, bleedLayout);
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
