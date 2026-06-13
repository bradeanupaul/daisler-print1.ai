import * as pdfjs from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

let configured = false;

export function ensurePdfWorker(): void {
  if (configured) return;
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  configured = true;
}

export function isPdfFile(file: Pick<File, "type" | "name">): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}
