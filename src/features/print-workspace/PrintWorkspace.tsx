import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Upload, 
  FileText, 
  Settings, 
  Download, 
  Eye, 
  LayoutGrid, 
  Sparkles, 
  ChevronRight, 
  ChevronLeft,
  ChevronDown,
  Mic, 
  RefreshCw, 
  Scissors as ScissorsIcon,
  CheckCircle2, 
  AlertCircle,
  Palette,
  Printer,
  History,
  Send,
  Shirt,
  Smartphone,
  Monitor,
  Box,
  Key,
  Crop as CropIcon,
  Maximize2,
  ArrowUpCircle,
  Layers,
  Zap,
  Check,
  X,
  Search,
  LogOut,
  Loader2,
  Image as ImageIcon,
  PanelLeft,
  PanelRight,
  Trash2,
  Bot,
  Cpu,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import * as pdfjs from 'pdfjs-dist';
import ImageTracer from 'imagetracerjs';
import { 
  auth, 
  db, 
  signInWithGoogle, 
  logOut, 
  handleFirestoreError, 
  OperationType 
} from '../../firebase';
import { User as FirebaseUser } from 'firebase/auth';
import { collection, serverTimestamp, addDoc } from 'firebase/firestore';
import { cn } from '../../lib/utils';
import { hasAnyAiKeyConfigured } from '../../lib/aiKeys';
import { 
  PRINT_FORMATS, 
  MOCKUP_TYPES, 
  IMPOSITION_SHEETS,
  ProcessingSettings, 
  MockupType,
  HistoryItem,
  UpscaleMode,
  FileHistoryGroup,
  FileHistoryAsset,
} from '../../types';
import {
  createSessionGroup,
  getAssetDownloadUrl,
  registerBlobExport,
  registerProcessedImageFromUrl,
  registerUpload,
} from '../../services/fileHistory';
import { isSupabaseConfigured } from '../../lib/supabase/client';
import { FileHistoryDrawer } from '../../components/FileHistoryDrawer';
import { 
  generateImpositionPDF,
  generatePrintPDF 
} from '../../services/pdf';
import { 
  processAgentMessage, 
  analyzePrintQuality, 
  upscaleImage,
  generateSpeech,
  refineGeminiImageFromPrompt,
  type UpscaleGenerationResult,
} from '../../services/gemini';
import * as openaiPrint from '../../services/openaiPrint';
import { MockupViewer } from '../../components/MockupViewer';
import { AiSettingsModal } from '../../components/AiSettingsModal';
import { AiDualCompareDialog } from '../../components/AiDualCompareDialog';
import { ProcessingOverlay } from '../../components/ProcessingOverlay';
import { AiErrorBanner } from '../../components/AiErrorBanner';
import { useProcessingProgress } from '../../hooks/useProcessingProgress';
import { serializeAiUsage, type AiUsageSummary } from '../../lib/aiUsage';
import { formatAiApiError } from '../../lib/apiErrorMessage';
import { reportAiError } from '../../lib/reportAiError';
import { aiError, aiLog } from '../../lib/aiUpscaleLog';
import { ensureImageDataUrl } from '../../lib/imageDataUrl';
import {
  addAlgorithmicBleed,
  getPrintLayoutFromSettings,
} from '../../lib/printLayoutPostProcess';
import { DEFAULT_PRINT_SETTINGS } from './defaultPrintSettings';

const DROPDOWN_PANEL = {
  initial: { opacity: 0, y: -10, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -6, scale: 0.98 },
  transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const },
};

// --- Main App ---
export type PrintWorkspaceProps = {
  user: FirebaseUser;
  history: HistoryItem[];
  groupedHistory: FileHistoryGroup[];
  onHistoryRefresh: () => void;
};

export function PrintWorkspace({ user, history, groupedHistory, onHistoryRefresh }: PrintWorkspaceProps) {
  // Set up PDF.js worker
  useEffect(() => {
    if (pdfjs.version) {
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
    }
  }, []);
  const [file, setFile] = useState<File | null>(null);
  const [originalBuffer, setOriginalBuffer] = useState<ArrayBuffer | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [originalDimensions, setOriginalDimensions] = useState<{ width: number, height: number } | null>(null);
  const [isUpscaleNeeded, setIsUpscaleNeeded] = useState(false);
  const processing = useProcessingProgress();
  const isProcessing = processing.isActive;
  const [workspaceAiError, setWorkspaceAiError] = useState<string | null>(null);

  const showWorkspaceAiError = useCallback(
    (err: unknown, opts?: { title?: string }) => {
      const msg = reportAiError(err, opts);
      setWorkspaceAiError(msg);
      processing.fail(msg);
      return msg;
    },
    [processing],
  );

  const clearWorkspaceAiError = useCallback(() => {
    setWorkspaceAiError(null);
    processing.dismissError();
  }, [processing]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  const [tracedSvg, setTracedSvg] = useState<string | null>(null);
  const [showMockup, setShowMockup] = useState(false);
  const [mockupType, setMockupType] = useState<MockupType>('hoodie');
  const [showHistory, setShowHistory] = useState(false);
  const [rightToolsOpen, setRightToolsOpen] = useState(true);
  const [rightToolsTab, setRightToolsTab] = useState<"agent" | "quality">("agent");
  const [hasKey, setHasKey] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [historyLoadingAssetId, setHistoryLoadingAssetId] = useState<string | null>(null);
  const [historySelectedAssetId, setHistorySelectedAssetId] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [mockupMenuOpen, setMockupMenuOpen] = useState(false);
  const mockupMenuRef = useRef<HTMLDivElement>(null);
  const [formatPickerOpen, setFormatPickerOpen] = useState(false);
  const formatPickerRef = useRef<HTMLDivElement>(null);
  const [sheetPickerOpen, setSheetPickerOpen] = useState(false);
  const sheetPickerRef = useRef<HTMLDivElement>(null);
  const [showAiSettings, setShowAiSettings] = useState(false);
  type WorkspaceImageDualFlow = "upscale" | "generative_fill";
  const [dualImagePicker, setDualImagePicker] = useState<{
    flow: WorkspaceImageDualFlow;
    dual: Extract<UpscaleGenerationResult, { kind: "dual" }>;
  } | null>(null);
  const [aiUpscaleMenuOpen, setAiUpscaleMenuOpen] = useState(false);
  const aiUpscaleMenuRef = useRef<HTMLDivElement>(null);

  const [settings, setSettings] = useState<ProcessingSettings>({
    ...DEFAULT_PRINT_SETTINGS,
  });
  const [canvasRevision, setCanvasRevision] = useState(0);
  const canvasDisplayUrl = processedUrl || previewUrl;

  const imgRef = useRef<HTMLImageElement>(null);
  const agentInputRef = useRef<HTMLInputElement>(null);
  const activeHistoryGroupIdRef = useRef<string | null>(null);
  const lastAiGenerationUsageRef = useRef<AiUsageSummary | null>(null);
  // API Key Check (Gemini din .env / storage sau OpenAI)
  useEffect(() => {
    setHasKey(hasAnyAiKeyConfigured());
  }, []);

  useEffect(() => {
    if (!exportMenuOpen && !mockupMenuOpen && !formatPickerOpen && !sheetPickerOpen && !aiUpscaleMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (exportMenuRef.current && !exportMenuRef.current.contains(t)) setExportMenuOpen(false);
      if (mockupMenuRef.current && !mockupMenuRef.current.contains(t)) setMockupMenuOpen(false);
      if (formatPickerRef.current && !formatPickerRef.current.contains(t)) setFormatPickerOpen(false);
      if (sheetPickerRef.current && !sheetPickerRef.current.contains(t)) setSheetPickerOpen(false);
      if (aiUpscaleMenuRef.current && !aiUpscaleMenuRef.current.contains(t)) setAiUpscaleMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [exportMenuOpen, mockupMenuOpen, formatPickerOpen, sheetPickerOpen, aiUpscaleMenuOpen]);
  const handleSelectKey = () => {
    const key = prompt(
      "Introdu cheia API:\n- OpenAI (începe cu sk-…, ex. sk-proj-…)\n- sau Google Gemini (începe cu AIza…)"
    );
    if (!key?.trim()) return;
    const trimmed = key.trim();
    if (trimmed.startsWith("sk-ant")) {
      toast.error("Cheile Anthropic nu sunt folosite în această aplicație. Folosește OpenAI sau Gemini.");
      return;
    }
    if (trimmed.startsWith("AIza")) {
      localStorage.setItem("gemini_api_key", trimmed);
    } else if (trimmed.startsWith("sk-")) {
      localStorage.setItem("openai_api_key", trimmed);
    } else {
      localStorage.setItem("gemini_api_key", trimmed);
    }
    setHasKey(hasAnyAiKeyConfigured());
    toast.success("Cheie API salvată. Repornește dev serverul dacă folosești doar .env.local.");
  };

  const renderPDFPage = useCallback(async (buffer: ArrayBuffer, pageNum: number) => {
    try {
      const loadingTask = pdfjs.getDocument(buffer);
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better preview
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      await page.render({ 
        canvasContext: context!, 
        viewport,
        intent: 'display'
      } as any).promise;
      
      const dataUrl = canvas.toDataURL('image/png');
      setPreviewUrl(dataUrl);
      setProcessedUrl(dataUrl);
      
      // Auto trigger analysis for the rendered page
      handleAIAnalysis(dataUrl);
      
      return pdf.numPages;
    } catch (err) {
      console.error("Error rendering PDF page:", err);
      toast.error("Failed to render PDF page");
      return 0;
    }
  }, []);

  useEffect(() => {
    if (file?.type === 'application/pdf' && originalBuffer) {
      renderPDFPage(originalBuffer, currentPage);
    }
  }, [currentPage, originalBuffer, file?.type, renderPDFPage]);

  // Helper to rasterize SVG/Image to high-res PNG
  const rasterizeToPNG = useCallback((dataUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement('canvas');
        // If SVG has no size, default to something reasonable
        const baseW = img.naturalWidth || img.width || 1000;
        const baseH = img.naturalHeight || img.height || 1000;
        
        // Target high-res for AI analysis (around 1500-2000px)
        const scale = Math.max(1, 2000 / Math.max(baseW, baseH));
        canvas.width = baseW * scale;
        canvas.height = baseH * scale;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error("Canvas context failed"));
        
        ctx.fillStyle = 'white'; 
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png', 0.9));
      };
      img.onerror = () => reject(new Error("Failed to load image for rasterization"));
      img.src = dataUrl;
    });
  }, []);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const uploadedFile = acceptedFiles[0];
    if (uploadedFile) {
      setFile(uploadedFile);
      setCurrentPage(1);
      const buffer = await uploadedFile.arrayBuffer();
      setOriginalBuffer(buffer);
      
      // Create preview
      if (uploadedFile.type.includes('image') || uploadedFile.name.toLowerCase().endsWith('.svg')) {
        setTotalPages(0);
        const reader = new FileReader();
        reader.onload = async (e) => {
          let url = e.target?.result as string;
          
          // If it's an SVG, rasterize it for preview and AI services
          if (uploadedFile.type.includes('svg') || uploadedFile.name.toLowerCase().endsWith('.svg')) {
            try {
              url = await rasterizeToPNG(url);
            } catch (err) {
              console.error("SVG Rasterization failed, using raw URL:", err);
            }
          }

          setPreviewUrl(url);
          setProcessedUrl(url);
          
          const img = new Image();
          img.onload = () => {
            setOriginalDimensions({ width: img.width, height: img.height });
            // Auto trigger analysis
            handleAIAnalysis(url);
            // Check if upscale is needed
            const currentFormat = PRINT_FORMATS.find(f => f.id === settings.formatId);
            const targetW = settings.formatId === 'custom' ? (settings.customWidth || 90) : currentFormat?.width || 90;
            const targetH = settings.formatId === 'custom' ? (settings.customHeight || 50) : currentFormat?.height || 50;
            const targetDpi = settings.dpi || 300;
            
            const effectiveDpi = Math.min(
              img.width / (targetW / 25.4),
              img.height / (targetH / 25.4)
            );
            
            if (effectiveDpi < targetDpi * 0.9) { // 10% tolerance
              setIsUpscaleNeeded(true);
              if (settings.autoAIUpscale) {
                handleUpscale();
              } else {
                toast.info(`Rezoluție scăzută detectată (${Math.round(effectiveDpi)} DPI). AI Upscale recomandat.`);
              }
            }
          };
          img.src = url;
        };
        reader.readAsDataURL(uploadedFile);
      } else if (uploadedFile.type === 'application/pdf') {
        const pages = await renderPDFPage(buffer, 1);
        setTotalPages(pages);
      }
      
      toast.success(`File "${uploadedFile.name}" uploaded successfully`);

      if (user && isSupabaseConfigured()) {
        try {
          const { groupId } = await registerUpload(user.uid, uploadedFile, settings.formatId);
          activeHistoryGroupIdRef.current = groupId;
          onHistoryRefresh();
        } catch (err) {
          console.warn("registerUpload:", err);
          toast.error(
            err instanceof Error ? err.message : "Nu s-a putut salva în istoric. Încearcă sign out + sign in.",
          );
        }
      }
    }
  }, [renderPDFPage, user, settings.formatId, onHistoryRefresh]);

  const revokeObjectUrl = (url: string | null | undefined) => {
    if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
  };

  const clearWorkspaceFile = useCallback(() => {
    setFile(null);
    setOriginalBuffer(null);
    setPreviewUrl((prev) => {
      revokeObjectUrl(prev);
      return null;
    });
    setProcessedUrl((prev) => {
      revokeObjectUrl(prev);
      return null;
    });
    setOriginalDimensions(null);
    setTotalPages(0);
    setCurrentPage(1);
    setAnalysis(null);
    setTracedSvg(null);
    setIsUpscaleNeeded(false);
    processing.stop();
    setIsAnalyzing(false);
    activeHistoryGroupIdRef.current = null;
    setHistorySelectedAssetId(null);
  }, []);

  const ensureHistoryGroup = useCallback(async (): Promise<string | null> => {
    if (!user || !isSupabaseConfigured()) return null;
    if (activeHistoryGroupIdRef.current) return activeHistoryGroupIdRef.current;
    if (!file) return null;
    const groupId = await createSessionGroup(user.uid, file.name, settings.formatId);
    activeHistoryGroupIdRef.current = groupId;
    return groupId;
  }, [user, file, settings.formatId]);

  const persistProcessedToHistory = useCallback(
    async (
      imageUrl: string,
      sourceKind: "upscale" | "generative_fill" | "processed_preview",
      suffix: string,
      metadata?: Record<string, unknown>,
    ) => {
      if (!user || !isSupabaseConfigured()) return;
      try {
        const groupId = await ensureHistoryGroup();
        if (!groupId) return;
        const base = (file?.name || "document").replace(/\.[^/.]+$/, "");
        const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
        const fileName = `${base}_${suffix}_${stamp}.png`;
        const aiUsage = lastAiGenerationUsageRef.current;
        await registerProcessedImageFromUrl(
          user.uid,
          groupId,
          imageUrl,
          sourceKind,
          fileName,
          settings.formatId,
          {
            ...metadata,
            ...(aiUsage ? { ai_usage: serializeAiUsage(aiUsage) } : {}),
          },
        );
        lastAiGenerationUsageRef.current = null;
        onHistoryRefresh();
      } catch (err) {
        console.warn("persistProcessedToHistory:", err);
      }
    },
    [user, file, settings.formatId, ensureHistoryGroup, onHistoryRefresh],
  );

  const applyAlgorithmicBleed = useCallback(
    async (
      url: string | null,
      options?: { artworkFit?: "contain" | "cover"; layoutSettings?: ProcessingSettings },
    ): Promise<string | null> => {
      if (!url) return null;
      const layout = getPrintLayoutFromSettings(options?.layoutSettings ?? settings);
      try {
        return await addAlgorithmicBleed(url, layout, (m) => processing.stage(m), {
          artworkFit: options?.artworkFit,
        });
      } catch (e) {
        console.warn("addAlgorithmicBleed failed:", e);
        toast.warning("Bleed algoritmic eșuat — folosesc imaginea AI.");
        try {
          return await ensureImageDataUrl(url);
        } catch {
          return url;
        }
      }
    },
    [settings, processing],
  );

  const finalizeAiUpscaleOutput = useCallback(
    async (
      url: string | null,
      meta?: { mode?: UpscaleMode; provider?: string; historyLabel?: string },
    ): Promise<string | null> => {
      if (!url) return null;
      const layoutSettings: ProcessingSettings = {
        ...settings,
        showGuides: true,
        addSafeZone: true,
        bleed: settings.bleed ?? 3,
        safeMargin: settings.safeMargin ?? 3,
      };
      setSettings(layoutSettings);

      let dataUrl: string;
      try {
        dataUrl = await ensureImageDataUrl(url);
      } catch (e) {
        console.warn("ensureImageDataUrl:", e);
        dataUrl = url;
      }

      setProcessedUrl(dataUrl);
      setPreviewUrl(dataUrl);
      setCanvasRevision((n) => n + 1);
      aiLog("AI result on canvas (before bleed)", { len: dataUrl.length });

      processing.stage("Adaug bleed algoritmic (după AI)…");
      const finalized = await applyAlgorithmicBleed(dataUrl, {
        artworkFit: "contain",
        layoutSettings,
      });
      if (finalized) {
        setProcessedUrl(finalized);
        setPreviewUrl(finalized);
        setCanvasRevision((n) => n + 1);
        aiLog("finalize with algorithmic bleed", { len: finalized.length });
      }
      setIsUpscaleNeeded(false);
      if (finalized && meta?.historyLabel) {
        void persistProcessedToHistory(finalized, "upscale", meta.historyLabel, {
          mode: meta.mode,
          provider: meta.provider,
          postProcess: "algorithmic_bleed",
        });
      }
      return finalized ?? dataUrl;
    },
    [applyAlgorithmicBleed, processing, persistProcessedToHistory, settings],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({ 
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
      'application/pdf': ['.pdf']
    },
    multiple: false,
    noClick: !!file,
  });

  const handleDownload = async () => {
    if (!originalBuffer || !file) return;
    processing.begin("Generez PDF tipăribil…");
    try {
      const currentFormat = PRINT_FORMATS.find(f => f.id === settings.formatId);
      const width = settings.formatId === 'custom' ? (settings.customWidth || 90) : currentFormat?.width || 90;
      const height = settings.formatId === 'custom' ? (settings.customHeight || 50) : currentFormat?.height || 50;

      // Use processedUrl (AI results) if available and if it's an image
      let bufferToUse = originalBuffer;
      
      // Handle SVG files specifically: pdf-lib doesn't support them directly,
      // so we must rasterize them to a high-res PNG first for embedding.
      processing.stage("Pregătesc conținutul fișierului…");
      if (file.type.includes('svg') || file.name.toLowerCase().endsWith('.svg')) {
        const svgText = new TextDecoder().decode(originalBuffer);
        const svgBlob = new Blob([svgText], { type: 'image/svg+xml' });
        const svgUrl = URL.createObjectURL(svgBlob);
        
        try {
          const pngUrl = await rasterizeToPNG(svgUrl);
          const response = await fetch(pngUrl);
          bufferToUse = await response.arrayBuffer();
        } catch (err) {
          console.error("Rasterization failed during download:", err);
          // Fallback to original buffer (might still fail in pdf generation if it's not SVG-ready)
        } finally {
          URL.revokeObjectURL(svgUrl);
        }
      }

      if (processedUrl && (file.type.includes('image') || file.name.toLowerCase().endsWith('.svg')) && processedUrl.startsWith('data:')) {
        const response = await fetch(processedUrl);
        bufferToUse = await response.arrayBuffer();
      }

      processing.stage("Generez PDF cu bleed și marcaje…");
      const pdfBytes = await generatePrintPDF(
        [bufferToUse],
        width,
        height,
        settings.bleed || 0,
        settings.safeMargin || 0,
        settings.dpi || 300,
        settings.addCutLine,
        settings.addSafeZone,
        settings.cutLineColor,
        settings.showCropMarks,
        file.type === 'application/pdf' && settings.pdfPageRange === 'current' ? currentPage - 1 : 'all'
      );

      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `print_${file.name.split('.')[0]}.pdf`;
      a.click();
      
      if (user) {
        const historyPath = `users/${user.uid}/history`;
        try {
          await addDoc(collection(db, historyPath), {
            userId: user.uid,
            fileName: file.name,
            format: settings.formatId,
            createdAt: serverTimestamp(),
            timestamp: serverTimestamp(),
            type: 'pdf_export',
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, historyPath);
        }

        if (isSupabaseConfigured()) {
          const pdfBlob = new Blob([pdfBytes], { type: "application/pdf" });
          await registerBlobExport(
            user.uid,
            activeHistoryGroupIdRef.current,
            `print_${file.name.split(".")[0]}.pdf`,
            "pdf_export",
            pdfBlob,
            settings.formatId,
          );
          onHistoryRefresh();
        }
      }
      
      processing.stage("PDF generat cu succes.");
      toast.success("Print-ready PDF generated!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate PDF");
      processing.stop();
      return;
    }
    processing.done();
  };

  const handleExportPreviewImage = async () => {
    if (!processedUrl) {
      toast.error("Nu există previzualizare procesată.");
      return;
    }
    try {
      const res = await fetch(processedUrl);
      const blob = await res.blob();
      const mime = blob.type || "image/png";
      const ext =
        mime.includes("jpeg") || mime.includes("jpg")
          ? "jpg"
          : mime.includes("webp")
            ? "webp"
            : "png";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const base = (file?.name || "document").replace(/\.[^/.]+$/, "");
      a.download = `preview_${base}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);

      if (user && isSupabaseConfigured() && activeHistoryGroupIdRef.current) {
        const base = (file?.name || "document").replace(/\.[^/.]+$/, "");
        await registerBlobExport(
          user.uid,
          activeHistoryGroupIdRef.current,
          `preview_${base}.${ext}`,
          "image_export",
          blob,
          settings.formatId,
        );
        onHistoryRefresh();
      }

      toast.success("Imagine descărcată.");
    } catch (err) {
      console.error(err);
      toast.error("Nu s-a putut exporta imaginea.");
    }
  };

  const handleImposition = async () => {
    if (!originalBuffer || !file) return;
    processing.begin("Calculez imposiția pe coală…");
    const toastId = toast.loading("Calculating optimal imposition...");
    try {
      const currentFormat = PRINT_FORMATS.find(f => f.id === settings.formatId);
      const itemW = (settings.formatId === 'custom' ? (settings.customWidth || 90) : currentFormat?.width || 90) + (settings.bleed || 0) * 2;
      const itemH = (settings.formatId === 'custom' ? (settings.customHeight || 50) : currentFormat?.height || 50) + (settings.bleed || 0) * 2;
      
      const sheetWidth = settings.customSheetWidth || 297;
      const sheetHeight = settings.customSheetHeight || 420;
      
      const spacing = settings.impositionSpacing || (settings.bleed || 0) * 2;

      let finalRows = settings.impositionRows || 1;
      let finalCols = settings.impositionCols || 1;

      processing.stage("Calculez rânduri și coloane pe coală…");
      if (settings.autoMaximize) {
        // Try normal orientation
        const cols1 = Math.floor((sheetWidth + spacing) / (itemW + spacing));
        const rows1 = Math.floor((sheetHeight + spacing) / (itemH + spacing));
        const total1 = cols1 * rows1;

        // Try rotated orientation
        const cols2 = Math.floor((sheetWidth + spacing) / (itemH + spacing));
        const rows2 = Math.floor((sheetHeight + spacing) / (itemW + spacing));
        const total2 = cols2 * rows2;

        if (total1 >= total2 && total1 > 0) {
          finalRows = rows1;
          finalCols = cols1;
        } else if (total2 > total1) {
          finalRows = rows2;
          finalCols = cols2;
        }
        
        if (finalRows * finalCols === 0) {
          throw new Error("Item too large for sheet");
        }
        
        setSettings(s => ({ ...s, impositionRows: finalRows, impositionCols: finalCols }));
      } else {
        // Manual validation
        const totalW = finalCols * itemW + (finalCols - 1) * spacing;
        const totalH = finalRows * itemH + (finalRows - 1) * spacing;
        
        if (totalW > sheetWidth || totalH > sheetHeight) {
          throw new Error(`Manual imposition exceeds sheet size (${Math.round(totalW)}x${Math.round(totalH)}mm vs ${sheetWidth}x${sheetHeight}mm)`);
        }
      }

      processing.stage("Generez PDF de imposiție…");
      const pdfBytes = await generateImpositionPDF(
        originalBuffer,
        itemW,
        itemH,
        sheetWidth,
        sheetHeight,
        finalRows,
        finalCols,
        spacing,
        settings.bleed || 0,
        settings.dpi || 300,
        settings.showCropMarks,
        currentPage - 1
      );

      if (!pdfBytes) throw new Error("PDF generation failed");

      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `imposition_${file.name.split('.')[0]}.pdf`;
      a.click();
      
      processing.stage(`Imposiție: ${finalRows * finalCols} bucăți pe coală.`);
      toast.dismiss(toastId);
      toast.success(`Imposition complete: ${finalRows * finalCols} items on sheet.`);
    } catch (err: any) {
      console.error(err);
      toast.dismiss(toastId);
      toast.error(err.message || "Imposition failed");
      processing.stop();
      return;
    }
    processing.done();
  };

  const handleAIAnalysis = async (urlOverride?: string) => {
    const urlToAnalyze = urlOverride || previewUrl;
    if (!urlToAnalyze) return;
    
    setIsAnalyzing(true);
    setWorkspaceAiError(null);
    processing.begin("Analizez calitatea pentru tipar…");
    try {
      const currentFormat = PRINT_FORMATS.find(f => f.id === settings.formatId);
      const width = settings.formatId === 'custom' ? (settings.customWidth || 90) : currentFormat?.width || 90;
      const height = settings.formatId === 'custom' ? (settings.customHeight || 50) : currentFormat?.height || 50;

      processing.stage("Trimit imaginea la analiza AI…");
      const result = await analyzePrintQuality(urlToAnalyze, settings.dpi || 300, width, height);
      processing.stage("Procesez rezultatul analizei…");
      if (!result) throw new Error("Analysis failed");
      
      setAnalysis(result);
      
      // Check for logo/text protection
      const importantItems = result.boundingBoxes.filter((b: any) => 
        b.label.toLowerCase().includes('text') || 
        b.label.toLowerCase().includes('logo') || 
        b.label.toLowerCase().includes('titlu')
      );

      const marginThreshold = 50; // 5% of coordinate space
      const dangerousItems = importantItems.filter((b: any) => {
        const [ymin, xmin, ymax, xmax] = b.box_2d;
        return xmin < marginThreshold || xmax > 1000 - marginThreshold || 
               ymin < marginThreshold || ymax > 1000 - marginThreshold;
      });

      const nivelTipar =
        result.currentEstimatedQuality === "high"
          ? "nivel ridicat de siguranță pentru tipar"
          : result.currentEstimatedQuality === "medium"
            ? "nivel mediu — merită verificat punct cu punct"
            : "nivel redus — există riscuri clare pentru tipar";
      let voiceMessage = `Analiză completă. Estimare tehnică: ${nivelTipar}. Detalii în tabul Calitate.`;
      
      if (dangerousItems.length > 0) {
        voiceMessage += ` Atenție: am detectat ${dangerousItems.length} elemente importante prea aproape de marginea de tăiere.`;
        toast.warning(`${dangerousItems.length} elements (text/logo) are too close to the bleed area!`, {
          duration: 6000
        });
      } else {
        voiceMessage += " Formatul și zonele de siguranță par să fie în regulă.";
      }

      toast.success("AI Analysis complete!");
      
      // Speak the analysis result
      const audio = await generateSpeech(voiceMessage);
      if (audio) {
        const snd = new Audio(`data:audio/wav;base64,${audio}`);
        snd.play();
      }

    } catch (err: unknown) {
      showWorkspaceAiError(err);
    } finally {
      setIsAnalyzing(false);
      if (processing.isActive && !processing.errorMessage) processing.done();
    }
  };

  const loadHistoryAsset = useCallback(
    async (group: FileHistoryGroup, asset: FileHistoryAsset) => {
      setHistoryLoadingAssetId(asset.id);
      processing.begin("Încarc fișierul din istoric…");
      try {
        processing.stage("Obțin link de descărcare…");
        const downloadUrl = await getAssetDownloadUrl(asset);
        const res = await fetch(downloadUrl);
        if (!res.ok) throw new Error("Descărcarea a eșuat.");

        const blob = await res.blob();
        const fileName = asset.file_name || "history-file";
        const mime = asset.mime_type || blob.type || "application/octet-stream";
        const isPdf = mime.includes("pdf") || fileName.toLowerCase().endsWith(".pdf");
        const isSvg = mime.includes("svg") || fileName.toLowerCase().endsWith(".svg");
        const isImage = mime.startsWith("image/") || isSvg;

        if (!isPdf && !isImage) {
          throw new Error("Tip de fișier neacceptat în workspace.");
        }

        activeHistoryGroupIdRef.current = group.id;
        setHistorySelectedAssetId(asset.id);

        const formatId = group.format_id || asset.format_id;
        if (formatId) {
          setSettings((s) => ({ ...s, formatId }));
        }

        setPreviewUrl((prev) => {
          revokeObjectUrl(prev);
          return null;
        });
        setProcessedUrl((prev) => {
          revokeObjectUrl(prev);
          return null;
        });
        setAnalysis(null);
        setTracedSvg(null);
        setIsUpscaleNeeded(false);
        setCurrentPage(1);

        const buffer = await blob.arrayBuffer();
        const historyFile = new File([blob], fileName, {
          type: isPdf ? "application/pdf" : mime,
        });
        setFile(historyFile);
        setOriginalBuffer(buffer);

        if (isPdf) {
          processing.stage("Randez pagina PDF…");
          const pages = await renderPDFPage(buffer, 1);
          setTotalPages(pages);
        } else {
          processing.stage("Pregătesc previzualizarea…");
          setTotalPages(0);
          let imageUrl: string;
          if (isSvg) {
            const text = new TextDecoder().decode(buffer);
            const svgBlob = new Blob([text], { type: "image/svg+xml" });
            const svgUrl = URL.createObjectURL(svgBlob);
            try {
              imageUrl = await rasterizeToPNG(svgUrl);
            } finally {
              URL.revokeObjectURL(svgUrl);
            }
          } else {
            imageUrl = URL.createObjectURL(blob);
          }
          setPreviewUrl(imageUrl);
          setProcessedUrl(imageUrl);

          const effectiveFormatId = formatId ?? settings.formatId;
          const img = new Image();
          img.onload = () => {
            setOriginalDimensions({ width: img.width, height: img.height });
            handleAIAnalysis(imageUrl);
            const currentFormat = PRINT_FORMATS.find((f) => f.id === effectiveFormatId);
            const targetW =
              effectiveFormatId === "custom"
                ? settings.customWidth || 90
                : currentFormat?.width || 90;
            const targetH =
              effectiveFormatId === "custom"
                ? settings.customHeight || 50
                : currentFormat?.height || 50;
            const targetDpi = settings.dpi || 300;
            const effectiveDpi = Math.min(
              img.width / (targetW / 25.4),
              img.height / (targetH / 25.4),
            );
            if (effectiveDpi < targetDpi * 0.9) {
              setIsUpscaleNeeded(true);
              toast.info(
                `Rezoluție scăzută (${Math.round(effectiveDpi)} DPI). AI Upscale recomandat.`,
              );
            }
          };
          img.src = imageUrl;
        }

        setShowHistory(false);
        toast.success(`Încărcat în workspace: ${fileName}`);
      } catch (err) {
        console.warn("loadHistoryAsset:", err);
        toast.error(
          err instanceof Error ? err.message : "Nu s-a putut încărca fișierul din istoric.",
        );
        processing.stop();
      } finally {
        setHistoryLoadingAssetId(null);
        if (processing.isActive) processing.done();
      }
    },
    [renderPDFPage, rasterizeToPNG, settings.formatId, settings.customWidth, settings.customHeight, settings.dpi, processing],
  );

  const handleUpscale = async (modeOverride?: UpscaleMode) => {
    if (!previewUrl) {
      toast.error("Încarcă mai întâi un fișier.");
      return;
    }
    if (!hasAnyAiKeyConfigured()) {
      toast.error("Adaugă o cheie API (Gemini sau OpenAI).");
      handleSelectKey();
      return;
    }
    const mode = modeOverride ?? settings.upscaleMode ?? "extend";
    if (modeOverride) {
      setSettings((s) => ({ ...s, upscaleMode: modeOverride }));
    }
    aiLog("handleUpscale click", { mode, dpi: settings.dpi });
    setWorkspaceAiError(null);
    processing.begin(mode === "extend" ? "Pornesc AI Upscale (extend)…" : "Pornesc AI Upscale (recompose)…");
    const toastId = toast.loading("AI Upscale în curs…");
    try {
      const currentFormat = PRINT_FORMATS.find(f => f.id === settings.formatId);
      const netW = settings.formatId === 'custom' ? (settings.customWidth || 90) : currentFormat?.width || 90;
      const netH = settings.formatId === 'custom' ? (settings.customHeight || 50) : currentFormat?.height || 50;
      const formatName = currentFormat?.name || 'Custom Format';
      const targetDpi = settings.dpi || 300;
      const safeMargin = settings.safeMargin ?? 3;

      const result = await upscaleImage(
        previewUrl,
        netW,
        netH,
        formatName,
        mode,
        processing.getReporter(),
        targetDpi,
        safeMargin,
      );
      lastAiGenerationUsageRef.current = processing.getUsageSummary();

      if (result.kind === "dual") {
        toast.dismiss(toastId);
        processing.stage("Variante Gemini și OpenAI gata — alege în dialog.");
        const gUrl = result.gemini.imageUrl;
        const oUrl = result.openai.imageUrl;
        aiLog("dual result", { gUrl: Boolean(gUrl), oUrl: Boolean(oUrl), ge: result.gemini.error, oe: result.openai.error });
        if (!gUrl && !oUrl) {
          const blob = `${result.gemini.error || ""} ${result.openai.error || ""}`;
          const invalidKey =
            blob.includes("INVALID_API_KEY") ||
            /invalid api key|401|incorrect api key/i.test(blob);
          if (invalidKey) {
            showWorkspaceAiError("Cheie API invalidă. Verifică .env.local sau Setări → cheie API.");
            handleSelectKey();
          } else {
            const parts = [
              result.gemini.error &&
                `Gemini: ${formatAiApiError(result.gemini.error, { provider: "gemini" })}`,
              result.openai.error &&
                `OpenAI: ${formatAiApiError(result.openai.error, { provider: "openai" })}`,
            ].filter(Boolean);
            showWorkspaceAiError(parts.join(" · ") || "Upscale: ambele modele au eșuat");
          }
          return;
        }
        if (gUrl && !oUrl) {
          toast.success(
            "Gemini a generat imaginea. OpenAI nu a rulat (limită facturare) — alege varianta Gemini în dialog.",
            { duration: 10_000 },
          );
        } else if (!gUrl && oUrl) {
          toast.success(
            "OpenAI a generat imaginea. Gemini a eșuat — alege varianta OpenAI în dialog.",
            { duration: 10_000 },
          );
        } else {
          toast.success("Ambele variante sunt gata — alege în dialog.", { duration: 6000 });
        }
        processing.done();
        setDualImagePicker({ flow: "upscale", dual: result });
        return;
      }

      if (result.imageUrl) {
        await finalizeAiUpscaleOutput(result.imageUrl, {
          mode,
          provider: result.provider,
          historyLabel: `upscale_${mode}`,
        });
        toast.dismiss(toastId);
        toast.success("Upscale gata — bleed + ghidaje active.");
      } else {
        throw new Error("EMPTY_RESPONSE");
      }
    } catch (err) {
      toast.dismiss(toastId);
      aiError("handleUpscale failed", err);
      showWorkspaceAiError(err);
      return;
    }
    processing.done();
  };

  const finalizeWorkspaceDualPickGemini = async (url: string | null) => {
    if (!url) {
      toast.error("Varianta aleasă nu are imagine.");
      return;
    }
    const flow = dualImagePicker?.flow;
    const mode = settings.upscaleMode;
    setDualImagePicker(null);
    aiLog("pick gemini", { flow, hasUrl: true });
    try {
      if (flow === "upscale") {
        processing.begin("Finalizez upscale (bleed + ghidaje)…");
        await finalizeAiUpscaleOutput(url, {
          mode,
          provider: "gemini",
          historyLabel: "pick_gemini",
        });
        processing.done();
        toast.success("Upscale gata — bleed + ghidaje active.");
      } else {
        const finalized = await applyAlgorithmicBleed(url);
        setProcessedUrl(finalized);
        setPreviewUrl(finalized);
        setCanvasRevision((n) => n + 1);
        void persistProcessedToHistory(finalized!, "generative_fill", "pick_gemini", {
          provider: "gemini",
          postProcess: "algorithmic_bleed",
        });
        toast.success("Variantă aplicată.");
      }
    } catch (err) {
      aiError("finalizeWorkspaceDualPickGemini", err);
      showWorkspaceAiError(err);
    }
  };

  const finalizeWorkspaceDualPickOpenai = async (url: string | null) => {
    if (!url) {
      toast.error("Varianta aleasă nu are imagine.");
      return;
    }
    const flow = dualImagePicker?.flow;
    const mode = settings.upscaleMode;
    setDualImagePicker(null);
    aiLog("pick openai", { flow, hasUrl: true });
    try {
      if (flow === "upscale") {
        processing.begin("Finalizez upscale (bleed + ghidaje)…");
        await finalizeAiUpscaleOutput(url, {
          mode,
          provider: "openai",
          historyLabel: "pick_openai",
        });
        processing.done();
        toast.success("Upscale gata — bleed + ghidaje active.");
      } else {
        const finalized = await applyAlgorithmicBleed(url);
        setProcessedUrl(finalized);
        setPreviewUrl(finalized);
        setCanvasRevision((n) => n + 1);
        void persistProcessedToHistory(finalized!, "generative_fill", "pick_openai", {
          provider: "openai",
          postProcess: "algorithmic_bleed",
        });
        toast.success("Variantă aplicată.");
      }
    } catch (err) {
      aiError("finalizeWorkspaceDualPickOpenai", err);
      showWorkspaceAiError(err);
    }
  };

  const refineWorkspaceGemini = async (imageUrl: string, instruction: string) =>
    refineGeminiImageFromPrompt(imageUrl, instruction, processing.getReporter(), settings.dpi || 300);

  const refineWorkspaceOpenai = async (imageUrl: string, instruction: string) => {
    const currentFormat = PRINT_FORMATS.find((f) => f.id === settings.formatId);
    const w =
      settings.formatId === "custom" ? settings.customWidth || 90 : currentFormat?.width || 90;
    const h =
      settings.formatId === "custom" ? settings.customHeight || 50 : currentFormat?.height || 50;
    return openaiPrint.quickImageEditFromPrompt(
      imageUrl,
      instruction,
      w,
      h,
      processing.getReporter(),
      settings.dpi || 300,
    );
  };

  const handleGenerativeFill = async () => {
    const source = processedUrl || previewUrl;
    if (!source) return;
    if (!(settings.bleed && settings.bleed > 0)) {
      toast.error("Setează bleed (mm) înainte de a genera marginile.");
      return;
    }
    processing.begin("Pornesc bleed algoritmic…");
    const toastId = toast.loading("Adaug bleed (extrapolare fundal)…");
    try {
      const finalized = await applyAlgorithmicBleed(source);
      if (!finalized) throw new Error("EMPTY_RESPONSE");
      setProcessedUrl(finalized);
      setPreviewUrl(finalized);
      setCanvasRevision((n) => n + 1);
      toast.dismiss(toastId);
      processing.stage("Bleed algoritmic adăugat.");
      void persistProcessedToHistory(finalized, "generative_fill", "bleed_algorithmic", {
        postProcess: "algorithmic_bleed",
      });
    } catch (err) {
      toast.dismiss(toastId);
      aiError("handleGenerativeFill", err);
      showWorkspaceAiError(err);
      return;
    }
    processing.done();
  };

  const handleTrace = () => {
    if (!previewUrl) return;
    processing.begin("Vectorizez imaginea…");
    ImageTracer.imageToSVG(
      previewUrl,
      (svgstr: string) => {
        setTracedSvg(svgstr);
        processing.done();
        toast.success("Vector tracing complete!");
      },
      { ltres: 1, qtres: 1, pathomit: 8, colorsampling: 1, numberofcolors: 16 }
    );
  };

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Speech recognition not supported in this browser");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'ro-RO';
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      handleSendMessage(transcript);
    };
    recognition.start();
  };

  const handleSendMessage = async (text: string) => {
    if (!text.trim()) return;
    const newMessage = { role: 'user', content: text };
    setChatMessages(prev => [...prev, newMessage]);
    setIsTyping(true);

    try {
      const result = await processAgentMessage(text, settings, !!file);
      const aiMessage = { role: 'assistant', content: result.reply };
      setChatMessages(prev => [...prev, aiMessage]);

      if (result.settingsUpdate) {
        setSettings(prev => ({ ...prev, ...result.settingsUpdate }));
      }

      if (result.action === 'process') handleDownload();
      if (result.action === 'upscale') handleUpscale();
      if (result.action === 'download') handleDownload();
      if (result.action === 'imposition') handleImposition();

      // Speak response
      const audio = await generateSpeech(result.reply);
      if (audio) {
        const snd = new Audio(`data:audio/wav;base64,${audio}`);
        snd.play();
      }
    } catch (err) {
      toast.error("AI Agent failed to respond");
    } finally {
      setIsTyping(false);
    }
  };
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-row overflow-hidden bg-[var(--bg)] font-sans text-[var(--text)] selection:bg-amber-500/30">
      {mobileSidebarOpen && (
        <button
          type="button"
          aria-label="Închide meniul setări"
          className="fixed inset-0 z-30 bg-black/70 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}
      
      {/* Aside — pe mobil: drawer peste conținut; pe desktop: coloană fixă */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex min-h-0 w-[min(20rem,calc(100vw-1.25rem))] max-w-[18rem] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface-elevated)] shadow-2xl transition-transform duration-300 ease-out lg:relative lg:z-20 lg:h-full lg:w-72 lg:max-w-none lg:translate-x-0 lg:shadow-none",
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-3 sm:px-4">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500 shadow-md shadow-amber-500/15">
              <Printer className="h-5 w-5 text-black" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold tracking-tight text-white sm:text-base">print1.ai</h1>
              <p className="text-[9px] font-medium uppercase tracking-wide text-[var(--text-muted)]">Pregătire fișier pentru tipar</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              className="rounded-lg p-2 text-[#94a3b8] hover:bg-white/5 hover:text-white lg:hidden"
              aria-label="Închide setările"
              onClick={() => setMobileSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
            <div className="flex flex-col items-center gap-0.5">
              <button
                type="button"
                onClick={logOut}
                className="rounded-lg p-2 text-[#94a3b8] transition-colors hover:bg-white/5 hover:text-red-400"
                aria-label="Deconectare"
              >
                <LogOut className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setExportMenuOpen(false);
                  setMockupMenuOpen(false);
                  setFormatPickerOpen(false);
                  setSheetPickerOpen(false);
                  setShowAiSettings(true);
                  setMobileSidebarOpen(false);
                }}
                className="rounded-lg p-2 text-[#94a3b8] transition-colors hover:bg-white/5 hover:text-amber-400"
                title="Setări AI — conexiuni API, model mockup"
                aria-label="Setări AI"
              >
                <Cpu className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="custom-scrollbar flex-1 space-y-8 overflow-y-auto p-4 sm:p-5">
          {/* Section: File Settings */}
          <section className="space-y-3">
            <div className="mb-2 flex items-center gap-2">
              <div className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                <Settings className="h-3 w-3 shrink-0" />
                <span className="truncate">Format & tehnic</span>
              </div>
            </div>
            
            <div className="space-y-2.5">
              <div ref={formatPickerRef} className="relative">
                  <button
                    type="button"
                    aria-expanded={formatPickerOpen}
                    aria-haspopup="listbox"
                    onClick={() => {
                      setSheetPickerOpen(false);
                      setFormatPickerOpen((o) => !o);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-all",
                      formatPickerOpen
                        ? "border-amber-500/50 bg-[#1a1d23] shadow-[0_0_0_1px_rgba(245,158,11,0.15)]"
                        : "border-[#2d333b] bg-[#1a1d23] hover:border-white/15 hover:bg-[#1e2229]",
                    )}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <div
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                          formatPickerOpen ? "border-amber-500/30 bg-amber-500/10" : "border-[#2d333b] bg-[#0d1117]/80",
                        )}
                      >
                        <Printer className="h-4 w-4 text-amber-500/90" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-white">
                          {(() => {
                            const f = PRINT_FORMATS.find((x) => x.id === settings.formatId);
                            if (!f) return "Format";
                            return f.id === "custom" ? "Dimensiuni personalizate" : f.name;
                          })()}
                        </p>
                        <p className="truncate text-[11px] text-[#94a3b8]">
                          {settings.formatId === "custom"
                            ? settings.customWidth != null && settings.customHeight != null
                              ? `${settings.customWidth}×${settings.customHeight} mm`
                              : "Setare manuală (mm)"
                            : (() => {
                                const f = PRINT_FORMATS.find((x) => x.id === settings.formatId);
                                return f ? `${f.width}×${f.height} mm` : "";
                              })()}
                        </p>
                      </div>
                    </div>
                    <ChevronDown
                      className={cn("h-4 w-4 shrink-0 text-[#94a3b8] transition-transform", formatPickerOpen && "rotate-180")}
                      aria-hidden
                    />
                  </button>
                  <AnimatePresence>
                    {formatPickerOpen && (
                      <motion.div
                        key="format-picker"
                        initial={DROPDOWN_PANEL.initial}
                        animate={DROPDOWN_PANEL.animate}
                        exit={DROPDOWN_PANEL.exit}
                        transition={DROPDOWN_PANEL.transition}
                        className="absolute left-0 right-0 top-[calc(100%+6px)] z-[70] overflow-hidden rounded-xl border border-[#2d333b] bg-[#161b22] shadow-xl shadow-black/40 ring-1 ring-black/20"
                        role="listbox"
                        aria-label="Alege formatul paginii"
                      >
                      <div className="border-b border-[#2d333b]/80 bg-[#0d1117]/50 px-3 py-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#94a3b8]">Dimensiune pagină</p>
                        <p className="text-[10px] text-[#64748b]">Preseturi tipografice + personalizat</p>
                      </div>
                      <div className="custom-scrollbar max-h-[min(55vh,16rem)] overflow-y-auto p-1.5">
                        {PRINT_FORMATS.map((f) => {
                          const selected = settings.formatId === f.id;
                          const isCustom = f.id === "custom";
                          const dimLabel = isCustom
                            ? "Lățime și înălțime la alegere"
                            : `${f.width}×${f.height} mm`;
                          return (
                            <button
                              key={f.id}
                              type="button"
                              role="option"
                              aria-selected={selected}
                              onClick={() => {
                                setSettings({ ...settings, formatId: f.id });
                                setFormatPickerOpen(false);
                              }}
                              className={cn(
                                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                                selected
                                  ? "bg-amber-500/15 ring-1 ring-amber-500/25"
                                  : "hover:bg-white/[0.04]",
                              )}
                            >
                              <span
                                className={cn(
                                  "flex min-h-8 min-w-8 max-w-[3.5rem] shrink-0 items-center justify-center rounded-md px-1 text-[8px] font-bold leading-tight tabular-nums",
                                  selected ? "bg-amber-500 text-black" : "bg-[#21262d] text-[#94a3b8]",
                                )}
                              >
                                {isCustom ? "±" : `${f.width}×${f.height}`}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13px] font-medium text-[#e6edf3]">
                                  {isCustom ? "Dimensiuni personalizate" : f.name}
                                </span>
                                <span className="block truncate text-[11px] text-[#64748b]">{dimLabel}</span>
                              </span>
                              {selected && <Check className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />}
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                    )}
                  </AnimatePresence>
                </div>

              {settings.formatId === 'custom' && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8] ml-1">Width (mm)</label>
                    <input 
                      type="number" 
                      value={settings.customWidth === null ? '' : settings.customWidth}
                      onChange={(e) => setSettings({...settings, customWidth: e.target.value === '' ? null : Number(e.target.value)})}
                      className="w-full bg-[#1a1d23] border border-[#2d333b] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-500 transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8] ml-1">Height (mm)</label>
                    <input 
                      type="number" 
                      value={settings.customHeight === null ? '' : settings.customHeight}
                      onChange={(e) => setSettings({...settings, customHeight: e.target.value === '' ? null : Number(e.target.value)})}
                      className="w-full bg-[#1a1d23] border border-[#2d333b] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-500 transition-colors"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5 group relative">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8] ml-1 flex items-center gap-1">
                    Bleed (mm)
                    <span className="cursor-help text-amber-500/50 hover:text-amber-500">?</span>
                  </label>
                  <div className="absolute left-0 -top-12 w-48 p-2 bg-[#1a1d23] border border-[#2d333b] rounded-lg text-[9px] text-[#94a3b8] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                    Bleed is generated OUTSIDE the net format. E.g. 100x100mm + 3mm bleed = 106x106mm total output.
                  </div>
                  <input 
                    type="number" 
                    value={settings.bleed === null ? '' : settings.bleed}
                    onChange={(e) => setSettings({...settings, bleed: e.target.value === '' ? null : Number(e.target.value)})}
                    className="w-full bg-[#1a1d23] border border-[#2d333b] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-500 transition-colors"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8] ml-1">Safe (mm)</label>
                  <input 
                    type="number" 
                    value={settings.safeMargin === null ? '' : settings.safeMargin}
                    onChange={(e) => setSettings({...settings, safeMargin: e.target.value === '' ? null : Number(e.target.value)})}
                    className="w-full bg-[#1a1d23] border border-[#2d333b] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-500 transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8] ml-1">Resolution (DPI)</label>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    {[72, 150, 300].map(d => (
                      <button
                        key={d}
                        onClick={() => setSettings({...settings, dpi: d})}
                        className={cn(
                          "flex-1 py-2 rounded-xl text-xs font-bold transition-all border",
                          settings.dpi === d 
                            ? "bg-amber-500 border-amber-500 text-black" 
                            : "bg-[#1a1d23] border-[#2d333b] text-[#94a3b8] hover:border-white/20"
                        )}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                  <div className="relative">
                    <input 
                      type="number" 
                      placeholder="Custom DPI..."
                      value={settings.dpi === null ? '' : settings.dpi}
                      onChange={(e) => setSettings({...settings, dpi: e.target.value === '' ? null : Number(e.target.value)})}
                      className="w-full bg-[#1a1d23] border border-[#2d333b] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-500 transition-colors"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[#94a3b8]">DPI</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Section: Imposition Settings */}
          {PRINT_FORMATS.find(f => f.id === settings.formatId)?.isPaper && (
            <section className="space-y-4 border-t border-[var(--border)]/60 pt-6">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  <LayoutGrid className="h-3 w-3 shrink-0" />
                  <span className="truncate">Imposiție pe coală</span>
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-[#1a1d23] border border-[#2d333b] rounded-xl">
                  <div className="flex items-center gap-2">
                    <Sparkles className={cn("w-4 h-4", settings.autoAIUpscale ? "text-amber-500" : "text-[#94a3b8]")} />
                    <span className="text-sm font-medium text-white">Auto AI Upscale</span>
                  </div>
                  <button 
                    onClick={() => setSettings({...settings, autoAIUpscale: !settings.autoAIUpscale})}
                    className={cn(
                      "w-10 h-5 rounded-full transition-colors relative",
                      settings.autoAIUpscale ? "bg-amber-500" : "bg-[#2d333b]"
                    )}
                  >
                    <div className={cn(
                      "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                      settings.autoAIUpscale ? "right-1" : "left-1"
                    )} />
                  </button>
                </div>

                <div className="space-y-1.5 pt-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8] ml-1">
                    Dimensiune coală
                  </label>
                  <div ref={sheetPickerRef} className="relative">
                    <button
                      type="button"
                      aria-expanded={sheetPickerOpen}
                      aria-haspopup="listbox"
                      onClick={() => {
                        setFormatPickerOpen(false);
                        setSheetPickerOpen((o) => !o);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-all",
                        sheetPickerOpen
                          ? "border-amber-500/50 bg-[#1a1d23] shadow-[0_0_0_1px_rgba(245,158,11,0.15)]"
                          : "border-[#2d333b] bg-[#1a1d23] hover:border-white/15 hover:bg-[#1e2229]",
                      )}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2.5">
                        <div
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                            sheetPickerOpen ? "border-amber-500/30 bg-amber-500/10" : "border-[#2d333b] bg-[#0d1117]/80",
                          )}
                        >
                          <LayoutGrid className="h-4 w-4 text-amber-500/90" aria-hidden />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-white">
                            {(() => {
                              const sid = settings.impositionSheetId ?? "a4";
                              const s = IMPOSITION_SHEETS.find((x) => x.id === sid);
                              return s?.name ?? "Coală";
                            })()}
                          </p>
                          <p className="truncate text-[11px] text-[#94a3b8]">
                            {(() => {
                              const sid = settings.impositionSheetId ?? "a4";
                              const s = IMPOSITION_SHEETS.find((x) => x.id === sid);
                              if (!s) return "";
                              if (s.id === "custom") {
                                const w = settings.customSheetWidth;
                                const h = settings.customSheetHeight;
                                if (w != null && h != null && w > 0 && h > 0) {
                                  return `${w}×${h} mm`;
                                }
                                return "Dimensiuni la alegere (mm)";
                              }
                              return `${s.width}×${s.height} mm`;
                            })()}
                          </p>
                        </div>
                      </div>
                      <ChevronDown
                        className={cn("h-4 w-4 shrink-0 text-[#94a3b8] transition-transform", sheetPickerOpen && "rotate-180")}
                        aria-hidden
                      />
                    </button>
                    <AnimatePresence>
                      {sheetPickerOpen && (
                        <motion.div
                          key="sheet-picker"
                          initial={DROPDOWN_PANEL.initial}
                          animate={DROPDOWN_PANEL.animate}
                          exit={DROPDOWN_PANEL.exit}
                          transition={DROPDOWN_PANEL.transition}
                          className="absolute left-0 right-0 top-[calc(100%+6px)] z-[70] overflow-hidden rounded-xl border border-[#2d333b] bg-[#161b22] shadow-xl shadow-black/40 ring-1 ring-black/20"
                          role="listbox"
                          aria-label="Alege dimensiunea coalei"
                        >
                          <div className="border-b border-[#2d333b]/80 bg-[#0d1117]/50 px-3 py-2">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-[#94a3b8]">Coală tipografică</p>
                            <p className="text-[10px] text-[#64748b]">Preseturi standard + coală personalizată</p>
                          </div>
                          <div className="custom-scrollbar max-h-[min(55vh,14rem)] overflow-y-auto p-1.5">
                            {IMPOSITION_SHEETS.map((s) => {
                              const sid = settings.impositionSheetId ?? "a4";
                              const selected = sid === s.id;
                              const isCustom = s.id === "custom";
                              const dimLabel = isCustom
                                ? "Lățime și înălțime coală la alegere"
                                : `${s.width}×${s.height} mm`;
                              return (
                                <button
                                  key={s.id}
                                  type="button"
                                  role="option"
                                  aria-selected={selected}
                                  onClick={() => {
                                    setSettings({
                                      ...settings,
                                      impositionSheetId: s.id,
                                      customSheetWidth: s.width || 0,
                                      customSheetHeight: s.height || 0,
                                    });
                                    setSheetPickerOpen(false);
                                  }}
                                  className={cn(
                                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                                    selected
                                      ? "bg-amber-500/15 ring-1 ring-amber-500/25"
                                      : "hover:bg-white/[0.04]",
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "flex min-h-8 min-w-8 max-w-[4rem] shrink-0 items-center justify-center rounded-md px-1 text-[8px] font-bold leading-tight tabular-nums",
                                      selected ? "bg-amber-500 text-black" : "bg-[#21262d] text-[#94a3b8]",
                                    )}
                                  >
                                    {isCustom ? "±" : `${s.width}×${s.height}`}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[13px] font-medium text-[#e6edf3]">{s.name}</span>
                                    <span className="block truncate text-[11px] text-[#64748b]">{dimLabel}</span>
                                  </span>
                                  {selected && <Check className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />}
                                </button>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  {(settings.impositionSheetId ?? "a4") === "custom" && (
                    <div className="grid grid-cols-2 gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8] ml-1">
                          Lățime coală (mm)
                        </label>
                        <input
                          type="number"
                          value={settings.customSheetWidth === null || settings.customSheetWidth === undefined ? "" : settings.customSheetWidth}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              customSheetWidth: e.target.value === "" ? null : Number(e.target.value),
                            })
                          }
                          className="w-full bg-[#1a1d23] border border-[#2d333b] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-500 transition-colors"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8] ml-1">
                          Înălțime coală (mm)
                        </label>
                        <input
                          type="number"
                          value={settings.customSheetHeight === null || settings.customSheetHeight === undefined ? "" : settings.customSheetHeight}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              customSheetHeight: e.target.value === "" ? null : Number(e.target.value),
                            })
                          }
                          className="w-full bg-[#1a1d23] border border-[#2d333b] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-500 transition-colors"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between p-3 bg-[#1a1d23] border border-[#2d333b] rounded-xl">
                  <div className="flex items-center gap-2">
                    <Maximize2 className={cn("w-4 h-4", settings.autoMaximize ? "text-amber-500" : "text-[#94a3b8]")} />
                    <span className="text-sm font-medium text-white">Auto-Maximize</span>
                  </div>
                  <button 
                    onClick={() => setSettings({...settings, autoMaximize: !settings.autoMaximize})}
                    className={cn(
                      "w-10 h-5 rounded-full transition-colors relative",
                      settings.autoMaximize ? "bg-amber-500" : "bg-[#2d333b]"
                    )}
                  >
                    <div className={cn(
                      "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                      settings.autoMaximize ? "right-1" : "left-1"
                    )} />
                  </button>
                </div>

                {!settings.autoMaximize && (
                  <div className="grid grid-cols-2 gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8] ml-1">Rows</label>
                      <input 
                        type="number" 
                        value={settings.impositionRows === null ? '' : settings.impositionRows}
                        onChange={(e) => setSettings({...settings, impositionRows: e.target.value === '' ? null : Number(e.target.value)})}
                        className="w-full bg-[#1a1d23] border border-[#2d333b] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8] ml-1">Cols</label>
                      <input 
                        type="number" 
                        value={settings.impositionCols === null ? '' : settings.impositionCols}
                        onChange={(e) => setSettings({...settings, impositionCols: e.target.value === '' ? null : Number(e.target.value)})}
                        className="w-full bg-[#1a1d23] border border-[#2d333b] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-[#94a3b8] ml-1">
                    <label>Spacing (mm)</label>
                    <span>{(!settings.impositionSpacing && settings.bleed) ? `Auto: ${(settings.bleed || 0) * 2}mm` : ''}</span>
                  </div>
                  <input 
                    type="number" 
                    placeholder={settings.bleed ? `${(settings.bleed || 0) * 2}` : "0"}
                    value={settings.impositionSpacing === null ? '' : settings.impositionSpacing}
                    onChange={(e) => setSettings({...settings, impositionSpacing: e.target.value === '' ? null : Number(e.target.value)})}
                    className="w-full bg-[#1a1d23] border border-[#2d333b] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="flex items-center justify-between p-3 bg-[#1a1d23] border border-[#2d333b] rounded-xl">
                  <div className="flex items-center gap-2">
                    <CropIcon className={cn("w-4 h-4", settings.showCropMarks ? "text-amber-500" : "text-[#94a3b8]")} />
                    <span className="text-sm font-medium">Show Crop Marks</span>
                  </div>
                  <button 
                    onClick={() => setSettings({...settings, showCropMarks: !settings.showCropMarks})}
                    className={cn(
                      "w-10 h-5 rounded-full transition-colors relative",
                      settings.showCropMarks ? "bg-amber-500" : "bg-[#2d333b]"
                    )}
                  >
                    <div className={cn(
                      "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                      settings.showCropMarks ? "right-1" : "left-1"
                    )} />
                  </button>
                </div>
              </div>
            </section>
          )}

        </div>
      </aside>

      {/* Main Content */}
      <main className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-10 flex h-12 shrink-0 items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface-elevated)]/85 px-2.5 backdrop-blur-md sm:h-14 sm:px-3 lg:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-medium sm:gap-2 sm:text-sm">
            <button
              type="button"
              className="flex shrink-0 items-center justify-center rounded-lg p-2 text-[var(--text-muted)] hover:bg-white/5 hover:text-white lg:hidden"
              aria-label="Deschide setările print"
              onClick={() => setMobileSidebarOpen(true)}
            >
              <PanelLeft className="h-5 w-5" />
            </button>
            <span className="hidden shrink-0 text-[var(--text-muted)] sm:inline">Fișier</span>
            <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-[var(--border)] sm:block" />
            <span className="min-w-0 truncate text-white" title={file ? file.name : undefined}>
              {file ? file.name : "Încarcă un PDF sau imagine"}
            </span>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-3">
            <div ref={exportMenuRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => {
                  setMockupMenuOpen(false);
                  setFormatPickerOpen(false);
                  setSheetPickerOpen(false);
                  setExportMenuOpen((o) => !o);
                }}
                aria-expanded={exportMenuOpen}
                aria-haspopup="menu"
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors",
                  exportMenuOpen
                    ? "border-amber-500/50 bg-amber-500/15 text-amber-400"
                    : "border-[var(--border)] bg-[var(--card)]/60 text-[var(--text-muted)] hover:border-white/20 hover:text-white",
                )}
              >
                <Download className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">Export</span>
                <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", exportMenuOpen && "rotate-180")} />
              </button>
              <AnimatePresence>
                {exportMenuOpen && (
                  <motion.div
                    key="export-menu"
                    initial={DROPDOWN_PANEL.initial}
                    animate={DROPDOWN_PANEL.animate}
                    exit={DROPDOWN_PANEL.exit}
                    transition={DROPDOWN_PANEL.transition}
                    className="absolute right-0 top-full z-[60] mt-1 w-[min(calc(100vw-2rem),22rem)] rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-3 shadow-xl"
                    role="menu"
                  >
                  <div className="mb-3 border-b border-[var(--border)] pb-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Export fișiere</p>
                    <p className="mt-0.5 text-[10px] leading-snug text-[var(--text-muted)]/90">
                      PDF pentru tipar, coală imposată sau imagine din previzualizarea curentă
                    </p>
                  </div>
                  <div className="max-h-[min(70vh,28rem)] space-y-3 overflow-y-auto custom-scrollbar">
                    <div className="space-y-1.5">
                      <p className="px-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Tip fișier</p>
                      <div className="space-y-1.5">
                        <button
                          type="button"
                          disabled={!file || isProcessing}
                          title={!file ? "Încarcă un fișier" : undefined}
                          onClick={() => {
                            setExportMenuOpen(false);
                            setMobileSidebarOpen(false);
                            void handleDownload();
                          }}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors",
                            !file || isProcessing
                              ? "cursor-not-allowed border-[var(--border)]/60 opacity-50"
                              : "border-[var(--border)] bg-[var(--card)]/80 hover:border-amber-500/45 hover:bg-amber-500/5",
                          )}
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-amber-500/25 bg-amber-500/10">
                            {isProcessing ? (
                              <RefreshCw className="h-4 w-4 animate-spin text-amber-500" aria-hidden />
                            ) : (
                              <Printer className="h-4 w-4 text-amber-500" aria-hidden />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="block text-xs font-semibold text-[var(--text)]">PDF tipăribil</span>
                            <span className="mt-0.5 block text-[10px] leading-snug text-[var(--text-muted)]">
                              Format setat, bleed, safe, ghidaje · .pdf
                            </span>
                          </div>
                          <Download className="h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
                        </button>
                        <button
                          type="button"
                          disabled={
                            !file ||
                            isProcessing ||
                            !PRINT_FORMATS.find((f) => f.id === settings.formatId)?.isPaper
                          }
                          title={
                            !PRINT_FORMATS.find((f) => f.id === settings.formatId)?.isPaper
                              ? "Disponibil pentru formate pe coală (ex. A4, carte de vizită)"
                              : undefined
                          }
                          onClick={() => {
                            setExportMenuOpen(false);
                            setMobileSidebarOpen(false);
                            void handleImposition();
                          }}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors",
                            !file || isProcessing || !PRINT_FORMATS.find((f) => f.id === settings.formatId)?.isPaper
                              ? "cursor-not-allowed border-[var(--border)]/60 opacity-50"
                              : "border-[var(--border)] bg-[var(--card)]/80 hover:border-amber-500/45 hover:bg-amber-500/5",
                          )}
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5">
                            {isProcessing ? (
                              <RefreshCw className="h-4 w-4 animate-spin text-[var(--text-muted)]" aria-hidden />
                            ) : (
                              <LayoutGrid className="h-4 w-4 text-[var(--text-muted)]" aria-hidden />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="block text-xs font-semibold text-[var(--text)]">PDF imposiție</span>
                            <span className="mt-0.5 block text-[10px] leading-snug text-[var(--text-muted)]">
                              Mai multe exemplare pe coală (setări secțiunea Imposiție) · .pdf
                            </span>
                          </div>
                          <Layers className="h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
                        </button>
                        <button
                          type="button"
                          disabled={!processedUrl}
                          title={!processedUrl ? "Generează mai întâi previzualizarea" : undefined}
                          onClick={() => {
                            setExportMenuOpen(false);
                            void handleExportPreviewImage();
                          }}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors",
                            !processedUrl
                              ? "cursor-not-allowed border-[var(--border)]/60 opacity-50"
                              : "border-[var(--border)] bg-[var(--card)]/80 hover:border-emerald-500/35 hover:bg-emerald-500/5",
                          )}
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-500/10">
                            <ImageIcon className="h-4 w-4 text-emerald-400" aria-hidden />
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="block text-xs font-semibold text-[var(--text)]">Imagine previzualizare</span>
                            <span className="mt-0.5 block text-[10px] leading-snug text-[var(--text-muted)]">
                              PNG / JPG / WebP din preview-ul curent
                            </span>
                          </div>
                          <Download className="h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-[var(--border)] pt-2">
                      <p className="mb-2 px-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                        Opțiuni PDF tipăribil
                      </p>
                      <div className="space-y-2">
                        {file?.type === "application/pdf" && (
                          <div className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-2.5">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-amber-500" />
                              <span className="text-[11px] font-bold uppercase tracking-wide text-amber-500">Pagini PDF</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => setSettings((s) => ({ ...s, pdfPageRange: "all" }))}
                                className={cn(
                                  "rounded-lg border py-1.5 text-[10px] font-bold uppercase transition-all",
                                  settings.pdfPageRange === "all"
                                    ? "border-amber-500 bg-amber-500 text-black"
                                    : "border-[var(--border)] bg-[var(--card)] text-[var(--text-muted)] hover:border-white/20",
                                )}
                              >
                                Toate
                              </button>
                              <button
                                type="button"
                                onClick={() => setSettings((s) => ({ ...s, pdfPageRange: "current" }))}
                                className={cn(
                                  "rounded-lg border py-1.5 text-[10px] font-bold uppercase transition-all",
                                  settings.pdfPageRange === "current"
                                    ? "border-amber-500 bg-amber-500 text-black"
                                    : "border-[var(--border)] bg-[var(--card)] text-[var(--text-muted)] hover:border-white/20",
                                )}
                              >
                                Pagina curentă
                              </button>
                            </div>
                            {settings.pdfPageRange === "current" && (
                              <p className="text-center text-[10px] italic text-[var(--text-muted)]">
                                Pagina {currentPage} / {totalPages}
                              </p>
                            )}
                          </div>
                        )}
                        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <CropIcon className={cn("h-4 w-4 shrink-0", settings.addCutLine ? "text-amber-500" : "text-[var(--text-muted)]")} />
                                <span className="text-xs font-medium text-[var(--text)]">CutContour</span>
                              </div>
                              <span className="mt-0.5 block text-[9px] text-[var(--text-muted)]">Spot pentru tăiere digitală</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSettings({ ...settings, addCutLine: !settings.addCutLine })}
                              className={cn(
                                "relative h-5 w-10 shrink-0 rounded-full transition-colors",
                                settings.addCutLine ? "bg-amber-500" : "bg-[#2d333b]",
                              )}
                              aria-pressed={settings.addCutLine}
                            >
                              <span
                                className={cn(
                                  "absolute top-1 h-3 w-3 rounded-full bg-white transition-all",
                                  settings.addCutLine ? "right-1" : "left-1",
                                )}
                              />
                            </button>
                          </div>
                        </div>
                        <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <Palette className={cn("h-4 w-4 shrink-0", settings.simulateCMYK ? "text-amber-500" : "text-[var(--text-muted)]")} />
                                <span className="text-xs font-medium text-[var(--text)]">Contrast / culoare pe ecran</span>
                              </div>
                              <p className="mt-1 text-[9px] leading-snug text-[var(--text-muted)]">
                                Aplică pe previzualizarea din centru un filtru aproximativ (saturation, contrast, luminanță) — doar pentru ochii tăi pe monitor, nu schimbă fișierul exportat și nu înlocuiește probă tipar sau profil ICC. Analiza obiectivă (DPI, margini, gamut) o ai în panoul din dreapta, tabul{" "}
                                <span className="font-semibold text-[var(--text)]">Calitate</span>, după ce rulezi verificarea.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSettings({ ...settings, simulateCMYK: !settings.simulateCMYK })}
                              className={cn(
                                "relative mt-0.5 h-5 w-10 shrink-0 rounded-full transition-colors",
                                settings.simulateCMYK ? "bg-amber-500" : "bg-[#2d333b]",
                              )}
                              aria-pressed={settings.simulateCMYK}
                              aria-label="Activează sau dezactivează aproximarea de contrast și culoare pe ecran"
                            >
                              <span
                                className={cn(
                                  "absolute top-1 h-3 w-3 rounded-full bg-white transition-all",
                                  settings.simulateCMYK ? "right-1" : "left-1",
                                )}
                              />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div ref={mockupMenuRef} className="relative shrink-0">
              <button
                type="button"
                disabled={!processedUrl}
                title={!processedUrl ? "Ai nevoie de o previzualizare procesată" : undefined}
                onClick={() => {
                  if (!processedUrl) return;
                  setExportMenuOpen(false);
                  setFormatPickerOpen(false);
                  setSheetPickerOpen(false);
                  setMockupMenuOpen((o) => !o);
                }}
                aria-expanded={mockupMenuOpen}
                aria-haspopup="menu"
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors",
                  !processedUrl && "cursor-not-allowed opacity-40",
                  mockupMenuOpen && processedUrl
                    ? "border-amber-500/50 bg-amber-500/15 text-amber-400"
                    : "border-[var(--border)] bg-[var(--card)]/60 text-[var(--text-muted)] hover:border-white/20 hover:text-white",
                )}
              >
                <Sparkles className="h-4 w-4 shrink-0 text-amber-500/90" />
                <span className="hidden sm:inline">Mockup</span>
                <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", mockupMenuOpen && "rotate-180")} />
              </button>
              <AnimatePresence>
                {mockupMenuOpen && processedUrl && (
                  <motion.div
                    key="mockup-menu"
                    initial={DROPDOWN_PANEL.initial}
                    animate={DROPDOWN_PANEL.animate}
                    exit={DROPDOWN_PANEL.exit}
                    transition={DROPDOWN_PANEL.transition}
                    className="absolute right-0 top-full z-[60] mt-1 w-[min(calc(100vw-2rem),18rem)] rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-2 shadow-xl"
                    role="menu"
                  >
                  <p className="mb-2 border-b border-[var(--border)] px-1 pb-2 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                    Tip mockup
                  </p>
                  <div className="custom-scrollbar max-h-[min(70vh,22rem)] space-y-0.5 overflow-y-auto pr-0.5">
                    {MOCKUP_TYPES.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMockupType(m.id as MockupType);
                          setShowMockup(true);
                          setMockupMenuOpen(false);
                        }}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-xs transition-colors",
                          mockupType === m.id
                            ? "bg-amber-500/15 text-amber-400"
                            : "text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--text)]",
                        )}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--card)]">
                          <m.icon className="h-4 w-4" />
                        </span>
                        <span className="font-medium">{m.label}</span>
                      </button>
                    ))}
                  </div>
                </motion.div>
                )}
              </AnimatePresence>
            </div>
            {user && (
                <button
                  type="button"
                  onClick={() => setShowHistory(!showHistory)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                    showHistory
                      ? "border-amber-500/50 bg-amber-500/15 text-amber-400"
                      : "border-[var(--border)] bg-[var(--card)]/60 text-[var(--text-muted)] hover:border-white/20 hover:text-white"
                  )}
                >
                  <History className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline">Istoric</span>
                </button>
            )}
          </div>
        </header>

        {/* Editor Area */}
        <div className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-0 overflow-hidden p-3 sm:p-4 lg:flex-row lg:gap-4 lg:p-5">
          <AnimatePresence>
            {showHistory && user && (
              <FileHistoryDrawer
                groupedHistory={groupedHistory}
                legacyHistory={history}
                onClose={() => setShowHistory(false)}
                onSelectAsset={loadHistoryAsset}
                loadingAssetId={historyLoadingAssetId}
                selectedAssetId={historySelectedAssetId}
              />
            )}
          </AnimatePresence>

          <div className="mx-auto flex min-h-0 w-full max-w-[100rem] flex-1 flex-col gap-4 overflow-hidden px-2 pb-2 sm:px-3 lg:flex-row lg:items-stretch lg:gap-3 lg:px-4">
            <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col justify-center overflow-hidden lg:min-h-0">
              <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col overflow-hidden px-0 py-0 sm:py-1 lg:mx-0 lg:max-w-none">
                {!file ? (
                  <div
                    {...getRootProps()}
                    className={cn(
                      "flex min-h-0 flex-1 cursor-pointer flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed px-4 py-10 transition-all",
                      isDragActive
                        ? "border-amber-500 bg-amber-500/5"
                        : "border-[var(--border)] hover:border-amber-500/40 hover:bg-amber-500/[0.03]",
                    )}
                  >
                    <input {...getInputProps()} />
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--card)]">
                      <Upload className="h-7 w-7 text-[var(--text-muted)]" />
                    </div>
                    <div className="text-center">
                      <p className="text-base font-semibold text-white">Trage fișierul aici</p>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">PDF, PNG, JPG, WebP sau SVG</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mb-2 flex shrink-0 flex-col gap-2 pb-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
                          <Eye className="h-4 w-4 text-amber-500" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--text)]">Previzualizare tipăribil</h3>
                          <p className="text-[10px] text-[var(--text-muted)]">Bleed, safe, ghidaje</p>
                          <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]" title={file?.name}>{file?.name}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        {!rightToolsOpen && (
                          <button
                            type="button"
                            onClick={() => setRightToolsOpen(true)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)]/60 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)] hover:border-amber-500/35 hover:text-amber-400 lg:hidden"
                            title="Arată panoul Agent AI și calitate"
                          >
                            <Bot className="h-3.5 w-3.5" />
                            Panou AI
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setSettings((prev) => ({ ...prev, showGuides: !prev.showGuides }))}
                          className={cn(
                            "rounded-lg border px-3 py-1.5 text-xs font-bold transition-all",
                            settings.showGuides
                              ? "border-amber-500 bg-amber-500 text-black"
                              : "border-[var(--border)] bg-[var(--card)]/60 text-[var(--text-muted)]",
                          )}
                        >
                          Guides
                        </button>
                        <button
                          type="button"
                          onClick={handleDownload}
                          className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white/5 px-3 py-1.5 text-xs font-bold hover:bg-white/10"
                        >
                          <Download className="h-4 w-4" />
                          PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => open()}
                          className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] hover:border-amber-500/40"
                        >
                          Schimbă fișierul
                        </button>
                        <button
                          type="button"
                          onClick={clearWorkspaceFile}
                          className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/20"
                        >
                          <Trash2 className="h-4 w-4" />
                          Șterge
                        </button>
                      </div>
                    </div>
                    <div
                      {...getRootProps({
                        className: cn(
                          "relative flex min-h-0 flex-1 flex-col rounded-lg",
                          isDragActive && "ring-2 ring-amber-500/50 ring-offset-2 ring-offset-[var(--bg)]",
                        ),
                      })}
                    >
                      <input {...getInputProps()} />
                <div className="relative flex min-h-0 flex-1 flex-col overflow-auto rounded-lg border border-[var(--border)] bg-[#0d1117] p-3 sm:p-6">
                  {canvasDisplayUrl ? (
                    <div className="flex min-h-0 w-full max-w-full flex-1 flex-col gap-3">
                      <div className="relative flex min-h-0 flex-1 items-center justify-center">
                        <div
                          className="relative group shadow-[0_20px_50px_rgba(0,0,0,0.5)] bg-white transition-all duration-500"
                          style={{
                            aspectRatio: (() => {
                              const f = PRINT_FORMATS.find((fmt) => fmt.id === settings.formatId);
                              const w =
                                settings.formatId === "custom"
                                  ? settings.customWidth || 1
                                  : f?.width || 1;
                              const h =
                                settings.formatId === "custom"
                                  ? settings.customHeight || 1
                                  : f?.height || 1;
                              return `${w} / ${h}`;
                            })(),
                            maxHeight: "100%",
                            maxWidth: "100%",
                            width: "auto",
                            height: "auto",
                          }}
                        >
                          {totalPages > 1 && (
                            <div className="absolute left-2 top-2 z-50 flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#1a1d23]/80 px-2 py-1 backdrop-blur-md sm:left-4 sm:top-4 sm:gap-2 sm:px-3 sm:py-1.5">
                              <button
                                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="rounded-lg p-1 transition-colors hover:bg-white/10 disabled:opacity-30"
                              >
                                <ChevronLeft className="h-4 w-4" />
                              </button>
                              <span className="min-w-[3rem] text-center text-[10px] font-bold text-[#94a3b8]">
                                Page {currentPage} / {totalPages}
                              </span>
                              <button
                                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="rounded-lg p-1 transition-colors hover:bg-white/10 disabled:opacity-30"
                              >
                                <ChevronRight className="h-4 w-4" />
                              </button>
                            </div>
                          )}

                          <img
                            key={`canvas-${canvasRevision}`}
                            ref={imgRef}
                            src={canvasDisplayUrl}
                            alt="Processed"
                            className={cn(
                              "h-full w-full object-contain transition-all duration-300",
                              settings.simulateCMYK && "simulate-cmyk",
                            )}
                          />

                          {settings.showGuides && (
                        <div className="absolute inset-0 pointer-events-none overflow-hidden">
                          {(() => {
                            const currentFormat = PRINT_FORMATS.find(f => f.id === settings.formatId);
                            let targetWidthMm = settings.formatId === 'custom' ? (settings.customWidth || 0) : currentFormat?.width || 90;
                            let targetHeightMm = settings.formatId === 'custom' ? (settings.customHeight || 0) : currentFormat?.height || 50;
                            
                            const bleed = settings.bleed || 0;
                            const totalWidth = targetWidthMm + 2 * bleed;
                            const totalHeight = targetHeightMm + 2 * bleed;

                            const bleedPercentX = (bleed / totalWidth) * 100;
                            const bleedPercentY = (bleed / totalHeight) * 100;

                            return (
                              <>
                                {/* GROSS FORMAT BOUNDARY (Total File) */}
                                <div className="absolute inset-0 border-2 border-dashed border-white/20" />
                                
                                {/* BLEED ZONE OVERLAY (To show strictly what is external) */}
                                <div 
                                  className="absolute inset-0 bg-black/40"
                                  style={{
                                    clipPath: `polygon(
                                      0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,
                                      ${bleedPercentX}% ${bleedPercentY}%, 
                                      ${bleedPercentX}% ${100 - bleedPercentY}%, 
                                      ${100 - bleedPercentX}% ${100 - bleedPercentY}%, 
                                      ${100 - bleedPercentX}% ${bleedPercentY}%, 
                                      ${bleedPercentX}% ${bleedPercentY}%
                                    )`
                                  }}
                                >
                                  <div className="absolute top-1 left-1/2 -translate-x-1/2 text-[7px] font-bold text-white/40 uppercase tracking-widest">
                                    Zona Bleed (Generată Exterior +{bleed}mm)
                                  </div>
                                </div>

                                {/* MAGENTA TRIM LINE (NET FORMAT) */}
                                <div 
                                  className="absolute border-2 border-[#ff00ff] shadow-[0_0_15px_rgba(255,0,255,0.4)] transition-all duration-300"
                                  style={{
                                    top: `${bleedPercentY}%`,
                                    left: `${bleedPercentX}%`,
                                    right: `${bleedPercentX}%`,
                                    bottom: `${bleedPercentY}%`,
                                  }}
                                >
                                  <div className="absolute -top-5 left-0 px-1.5 py-0.5 bg-[#ff00ff] text-white text-[8px] font-bold uppercase rounded-sm flex items-center gap-1">
                                    <ScissorsIcon className="w-2 h-2" />
                                    LINIE TĂIERE (NET: {targetWidthMm}x{targetHeightMm}mm)
                                  </div>
                                </div>

                                {/* SAFE MARGIN (Internal) */}
                                {(settings.safeMargin || 0) > 0 && (
                                  <div 
                                    className="absolute border border-dashed border-amber-500/50"
                                    style={{
                                      top: `${((bleed + (settings.safeMargin || 0)) / totalHeight) * 100}%`,
                                      left: `${((bleed + (settings.safeMargin || 0)) / totalWidth) * 100}%`,
                                      right: `${((bleed + (settings.safeMargin || 0)) / totalWidth) * 100}%`,
                                      bottom: `${((bleed + (settings.safeMargin || 0)) / totalHeight) * 100}%`,
                                    }}
                                  >
                                    <div className="absolute top-0 left-0 px-1 py-0.5 bg-amber-500/20 text-amber-500 text-[7px] font-bold uppercase">Safe Zone</div>
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      )}
                          <AiErrorBanner
                            message={workspaceAiError}
                            onDismiss={clearWorkspaceAiError}
                            className="absolute left-3 right-3 top-3 z-30"
                          />
                          <ProcessingOverlay
                            visible={isProcessing || isAnalyzing || Boolean(processing.errorMessage)}
                            message={processing.message}
                            log={processing.log}
                            elapsedSec={processing.elapsedSec}
                            progress={processing.progress}
                            errorMessage={processing.errorMessage}
                            onDismissError={clearWorkspaceAiError}
                          />
                    </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleImposition()}
                            disabled={isProcessing}
                            className={cn(
                              "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-45",
                              "border-[var(--border)] bg-[var(--card)]/60 text-[var(--text)] hover:border-amber-500/45 hover:bg-amber-500/5",
                            )}
                          >
<LayoutGrid className="h-4 w-4 shrink-0 text-amber-500" />
                            <span>Imposition</span>
                          </button>

                          <div ref={aiUpscaleMenuRef} className="relative">
                            <button
                              type="button"
                              onClick={() => setAiUpscaleMenuOpen((o) => !o)}
                              disabled={isProcessing}
                              className={cn(
                                "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-45",
                                aiUpscaleMenuOpen
                                  ? "border-amber-500/45 bg-amber-500/10 text-[var(--text)]"
                                  : "border-[var(--border)] bg-[var(--card)]/60 text-[var(--text)] hover:border-amber-500/45 hover:bg-amber-500/5",
                              )}
                            >
<ArrowUpCircle className="h-4 w-4 shrink-0 text-amber-500" />
                              <span>AI Upscale</span>
                              <ChevronDown
                                className={cn(
                                  "h-3.5 w-3.5 shrink-0 opacity-80 transition-transform",
                                  aiUpscaleMenuOpen && "rotate-180",
                                )}
                              />
                            </button>
                            {aiUpscaleMenuOpen && (
                              <div className="absolute bottom-full left-1/2 z-[60] mb-2 w-[12.5rem] -translate-x-1/2 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-1.5 shadow-lg">
                                <p className="px-2 pb-1 pt-1 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                                  Mod upscale
                                </p>
                                <button
                                  type="button"
                                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[11px] font-semibold text-[var(--text)] transition-colors hover:bg-amber-500/10"
                                  onClick={() => {
                                    setAiUpscaleMenuOpen(false);
                                    void handleUpscale("extend");
                                  }}
                                >
                                  Extend
                                  {(settings.upscaleMode ?? "extend") === "extend" && (
                                    <Check className="h-3.5 w-3.5 text-amber-500" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[11px] font-semibold text-[var(--text)] transition-colors hover:bg-amber-500/10"
                                  onClick={() => {
                                    setAiUpscaleMenuOpen(false);
                                    void handleUpscale("recompose");
                                  }}
                                >
                                  Recompose
                                  {settings.upscaleMode === "recompose" && (
                                    <Check className="h-3.5 w-3.5 text-amber-500" />
                                  )}
                                </button>
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => void handleGenerativeFill()}
                            disabled={isProcessing}
                            className={cn(
                              "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-45",
                              "border-[var(--border)] bg-[var(--card)]/60 text-[var(--text)] hover:border-amber-500/45 hover:bg-amber-500/5",
                            )}
                          >
<Sparkles className="h-4 w-4 shrink-0 text-amber-500" />
                            <span>AI Bleed</span>
                          </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center space-y-4 opacity-30">
                      <ImageIcon className="w-12 h-12 mx-auto" />
                      <p className="text-sm">Upload a file to see preview</p>
                    </div>
                  )}
                </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div
              className={cn(
                "min-h-0 shrink-0 flex-col overflow-hidden transition-[width] duration-200 ease-out lg:flex lg:h-full lg:min-h-0",
                rightToolsOpen
                  ? "flex w-full lg:w-[380px] lg:max-w-[380px]"
                  : "hidden lg:flex lg:w-[3.25rem] lg:max-w-[3.25rem]",
              )}
            >
              {!rightToolsOpen ? (
                <aside className="flex min-h-0 flex-1 flex-col items-center gap-3 border-l border-[var(--border)] bg-[var(--surface-elevated)]/30 py-3 lg:min-h-0">
                  <button
                    type="button"
                    onClick={() => setRightToolsOpen(true)}
                    className="rounded-lg border border-[var(--border)] bg-[var(--card)]/80 p-2 text-[var(--text-muted)] transition-colors hover:border-amber-500/40 hover:text-amber-400"
                    title="Arată panoul Agent AI și Verificare calitate"
                    aria-label="Arată panoul Agent AI și Verificare calitate"
                  >
                    <PanelLeft className="h-4 w-4 rotate-180" />
                  </button>
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setRightToolsTab("agent");
                        setRightToolsOpen(true);
                      }}
                      className="rounded-lg border border-transparent p-2 text-[#64748b] hover:border-amber-500/30 hover:bg-amber-500/10 hover:text-amber-400"
                      title="Agent AI"
                      aria-label="Deschide Agent AI"
                    >
                      <Bot className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRightToolsTab("quality");
                        setRightToolsOpen(true);
                      }}
                      className="rounded-lg border border-transparent p-2 text-[#64748b] hover:border-amber-500/30 hover:bg-amber-500/10 hover:text-amber-400"
                      title="Verificare calitate"
                      aria-label="Deschide Verificare calitate"
                    >
                      <Zap className="h-4 w-4" />
                    </button>
                  </div>
                </aside>
              ) : (
                <aside className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] lg:min-h-0">
                  <div className="flex shrink-0 items-stretch gap-0 border-b border-[var(--border)] bg-[var(--surface-elevated)]">
                    <button
                      type="button"
                      onClick={() => setRightToolsTab("agent")}
                      className={cn(
                        "flex min-w-0 flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-2.5 text-[10px] font-bold uppercase tracking-wide transition-colors sm:text-[11px]",
                        rightToolsTab === "agent"
                          ? "border-amber-500 text-amber-400"
                          : "border-transparent text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--text)]",
                      )}
                    >
                      <Bot className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
                      <span className="truncate">Agent AI</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRightToolsTab("quality")}
                      className={cn(
                        "flex min-w-0 flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-2.5 text-[10px] font-bold uppercase tracking-wide transition-colors sm:text-[11px]",
                        rightToolsTab === "quality"
                          ? "border-amber-500 text-amber-400"
                          : "border-transparent text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--text)]",
                      )}
                    >
                      <Zap className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
                      <span className="truncate">Calitate</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRightToolsOpen(false)}
                      className="shrink-0 border-l border-[var(--border)] px-2.5 text-[var(--text-muted)] transition-colors hover:bg-white/5 hover:text-amber-400"
                      title="Ascunde panoul"
                      aria-label="Ascunde panoul Agent și calitate"
                    >
                      <PanelRight className="mx-auto h-4 w-4" />
                    </button>
                  </div>

                  {rightToolsTab === "agent" && (
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-b border-[var(--border)] px-3 py-2">
                        <button
                          type="button"
                          onClick={startListening}
                          className={cn(
                            "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors",
                            isListening
                              ? "border-red-500/40 bg-red-500/10 text-red-400"
                              : "border-[var(--border)] bg-[var(--card)]/80 text-[var(--text-muted)] hover:border-amber-500/35 hover:text-amber-400",
                          )}
                          title={isListening ? "Ascult… (apasă din nou pentru a opri)" : "Dictează mesajul pentru agent"}
                        >
                          <Mic className="h-4 w-4 shrink-0" />
                          <span>Voce</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleSelectKey}
                          className={cn(
                            "flex items-center justify-center rounded-lg border p-2 transition-colors",
                            hasKey
                              ? "border-transparent bg-transparent text-[#64748b] hover:bg-white/5 hover:text-[var(--text-muted)]"
                              : "border-amber-500/35 bg-amber-500/10 text-amber-400 hover:bg-amber-500/15",
                          )}
                          title={
                            hasKey
                              ? "Schimbă cheia API (OpenAI / Gemini)"
                              : "Adaugă cheie API — necesară pentru unele funcții AI"
                          }
                          aria-label={hasKey ? "Schimbă cheia API" : "Adaugă cheie API"}
                        >
                          <Key className="h-4 w-4 shrink-0" />
                        </button>
                      </div>

                      <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto bg-[#0d1117]/25 p-3 sm:p-3">
                        {chatMessages.length === 0 && (
                          <div className="flex h-full min-h-[8rem] flex-col items-center justify-center gap-4 px-6 py-8 text-center opacity-30">
                            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#1a1d23]">
                              <Mic className="h-8 w-8" />
                            </div>
                            <p className="text-xs">„Setează formatul A3 și adaugă 3mm bleed”</p>
                            <p className="text-[10px]">Întreabă despre setări tipar sau procesare fișier.</p>
                          </div>
                        )}
                        {chatMessages.map((msg, i) => (
                          <div
                            key={i}
                            className={cn(
                              "flex max-w-[85%] flex-col gap-1",
                              msg.role === "user" ? "ml-auto items-end" : "items-start",
                            )}
                          >
                            <div
                              className={cn(
                                "rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow-sm",
                                msg.role === "user"
                                  ? "rounded-tr-none bg-amber-500 font-medium text-black"
                                  : "rounded-tl-none border border-[#2d333b] bg-[#1a1d23] text-[#e6edf3]",
                              )}
                            >
                              {msg.content}
                            </div>
                          </div>
                        ))}
                        {isTyping && (
                          <div className="flex w-16 items-center gap-1 rounded-2xl rounded-tl-none border border-[#2d333b] bg-[#1a1d23] px-4 py-2">
                            <div className="h-1 w-1 animate-bounce rounded-full bg-amber-500" />
                            <div className="h-1 w-1 animate-bounce rounded-full bg-amber-500 [animation-delay:0.2s]" />
                            <div className="h-1 w-1 animate-bounce rounded-full bg-amber-500 [animation-delay:0.4s]" />
                          </div>
                        )}
                      </div>

                      <div className="shrink-0 border-t border-[var(--border)] bg-[var(--surface-elevated)] p-3">
                        <div className="relative">
                          <input
                            ref={agentInputRef}
                            type="text"
                            placeholder="Ex.: setează bleed 3mm, format A4…"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                handleSendMessage(e.currentTarget.value);
                                e.currentTarget.value = "";
                              }
                            }}
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] py-2.5 pl-3 pr-10 text-sm focus:border-amber-500 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const el = agentInputRef.current;
                              if (!el) return;
                              handleSendMessage(el.value);
                              el.value = "";
                            }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-[#94a3b8] transition-colors hover:text-amber-500"
                            aria-label="Trimite mesajul"
                          >
                            <Send className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {rightToolsTab === "quality" && (
                    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 sm:gap-4 sm:p-4">
                      <div className="flex shrink-0 flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
                        <p className="text-[10px] text-[var(--text-muted)] sm:max-w-[55%]">
                          DPI, margini, recomandări pentru tipar.
                        </p>
                        <button
                          type="button"
                          onClick={() => void handleAIAnalysis()}
                          disabled={!file || isAnalyzing}
                          className="w-full shrink-0 rounded-lg bg-amber-500 px-3 py-2 text-[11px] font-bold uppercase text-black transition-colors hover:bg-amber-400 disabled:opacity-50 sm:w-auto"
                        >
                          {isAnalyzing ? "Analizez…" : "Rulează verificarea"}
                        </button>
                      </div>

                      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto rounded-lg border border-[var(--border)] bg-[#0d1117]/80 p-3">
                        {analysis ? (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-[#94a3b8]">Estimare risc tipar</span>
                              <span
                                className={cn(
                                  "rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wide",
                                  analysis.currentEstimatedQuality === "high"
                                    ? "bg-green-500/20 text-green-500"
                                    : analysis.currentEstimatedQuality === "medium"
                                      ? "bg-amber-500/20 text-amber-500"
                                      : "bg-red-500/20 text-red-500",
                                )}
                              >
                                {analysis.currentEstimatedQuality === "high"
                                  ? "Nivel ridicat"
                                  : analysis.currentEstimatedQuality === "medium"
                                    ? "Nivel mediu"
                                    : "Nivel redus"}
                              </span>
                            </div>

                            <div className="space-y-2">
                              <p className="text-[10px] font-bold uppercase text-[#94a3b8]">Issues Detected</p>
                              {analysis.issues.length > 0 ? (
                                analysis.issues.map((issue: string, i: number) => (
                                  <div key={i} className="flex items-center gap-2 text-xs text-red-400">
                                    <AlertCircle className="h-3 w-3" />
                                    {issue}
                                  </div>
                                ))
                              ) : (
                                <div className="flex items-center gap-2 text-xs text-green-500">
                                  <CheckCircle2 className="h-3 w-3" />
                                  No critical issues found
                                </div>
                              )}
                            </div>

                            <div className="space-y-2">
                              <p className="text-[10px] font-bold uppercase text-[#94a3b8]">Recommendations</p>
                              {analysis.recommendations.map((rec: string, i: number) => (
                                <div key={i} className="flex items-start gap-2 text-xs text-[#94a3b8]">
                                  <ChevronRight className="mt-0.5 h-3 w-3 shrink-0" />
                                  {rec}
                                </div>
                              ))}
                            </div>

                            {analysis.canUpscaleHelp && (
                              <button
                                type="button"
                                onClick={() => void handleUpscale()}
                                className="w-full rounded-lg border border-amber-500/20 bg-amber-500/10 py-2 text-[10px] font-bold uppercase text-amber-500 transition-colors hover:bg-amber-500/20"
                              >
                                Upscale to fix resolution
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="flex h-full min-h-[10rem] flex-col items-center justify-center gap-3 text-center opacity-30">
                            <Search className="h-8 w-8" />
                            <p className="text-xs">Încarcă un fișier și rulează verificarea</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </aside>
              )}
            </div>
            </div>
          </div>
      </main>

      {!rightToolsOpen && (
        <button
          type="button"
          className="fixed bottom-4 right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-elevated)] text-amber-400 shadow-lg transition-colors hover:border-amber-500/45 hover:bg-amber-500/10 lg:hidden"
          onClick={() => setRightToolsOpen(true)}
          aria-label="Arată panoul Agent AI și Verificare calitate"
        >
          <Bot className="h-5 w-5" />
        </button>
      )}

      <AnimatePresence mode="wait">
        {showMockup && processedUrl && (
          <MockupViewer
            key="mockup-studio" 
            designImage={processedUrl}
            onClose={() => setShowMockup(false)}
            initialType={mockupType}
            hasKey={hasKey}
            handleSelectKey={handleSelectKey}
          />
        )}
      </AnimatePresence>

      <AiDualCompareDialog
        open={!!dualImagePicker}
        onClose={() => setDualImagePicker(null)}
        title={
          dualImagePicker?.flow === "upscale"
            ? "Compară rezultate AI Upscale"
            : "Compară rezultate AI Bleed"
        }
        subtitle={
          dualImagePicker?.flow === "upscale"
            ? "Alege varianta Gemini sau OpenAI. Poți descrie modificări punctuale sub fiecare imagine înainte de a alege."
            : "Alege varianta pentru marginile de bleed. Poți rafina fiecare coloană cu un prompt înainte de a confirma."
        }
        gemini={{
          imageUrl: dualImagePicker?.dual.gemini.imageUrl ?? null,
          error: dualImagePicker?.dual.gemini.error,
        }}
        openai={{
          imageUrl: dualImagePicker?.dual.openai.imageUrl ?? null,
          error: dualImagePicker?.dual.openai.error,
        }}
        onPickGemini={finalizeWorkspaceDualPickGemini}
        onPickOpenai={finalizeWorkspaceDualPickOpenai}
        refineWithGemini={refineWorkspaceGemini}
        refineWithOpenai={refineWorkspaceOpenai}
        zIndexClass="z-[125]"
      />

      <AiSettingsModal
        open={showAiSettings}
        onClose={() => setShowAiSettings(false)}
        onConfigureKeys={handleSelectKey}
        onSaved={() => setHasKey(hasAnyAiKeyConfigured())}
      />
    </div>
  );
}
