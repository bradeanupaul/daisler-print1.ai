import type { ProcessingSettings } from "../../types";
import { Unit } from "../../types";

export const DEFAULT_PRINT_SETTINGS: ProcessingSettings = {
  formatId: "business-card",
  customWidth: 90,
  customHeight: 50,
  unit: Unit.MM,
  bleed: 3,
  safeMargin: 3,
  dpi: 72,
  addCutLine: true,
  addSafeZone: true,
  cutLineColor: "#ff00ff",
  showGuides: true,
  showBleedGuide: true,
  showSafeGuide: true,
  showAIOverlays: false,
  simulateCMYK: false,
  keepVector: true,
  generativeBleed: false,
  aiUpscale: false,
  autoAIUpscale: false,
  autoMaximize: true,
  showCropMarks: false,
  pdfPageRange: "all",
  upscaleMode: "recompose",
};
