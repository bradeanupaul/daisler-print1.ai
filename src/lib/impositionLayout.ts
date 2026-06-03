import {
  IMPOSITION_SHEETS,
  PRINT_FORMATS,
  type ImpositionSizeMode,
  type ProcessingSettings,
} from "../types";

export function getImpositionSheetMm(settings: ProcessingSettings): {
  widthMm: number;
  heightMm: number;
  label: string;
} {
  const sheetId = settings.impositionSheetId ?? "a3";
  const preset = IMPOSITION_SHEETS.find((s) => s.id === sheetId);
  if (preset?.id === "custom") {
    const w = settings.customSheetWidth ?? 297;
    const h = settings.customSheetHeight ?? 420;
    return { widthMm: w, heightMm: h, label: `Personalizat (${w}×${h} mm)` };
  }
  if (preset) {
    return { widthMm: preset.width, heightMm: preset.height, label: preset.name };
  }
  return { widthMm: 297, heightMm: 420, label: "A3 (297x420mm)" };
}

export type ImpositionGridPlan = {
  rows: number;
  cols: number;
  total: number;
  sheetWidthMm: number;
  sheetHeightMm: number;
  /** Dimensiune celulă pe coală (mm) — la fit e mai mică decât formatul nativ. */
  itemWidthMm: number;
  itemHeightMm: number;
  nativeItemWidthMm: number;
  nativeItemHeightMm: number;
  spacingMm: number;
  auto: boolean;
  sizeMode: ImpositionSizeMode;
};

function nativeItemSizeMm(settings: ProcessingSettings): { w: number; h: number } {
  const fmt = PRINT_FORMATS.find((f) => f.id === settings.formatId);
  const netW =
    settings.formatId === "custom" ? settings.customWidth || 90 : fmt?.width || 90;
  const netH =
    settings.formatId === "custom" ? settings.customHeight || 50 : fmt?.height || 50;
  const bleed = settings.bleed ?? 0;
  return { w: netW + 2 * bleed, h: netH + 2 * bleed };
}

function parseGridCount(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value < 1) return null;
  return Math.floor(value);
}

/** Calculează dimensiunea unei celule ca să încapă rows×cols pe coală (mod fit). */
export function computeFitCellSizeMm(
  sheetWidthMm: number,
  sheetHeightMm: number,
  rows: number,
  cols: number,
  spacingMm: number,
): { widthMm: number; heightMm: number } | null {
  const safeRows = Math.max(1, rows);
  const safeCols = Math.max(1, cols);
  const cellW = (sheetWidthMm - (safeCols - 1) * spacingMm) / safeCols;
  const cellH = (sheetHeightMm - (safeRows - 1) * spacingMm) / safeRows;
  if (cellW <= 0 || cellH <= 0) return null;
  return { widthMm: cellW, heightMm: cellH };
}

export function computeImpositionGrid(settings: ProcessingSettings): ImpositionGridPlan {
  const { w: nativeW, h: nativeH } = nativeItemSizeMm(settings);
  const sheet = getImpositionSheetMm(settings);
  const spacing = settings.impositionSpacing ?? (settings.bleed ?? 0) * 2;
  const sizeMode: ImpositionSizeMode = settings.impositionSizeMode ?? "actual";

  if (sizeMode === "fit") {
    const rows = parseGridCount(settings.impositionRows);
    const cols = parseGridCount(settings.impositionCols);
    if (rows == null || cols == null) {
      return {
        rows: 0,
        cols: 0,
        total: 0,
        sheetWidthMm: sheet.widthMm,
        sheetHeightMm: sheet.heightMm,
        itemWidthMm: 0,
        itemHeightMm: 0,
        nativeItemWidthMm: nativeW,
        nativeItemHeightMm: nativeH,
        spacingMm: spacing,
        auto: false,
        sizeMode: "fit",
      };
    }
    const cell = computeFitCellSizeMm(sheet.widthMm, sheet.heightMm, rows, cols, spacing);
    if (!cell) {
      return {
        rows: 0,
        cols: 0,
        total: 0,
        sheetWidthMm: sheet.widthMm,
        sheetHeightMm: sheet.heightMm,
        itemWidthMm: 0,
        itemHeightMm: 0,
        nativeItemWidthMm: nativeW,
        nativeItemHeightMm: nativeH,
        spacingMm: spacing,
        auto: false,
        sizeMode: "fit",
      };
    }
    return {
      rows,
      cols,
      total: rows * cols,
      sheetWidthMm: sheet.widthMm,
      sheetHeightMm: sheet.heightMm,
      itemWidthMm: cell.widthMm,
      itemHeightMm: cell.heightMm,
      nativeItemWidthMm: nativeW,
      nativeItemHeightMm: nativeH,
      spacingMm: spacing,
      auto: false,
      sizeMode: "fit",
    };
  }

  const auto = settings.autoMaximize !== false;
  let rows = 0;
  let cols = 0;

  if (auto) {
    const cols1 = Math.floor((sheet.widthMm + spacing) / (nativeW + spacing));
    const rows1 = Math.floor((sheet.heightMm + spacing) / (nativeH + spacing));
    const total1 = cols1 * rows1;

    const cols2 = Math.floor((sheet.widthMm + spacing) / (nativeH + spacing));
    const rows2 = Math.floor((sheet.heightMm + spacing) / (nativeW + spacing));
    const total2 = cols2 * rows2;

    if (total1 >= total2 && total1 > 0) {
      rows = rows1;
      cols = cols1;
    } else if (total2 > total1) {
      rows = rows2;
      cols = cols2;
    }
  } else {
    const manualRows = parseGridCount(settings.impositionRows);
    const manualCols = parseGridCount(settings.impositionCols);
    if (manualRows != null && manualCols != null) {
      rows = manualRows;
      cols = manualCols;
    }
  }

  return {
    rows,
    cols,
    total: rows * cols,
    sheetWidthMm: sheet.widthMm,
    sheetHeightMm: sheet.heightMm,
    itemWidthMm: nativeW,
    itemHeightMm: nativeH,
    nativeItemWidthMm: nativeW,
    nativeItemHeightMm: nativeH,
    spacingMm: spacing,
    auto,
    sizeMode: "actual",
  };
}
