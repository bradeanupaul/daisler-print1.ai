import * as pdfjs from "pdfjs-dist";

export type PdfRenderResult = {
  dataUrl: string;
  width: number;
  height: number;
  numPages: number;
};

/** Scale pdf.js viewport so the long edge maps to ~targetDpi (PDF user space = 72 dpi). */
export function pdfRenderScaleForDpi(targetDpi: number, pageWidthPt: number, pageHeightPt: number): number {
  const base = Math.max(targetDpi / 72, 1);
  const longEdgePt = Math.max(pageWidthPt, pageHeightPt);
  const minScaleForPreview = 2;
  const maxScale = 4;
  return Math.min(maxScale, Math.max(minScaleForPreview, base));
}

export async function renderPdfPageToDataUrl(
  buffer: ArrayBuffer,
  pageNum: number,
  targetDpi = 150,
): Promise<PdfRenderResult> {
  const loadingTask = pdfjs.getDocument(buffer);
  const pdf = await loadingTask.promise;
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
    canvasContext: context,
    viewport,
    intent: "display",
  } as Parameters<typeof page.render>[0]).promise;

  return {
    dataUrl: canvas.toDataURL("image/png"),
    width: viewport.width,
    height: viewport.height,
    numPages: pdf.numPages,
  };
}
