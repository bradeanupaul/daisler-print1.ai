export type PdfPageMeta = {
  widthMm: number;
  heightMm: number;
  widthPx: number;
  heightPx: number;
};

export function createPdfPageMaps() {
  return {
    baseRasters: new Map<number, string>(),
    edits: new Map<number, string>(),
    meta: new Map<number, PdfPageMeta>(),
  };
}

export type PdfPageMaps = ReturnType<typeof createPdfPageMaps>;

export function clearPdfPageMaps(maps: PdfPageMaps): void {
  maps.baseRasters.clear();
  maps.edits.clear();
  maps.meta.clear();
}

export function pdfPageDisplayUrl(maps: PdfPageMaps, pageNum: number): string | null {
  return maps.edits.get(pageNum) ?? maps.baseRasters.get(pageNum) ?? null;
}

export function pdfHasAnyEdits(maps: PdfPageMaps): boolean {
  return maps.edits.size > 0;
}
