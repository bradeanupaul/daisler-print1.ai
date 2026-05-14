import { 
  Shirt, 
  Smartphone, 
  Box, 
  Monitor, 
  Sparkles, 
  Coffee, 
  GraduationCap, 
  Image as ImageIcon 
} from 'lucide-react';

export enum Unit {
  MM = 'mm',
  CM = 'cm',
  INCH = 'inch'
}

export interface PrintFormat {
  id: string;
  name: string;
  width: number;
  height: number;
  unit: Unit;
  defaultBleed: number;
  defaultSafeMargin: number;
  defaultDPI: number;
  isPaper?: boolean;
}

export const PRINT_FORMATS: PrintFormat[] = [
  { id: 'business-card', name: 'Carte de vizită', width: 90, height: 50, unit: Unit.MM, defaultBleed: 3, defaultSafeMargin: 3, defaultDPI: 300, isPaper: true },
  { id: 'a4', name: 'Flyer A4', width: 210, height: 297, unit: Unit.MM, defaultBleed: 3, defaultSafeMargin: 5, defaultDPI: 300, isPaper: true },
  { id: 'a3', name: 'Poster A3', width: 297, height: 420, unit: Unit.MM, defaultBleed: 3, defaultSafeMargin: 5, defaultDPI: 300, isPaper: true },
  { id: 'a5', name: 'Flyer A5', width: 148, height: 210, unit: Unit.MM, defaultBleed: 3, defaultSafeMargin: 5, defaultDPI: 300, isPaper: true },
  { id: 'banner-100-200', name: 'Banner 100x200cm', width: 1000, height: 2000, unit: Unit.MM, defaultBleed: 5, defaultSafeMargin: 20, defaultDPI: 150, isPaper: false },
  { id: 'mug-wrap', name: 'Wrap cană', width: 200, height: 90, unit: Unit.MM, defaultBleed: 3, defaultSafeMargin: 3, defaultDPI: 300, isPaper: false },
  { id: 'sticker', name: 'Sticker Personalizat', width: 100, height: 100, unit: Unit.MM, defaultBleed: 3, defaultSafeMargin: 3, defaultDPI: 300, isPaper: false },
  { id: 'custom', name: 'Custom', width: 0, height: 0, unit: Unit.MM, defaultBleed: 3, defaultSafeMargin: 3, defaultDPI: 300, isPaper: true },
];

export const IMPOSITION_SHEETS = [
  { id: 'a4', name: 'A4 (210x297mm)', width: 210, height: 297 },
  { id: 'a3', name: 'A3 (297x420mm)', width: 297, height: 420 },
  { id: 'sra3', name: 'SRA3 (320x450mm)', width: 320, height: 450 },
  { id: '330x487', name: 'Xerox (330x487mm)', width: 330, height: 487 },
  { id: '500x700', name: 'B2 (500x700mm)', width: 500, height: 700 },
  { id: 'custom', name: 'Custom Sheet', width: 0, height: 0 },
];

/** AI Upscale: păstrează tot conținutul și outpainting pe margini vs. regândire compoziție. */
export type UpscaleMode = 'extend' | 'recompose';

export interface ProcessingSettings {
  formatId: string;
  customWidth: number | null;
  customHeight: number | null;
  unit: Unit;
  dpi: number | null;
  bleed: number | null;
  safeMargin: number | null;
  addCutLine: boolean;
  cutLineColor: string;
  showGuides: boolean;
  showAIOverlays: boolean;
  simulateCMYK: boolean;
  keepVector: boolean;
  generativeBleed: boolean;
  aiUpscale: boolean;
  autoAIUpscale: boolean;
  autoMaximize: boolean;
  showCropMarks: boolean;
  addSafeZone: boolean;
  impositionRows?: number | null;
  impositionCols?: number | null;
  impositionSpacing?: number | null;
  impositionSheetId?: string;
  customSheetWidth?: number | null;
  customSheetHeight?: number | null;
  pdfPageRange: 'all' | 'current';
  mockupZone?: 'front' | 'back' | 'shoulder_left' | 'shoulder_right';
  upscaleMode?: UpscaleMode;
}

export type MockupType = 'hoodie' | 'tshirt' | 'cap' | 'mug' | 'poster' | 'billboard' | 'box' | 'smartphone' | 'monitor' | 'custom';

export const MOCKUP_TYPES = [
  { id: 'tshirt', label: 'T-Shirt', icon: Shirt },
  { id: 'hoodie', label: 'Hoodie', icon: Shirt },
  { id: 'cap', label: 'Cap', icon: GraduationCap },
  { id: 'mug', label: 'Mug', icon: Coffee },
  { id: 'poster', label: 'Poster', icon: ImageIcon },
  { id: 'billboard', label: 'Billboard', icon: Monitor },
  { id: 'box', label: 'Box', icon: Box },
  { id: 'smartphone', label: 'Smartphone', icon: Smartphone },
  { id: 'monitor', label: 'Monitor', icon: Monitor },
  { id: 'custom', label: 'Prompt magic', icon: Sparkles }
];

export interface HistoryItem {
  id: string;
  fileName: string;
  format: string;
  timestamp: any;
  type: string;
  isApproved?: boolean;
}
