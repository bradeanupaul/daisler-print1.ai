import * as pdfjs from "pdfjs-dist";
import { ensurePdfWorker } from "./pdfWorker";

export type PdfRenderResult = {
  dataUrl: string;
  width: number;
  height: number;
  numPages: number;
};

/** Clone buffer — pdf.js transfers ownership and detaches the original. */
function pdfDataCopy(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer.slice(0));
}

/** Scale pdf.js viewport so the long edge maps to ~targetDpi (PDF user space = 72 dpi). */
export function pdfRenderScaleForDpi(targetDpi: number, pageWidthPt: number, pageHeightPt: number): number {
  const base = Math.max(targetDpi / 72, 1);
  const minScaleForPreview = 2;
  const maxScale = 4;
  return Math.min(maxScale, Math.max(minScaleForPreview, base));
}

export async function getPdfPageCount(buffer: ArrayBuffer): Promise<number> {
  ensurePdfWorker();
  const pdf = await pdfjs.getDocument({ data: pdfDataCopy(buffer) }).promise;
  return pdf.numPages;
}

export async function renderPdfPageToDataUrl(
  buffer: ArrayBuffer,
  pageNum: number,
  targetDpi = 150,
): Promise<PdfRenderResult> {
  ensurePdfWorker();
  const pdf = await pdfjs.getDocument({ data: pdfDataCopy(buffer) }).promise;
  const page = await pdf.getPage(pageNum);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = pdfRenderScaleForDpi(targetDpi, baseViewport.width, baseViewport.height);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas context failed");
  canvas.height = viewport.height;
  canvas.width = viewport.width;

  await page.render({
    canvas,
    canvasContext: context,
    viewport,
    intent: "display",
  }).promise;

  return {
    dataUrl: canvas.toDataURL("image/png"),
    width: viewport.width,
    height: viewport.height,
    numPages: pdf.numPages,
  };
}
