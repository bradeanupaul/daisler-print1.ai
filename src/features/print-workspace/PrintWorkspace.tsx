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
  PanelLeft
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
  PrintFormat, 
  MockupType,
  HistoryItem
} from '../../types';
import { 
  generateImpositionPDF,
  generatePrintPDF 
} from '../../services/pdf';
import { 
  processAgentMessage, 
  analyzePrintQuality, 
  upscaleImage, 
  generativeFill,
  generateCustomMockup,
  generateSpeech
} from '../../services/gemini';
import { MockupViewer } from '../../components/MockupViewer';
import { DEFAULT_PRINT_SETTINGS } from './defaultPrintSettings';

// --- Main App ---
export type PrintWorkspaceProps = {
  user: FirebaseUser;
  history: HistoryItem[];
};

export function PrintWorkspace({ user, history }: PrintWorkspaceProps) {
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
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  const [tracedSvg, setTracedSvg] = useState<string | null>(null);
  const [showMockup, setShowMockup] = useState(false);
  const [mockupType, setMockupType] = useState<MockupType>('hoodie');
  const [showHistory, setShowHistory] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [settings, setSettings] = useState<ProcessingSettings>({
    ...DEFAULT_PRINT_SETTINGS,
  });

  const imgRef = useRef<HTMLImageElement>(null);
  const agentInputRef = useRef<HTMLInputElement>(null);
  // API Key Check (Gemini din .env / storage sau OpenAI)
  useEffect(() => {
    setHasKey(hasAnyAiKeyConfigured());
  }, []);
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
    }
  }, [renderPDFPage]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
      'application/pdf': ['.pdf']
    },
    multiple: false
  });

  const handleDownload = async () => {
    if (!originalBuffer || !file) return;
    setIsProcessing(true);
    try {
      const currentFormat = PRINT_FORMATS.find(f => f.id === settings.formatId);
      const width = settings.formatId === 'custom' ? (settings.customWidth || 90) : currentFormat?.width || 90;
      const height = settings.formatId === 'custom' ? (settings.customHeight || 50) : currentFormat?.height || 50;

      // Use processedUrl (AI results) if available and if it's an image
      let bufferToUse = originalBuffer;
      
      // Handle SVG files specifically: pdf-lib doesn't support them directly,
      // so we must rasterize them to a high-res PNG first for embedding.
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
            timestamp: serverTimestamp(), // Keep for ordering consistency if used
            type: 'pdf_export',
            isApproved: isApproved
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, historyPath);
        }
      }
      
      toast.success("Print-ready PDF generated!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate PDF");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImposition = async () => {
    if (!originalBuffer || !file) return;
    setIsProcessing(true);
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
      
      toast.dismiss(toastId);
      toast.success(`Imposition complete: ${finalRows * finalCols} items on sheet.`);
    } catch (err: any) {
      console.error(err);
      toast.dismiss(toastId);
      toast.error(err.message || "Imposition failed");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAIAnalysis = async (urlOverride?: string) => {
    const urlToAnalyze = urlOverride || previewUrl;
    if (!urlToAnalyze) return;
    
    setIsAnalyzing(true);
    try {
      const currentFormat = PRINT_FORMATS.find(f => f.id === settings.formatId);
      const width = settings.formatId === 'custom' ? (settings.customWidth || 90) : currentFormat?.width || 90;
      const height = settings.formatId === 'custom' ? (settings.customHeight || 50) : currentFormat?.height || 50;

      const result = await analyzePrintQuality(urlToAnalyze, settings.dpi || 300, width, height);
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

      let voiceMessage = `Analiză completă. Calitatea este ${result.currentEstimatedQuality === 'high' ? 'foarte bună' : result.currentEstimatedQuality === 'medium' ? 'acceptabilă' : 'scăzută'}.`;
      
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

    } catch (err: any) {
      if (err.message === "QUOTA_EXHAUSTED") {
        toast.error("AI Quota exceeded. Please try again later or use your own API key.");
      } else {
        toast.error("AI Analysis failed");
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleUpscale = async () => {
    if (!previewUrl) return;
    setIsProcessing(true);
    const toastId = toast.loading("Symmetric AI Restoration in progress...");
    try {
      const currentFormat = PRINT_FORMATS.find(f => f.id === settings.formatId);
      const bleed = settings.bleed || 0;
      const targetW = (settings.formatId === 'custom' ? (settings.customWidth || 90) : currentFormat?.width || 90) + bleed * 2;
      const targetH = (settings.formatId === 'custom' ? (settings.customHeight || 50) : currentFormat?.height || 50) + bleed * 2;
      const formatName = currentFormat?.name || 'Custom Format';

      const result = await upscaleImage(
        previewUrl,
        targetW,
        targetH,
        formatName,
        bleed,
        settings.upscaleMode ?? "extend"
      );
      if (result) {
        setProcessedUrl(result);
        setIsUpscaleNeeded(false);
        toast.dismiss(toastId);
        toast.success("Design intelligently expanded and upscaled!");
      } else {
        toast.dismiss(toastId);
        toast.error("AI returned no image data. Try again.");
      }
    } catch (err) {
      toast.dismiss(toastId);
      toast.error("Upscale failed");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerativeFill = async () => {
    if (!previewUrl) return;
    setIsProcessing(true);
    const toastId = toast.loading("AI is generating bleed...");
    try {
      const currentFormat = PRINT_FORMATS.find(f => f.id === settings.formatId);
      const width = settings.formatId === 'custom' ? (settings.customWidth || 90) : currentFormat?.width || 90;
      const height = settings.formatId === 'custom' ? (settings.customHeight || 50) : currentFormat?.height || 50;

      const result = await generativeFill(processedUrl || previewUrl, settings.bleed || 3, width, height);
      if (result) {
        setProcessedUrl(result);
        toast.dismiss(toastId);
        toast.success("Generative fill completed!");
      } else {
        toast.dismiss(toastId);
        toast.error("AI could not generate bleed for this image.");
      }
    } catch (err) {
      toast.dismiss(toastId);
      toast.error("Generative fill failed");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTrace = () => {
    if (!previewUrl) return;
    setIsProcessing(true);
    ImageTracer.imageToSVG(
      previewUrl,
      (svgstr: string) => {
        setTracedSvg(svgstr);
        setIsProcessing(false);
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
    <div className="min-h-screen bg-[#0d1117] text-[#e6edf3] font-sans selection:bg-amber-500/30 flex overflow-hidden">
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
          "fixed inset-y-0 left-0 z-40 flex w-[min(20rem,calc(100vw-1.5rem))] max-w-[18rem] shrink-0 flex-col border-r border-[#2d333b] bg-[#16191e] shadow-2xl transition-transform duration-300 ease-out lg:relative lg:z-20 lg:w-72 lg:max-w-none lg:translate-x-0 lg:shadow-none",
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex items-center justify-between border-b border-[#2d333b] p-4 sm:p-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 shadow-lg shadow-amber-500/20">
              <Printer className="h-6 w-6 text-black" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-black tracking-tighter text-white sm:text-lg">print1.ai</h1>
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500">Pro Processor</p>
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
            <button onClick={logOut} className="p-2 hover:bg-white/5 rounded-lg transition-colors text-[#94a3b8] hover:text-red-400">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-8 custom-scrollbar">
          {/* Section 1: File Settings */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/20 text-amber-500 text-[10px] font-bold">1</span>
              <div className="flex items-center gap-2 text-xs font-semibold text-[#94a3b8] uppercase tracking-widest">
                <Settings className="w-3 h-3" />
                <span>File Settings</span>
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8] ml-1">Format</label>
                <select 
                  value={settings.formatId}
                  onChange={(e) => setSettings({...settings, formatId: e.target.value})}
                  className="w-full bg-[#1a1d23] border border-[#2d333b] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 transition-colors"
                >
                  {PRINT_FORMATS.map(f => (
                    <option key={f.id} value={f.id}>{f.name} ({f.width}x{f.height}mm)</option>
                  ))}
                  <option value="custom">Custom Size...</option>
                </select>
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

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8] ml-1">
                  AI Upscale — mod
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, upscaleMode: "extend" })}
                    className={cn(
                      "py-2.5 rounded-xl text-[10px] font-bold uppercase transition-all border text-center leading-tight",
                      (settings.upscaleMode ?? "extend") === "extend"
                        ? "bg-amber-500 border-amber-500 text-black"
                        : "bg-[#1a1d23] border-[#2d333b] text-[#94a3b8] hover:border-white/20"
                    )}
                  >
                    Extend + outpainting
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, upscaleMode: "recompose" })}
                    className={cn(
                      "py-2.5 rounded-xl text-[10px] font-bold uppercase transition-all border text-center leading-tight",
                      settings.upscaleMode === "recompose"
                        ? "bg-amber-500 border-amber-500 text-black"
                        : "bg-[#1a1d23] border-[#2d333b] text-[#94a3b8] hover:border-white/20"
                    )}
                  >
                    Recompunere
                  </button>
                </div>
                <p className="text-[9px] text-[#64748b] leading-snug px-0.5">
                  <span className="text-[#94a3b8]">Extend:</span> artwork-ul central rămâne neschimbat; benzile noi se umplu continuând elementele de design (pattern, cadre, textură), nu blocuri goale uniforme.
                  <span className="text-[#94a3b8]"> Recompunere:</span> mută și reordonează liber elementele existente (scale per bucată) — fără stretch uniform pe tot tabloul și fără conținut nou.
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Export Options */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/20 text-amber-500 text-[10px] font-bold">2</span>
              <div className="flex items-center gap-2 text-xs font-semibold text-[#94a3b8] uppercase tracking-widest">
                <Download className="w-3 h-3" />
                <span>Export Options</span>
              </div>
            </div>

            <div className="space-y-2">
              {file?.type === 'application/pdf' && (
                <div className="space-y-2 p-3 bg-white/5 rounded-xl border border-white/5 mb-2">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-amber-500" />
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-500">PDF Export Range</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setSettings(s => ({ ...s, pdfPageRange: 'all' }))}
                      className={cn(
                        "py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all border text-center",
                        settings.pdfPageRange === 'all' 
                          ? "bg-amber-500 border-amber-500 text-black" 
                          : "bg-[#1a1d23] border-[#2d333b] text-[#94a3b8] hover:border-white/20"
                      )}
                    >
                      All Pages
                    </button>
                    <button
                      onClick={() => setSettings(s => ({ ...s, pdfPageRange: 'current' }))}
                      className={cn(
                        "py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all border text-center",
                        settings.pdfPageRange === 'current' 
                          ? "bg-amber-500 border-amber-500 text-black" 
                          : "bg-[#1a1d23] border-[#2d333b] text-[#94a3b8] hover:border-white/20"
                      )}
                    >
                      Current Page
                    </button>
                  </div>
                  {settings.pdfPageRange === 'current' && (
                    <p className="text-[10px] text-center text-[#94a3b8] italic">Exporting page {currentPage} of {totalPages}</p>
                  )}
                </div>
              )}
              
              <div className="flex flex-col gap-2 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CropIcon className={cn("w-4 h-4", settings.addCutLine ? "text-amber-500" : "text-[#94a3b8]")} />
                    <div>
                      <span className="text-sm font-medium block">Production CutContour</span>
                      <span className="text-[9px] text-[#94a3b8]">Named spot color for digital cutting</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => setSettings({...settings, addCutLine: !settings.addCutLine})}
                    className={cn(
                      "w-10 h-5 rounded-full transition-colors relative",
                      settings.addCutLine ? "bg-amber-500" : "bg-[#2d333b]"
                    )}
                  >
                    <div className={cn(
                      "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                      settings.addCutLine ? "right-1" : "left-1"
                    )} />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-[#1a1d23] border border-[#2d333b] rounded-xl">
                <div className="flex items-center gap-2">
                  <Palette className={cn("w-4 h-4", settings.simulateCMYK ? "text-amber-500" : "text-[#94a3b8]")} />
                  <span className="text-sm font-medium">Simulate CMYK</span>
                </div>
                <button 
                  onClick={() => setSettings({...settings, simulateCMYK: !settings.simulateCMYK})}
                  className={cn(
                    "w-10 h-5 rounded-full transition-colors relative",
                    settings.simulateCMYK ? "bg-amber-500" : "bg-[#2d333b]"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                    settings.simulateCMYK ? "right-1" : "left-1"
                  )} />
                </button>
              </div>
            </div>
          </div>

          {/* Section 3: Imposition Settings */}
          {PRINT_FORMATS.find(f => f.id === settings.formatId)?.isPaper && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="flex items-center gap-2 mb-1">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/20 text-amber-500 text-[10px] font-bold">3</span>
                <div className="flex items-center justify-between flex-1">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#94a3b8] uppercase tracking-widest">
                    <LayoutGrid className="w-3 h-3" />
                    <span>Imposition Settings</span>
                  </div>
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
                  <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-[#94a3b8] ml-1">
                    <label>Sheet Size</label>
                  </div>
                  <select 
                    value={settings.impositionSheetId}
                    onChange={(e) => {
                      const sheet = IMPOSITION_SHEETS.find(s => s.id === e.target.value);
                      setSettings({
                        ...settings, 
                        impositionSheetId: e.target.value,
                        customSheetWidth: sheet?.width || 0,
                        customSheetHeight: sheet?.height || 0
                      });
                    }}
                    className="w-full bg-[#1a1d23] border border-[#2d333b] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
                  >
                    {IMPOSITION_SHEETS.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
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
            </div>
          )}

          {/* Section 4: Client Approval */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/20 text-amber-500 text-[10px] font-bold">4</span>
              <div className="flex items-center gap-2 text-xs font-semibold text-[#94a3b8] uppercase tracking-widest">
                <CheckCircle2 className="w-3 h-3" />
                <span>Status Comandă</span>
              </div>
            </div>
            
            <div className="space-y-2">
              <button 
                onClick={() => setIsApproved(!isApproved)}
                className={cn(
                  "w-full py-4 rounded-2xl text-sm font-black uppercase tracking-tighter transition-all flex items-center justify-center gap-3 border-2 shadow-xl",
                  isApproved 
                    ? "bg-green-500 border-green-400 text-black shadow-green-500/20" 
                    : "bg-[#1a1d23] border-[#2d333b] text-[#94a3b8] hover:border-amber-500/50"
                )}
              >
                {isApproved ? (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    Aprobat de client
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-5 h-5" />
                    Așteaptă aprobare
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Section 5: Quick Mockups */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/20 text-amber-500 text-[10px] font-bold">5</span>
              <div className="flex items-center gap-2 text-xs font-semibold text-[#94a3b8] uppercase tracking-widest">
                <Sparkles className="w-3 h-3" />
                <span>Quick Mockups</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {MOCKUP_TYPES.map(m => (
                <button 
                  key={m.id}
                  onClick={() => { setMockupType(m.id as MockupType); setShowMockup(true); }}
                  className="flex items-center gap-3 p-2.5 bg-[#1a1d23] border border-[#2d333b] rounded-xl hover:border-amber-500/50 hover:bg-amber-500/5 transition-all group"
                >
                  <div className="w-8 h-8 rounded-lg bg-[#2d333b] flex items-center justify-center group-hover:bg-amber-500/20 transition-colors shrink-0">
                    <m.icon className="w-4 h-4 text-[#94a3b8] group-hover:text-amber-500" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-tight text-[#94a3b8] group-hover:text-white transition-colors">{m.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-[#2d333b] bg-[#0d1117]/50">
          <button 
            onClick={() => {
              setMobileSidebarOpen(false);
              handleDownload();
            }}
            disabled={!file || isProcessing}
            className="w-full py-4 bg-amber-500 text-black rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-amber-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-500/20 flex items-center justify-center gap-3"
          >
            {isProcessing ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <Download className="w-5 h-5" />
            )}
            Generate Print File
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="z-10 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-[#2d333b] bg-[#16191e]/50 px-3 backdrop-blur-md sm:h-16 sm:px-4 lg:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-medium sm:gap-2 sm:text-sm">
            <button
              type="button"
              className="flex shrink-0 items-center justify-center rounded-lg p-2 text-[#94a3b8] hover:bg-white/5 hover:text-white lg:hidden"
              aria-label="Deschide setările print"
              onClick={() => setMobileSidebarOpen(true)}
            >
              <PanelLeft className="h-5 w-5" />
            </button>
            <span className="hidden shrink-0 text-[#94a3b8] sm:inline">Workspace</span>
            <ChevronRight className="hidden h-4 w-4 shrink-0 text-[#2d333b] sm:block" />
            <span className="min-w-0 truncate text-white" title={file ? file.name : undefined}>
              {file ? file.name : "Niciun fișier"}
            </span>
          </div>
          
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-3 lg:gap-4">
            {user && (
              <div className="flex items-center gap-1 sm:gap-3">
                <button 
                  onClick={() => setShowHistory(!showHistory)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-medium transition-colors sm:gap-2 sm:px-3 sm:text-xs",
                    showHistory ? "bg-amber-500 text-black" : "bg-[#2d333b] text-[#94a3b8] hover:text-white"
                  )}
                >
                  <History className="h-3 w-3 shrink-0" />
                  <span className="hidden sm:inline">History</span>
                </button>
                <div className="hidden h-8 w-px bg-[#2d333b] sm:block" />
                <button 
                  onClick={handleSelectKey}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-semibold transition-all sm:gap-2 sm:px-4 sm:py-2",
                    hasKey 
                      ? "border-green-500/20 bg-green-500/10 text-green-500" 
                      : "animate-pulse border-red-500/20 bg-red-500/10 text-red-500"
                  )}
                >
                  <Key className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline">{hasKey ? "API Key Active" : "Select API Key"}</span>
                </button>
              </div>
            )}

            <button 
              onClick={startListening}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-semibold transition-all sm:gap-2 sm:px-4 sm:py-2",
                isListening 
                  ? "animate-pulse border-red-500/20 bg-red-500/10 text-red-500" 
                  : "border-amber-500/20 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
              )}
            >
              <Mic className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Voice Assistant</span>
            </button>
          </div>
        </header>

        {/* Editor Area */}
        <div className="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto p-4 custom-scrollbar sm:p-6 lg:flex-row lg:gap-6 lg:p-8">
          {showHistory && user && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[45] flex flex-col gap-4 border-0 bg-[#0d1117]/98 p-6 backdrop-blur-sm lg:relative lg:inset-auto lg:z-auto lg:w-[300px] lg:max-w-[300px] lg:shrink-0 lg:border-r lg:border-[#2d333b] lg:bg-transparent lg:p-0 lg:pr-8"
            >
              <div className="flex items-center justify-between gap-3 border-b border-[#2d333b] pb-4 lg:border-0 lg:pb-0">
                <h3 className="text-sm font-bold uppercase tracking-widest text-[#94a3b8]">Recent History</h3>
                <button
                  type="button"
                  onClick={() => setShowHistory(false)}
                  className="rounded-lg p-2 text-[#94a3b8] hover:bg-white/5 hover:text-white"
                  aria-label="Închide istoricul"
                >
                  <X className="h-5 w-5 lg:h-4 lg:w-4" />
                </button>
              </div>
              <div className="space-y-3">
                {history.map(item => (
                  <div key={item.id} className="p-3 bg-[#1a1d23] border border-[#2d333b] rounded-xl space-y-1 group">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold truncate flex-1">{item.fileName}</p>
                      {item.isApproved && (
                        <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-[#94a3b8]">
                      <span>{item.format}</span>
                      <span>{item.timestamp?.toDate ? new Date(item.timestamp.toDate()).toLocaleDateString() : 'Recent'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          <div className="mx-auto flex min-h-0 w-full max-w-[88rem] flex-1 flex-col-reverse gap-6 lg:flex-col lg:gap-8">
            {/* Top Row: Dropzone & Analysis */}
            <div className="grid h-auto min-h-[200px] grid-cols-1 gap-4 sm:min-h-[280px] sm:gap-6 lg:h-[400px] lg:min-h-[400px] lg:grid-cols-2 lg:gap-8">
              <div 
                {...getRootProps()} 
                className={cn(
                  "relative border-2 border-dashed rounded-3xl flex flex-col items-center justify-center gap-4 transition-all cursor-pointer group overflow-hidden",
                  isDragActive 
                    ? "border-amber-500 bg-amber-500/5" 
                    : file 
                      ? "border-[#2d333b] bg-[#16191e]" 
                      : "border-[#2d333b] hover:border-amber-500/50 hover:bg-amber-500/5"
                )}
              >
                <input {...getInputProps()} />
                {previewUrl ? (
                  <>
                    <img 
                      src={previewUrl} 
                      alt="Preview" 
                      className={cn(
                        "absolute inset-0 w-full h-full object-cover opacity-20 blur-sm",
                        settings.simulateCMYK && "simulate-cmyk"
                      )} 
                    />
                    <div className="relative z-10 flex flex-col items-center gap-4">
                      <div className="w-20 h-20 rounded-2xl bg-amber-500 flex items-center justify-center shadow-xl shadow-amber-500/20">
                        <FileText className="w-10 h-10 text-black" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-bold">{file?.name}</p>
                        <p className="text-xs text-[#94a3b8]">{(file?.size || 0) / 1024 / 1024 < 1 ? `${((file?.size || 0) / 1024).toFixed(1)} KB` : `${((file?.size || 0) / 1024 / 1024).toFixed(1)} MB`}</p>
                      </div>
                      <button className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold uppercase transition-colors">Change File</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-20 h-20 rounded-2xl bg-[#1a1d23] flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Upload className="w-10 h-10 text-[#2d333b] group-hover:text-amber-500" />
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold">Drop your print file here</p>
                      <p className="text-sm text-[#94a3b8]">PDF, PNG, JPG or WebP (Max 50MB)</p>
                    </div>
                  </>
                )}
              </div>

              <div className="bg-[#16191e] border border-[#2d333b] rounded-3xl p-4 sm:p-6 flex flex-col gap-4 sm:gap-6">
                <div className="flex flex-col items-center justify-between gap-4 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-3 text-center sm:text-left">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                      <Zap className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold uppercase tracking-widest">AI Print Analysis</h3>
                      <p className="text-[10px] text-[#94a3b8]">Quality & Compliance Check</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleAIAnalysis()}
                    disabled={!file || isAnalyzing}
                    className="w-full shrink-0 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold uppercase text-black transition-colors hover:bg-amber-600 disabled:opacity-50 sm:w-auto"
                  >
                    {isAnalyzing ? "Analyzing..." : "Run Check"}
                  </button>
                </div>

                <div className="flex-1 bg-[#0d1117] rounded-2xl border border-[#2d333b] p-4 overflow-y-auto custom-scrollbar">
                  {analysis ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[#94a3b8]">Estimated Quality</span>
                        <span className={cn(
                          "px-2 py-1 rounded text-[10px] font-bold uppercase",
                          analysis.currentEstimatedQuality === 'high' ? "bg-green-500/20 text-green-500" :
                          analysis.currentEstimatedQuality === 'medium' ? "bg-amber-500/20 text-amber-500" : "bg-red-500/20 text-red-500"
                        )}>
                          {analysis.currentEstimatedQuality}
                        </span>
                      </div>
                      
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold uppercase text-[#94a3b8]">Issues Detected</p>
                        {analysis.issues.length > 0 ? (
                          analysis.issues.map((issue: string, i: number) => (
                            <div key={i} className="flex items-center gap-2 text-xs text-red-400">
                              <AlertCircle className="w-3 h-3" />
                              {issue}
                            </div>
                          ))
                        ) : (
                          <div className="flex items-center gap-2 text-xs text-green-500">
                            <CheckCircle2 className="w-3 h-3" />
                            No critical issues found
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <p className="text-[10px] font-bold uppercase text-[#94a3b8]">Recommendations</p>
                        {analysis.recommendations.map((rec: string, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-[#94a3b8]">
                            <ChevronRight className="w-3 h-3 mt-0.5 shrink-0" />
                            {rec}
                          </div>
                        ))}
                      </div>

                      {analysis.canUpscaleHelp && (
                        <button 
                          onClick={handleUpscale}
                          className="w-full py-2 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-lg text-[10px] font-bold uppercase hover:bg-amber-500/20 transition-colors"
                        >
                          Upscale to fix resolution
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center gap-3 opacity-30">
                      <Search className="w-8 h-8" />
                      <p className="text-xs">Upload a file and run check to see analysis</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Row: Preview & Tools */}
            <div className="grid min-h-[min(55vh,480px)] flex-1 grid-cols-1 gap-6 sm:gap-8 lg:min-h-[500px] lg:grid-cols-3">
              <div className="flex flex-col gap-4 rounded-3xl border border-[#2d333b] bg-[#16191e] p-4 sm:gap-6 sm:p-6 lg:col-span-2">
                <div className="flex flex-col items-center justify-between gap-4 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-3 text-center sm:text-left">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20">
                      <Eye className="h-5 w-5 text-amber-500" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold uppercase tracking-widest">Print-Ready Preview</h3>
                      <p className="text-[10px] text-[#94a3b8]">Visualization with Bleed & Safe Zones</p>
                    </div>
                  </div>
                  <div className="flex w-full flex-wrap items-center justify-center gap-2 sm:w-auto sm:justify-end">
                    <button 
                      onClick={() => setSettings(prev => ({ ...prev, showGuides: !prev.showGuides }))}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-bold transition-all border",
                        settings.showGuides ? "bg-amber-500 text-black" : "bg-white/5 border-white/10 text-[#94a3b8]"
                      )}
                    >
                      Guides
                    </button>
                    <button 
                      onClick={handleDownload}
                      className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      PDF
                    </button>
                  </div>
                </div>

                <div className="relative flex flex-1 items-center justify-center overflow-y-auto overflow-hidden rounded-2xl border border-[#2d333b] bg-[#0d1117] p-3 sm:p-8">
                  {processedUrl ? (
                    <div 
                      className="relative group shadow-[0_20px_50px_rgba(0,0,0,0.5)] bg-white transition-all duration-500"
                      style={{ 
                        aspectRatio: (() => {
                          const f = PRINT_FORMATS.find(fmt => fmt.id === settings.formatId);
                          const w = settings.formatId === 'custom' ? (settings.customWidth || 1) : (f?.width || 1);
                          const h = settings.formatId === 'custom' ? (settings.customHeight || 1) : (f?.height || 1);
                          return `${w} / ${h}`;
                        })(),
                        maxHeight: '100%',
                        maxWidth: '100%',
                        width: 'auto',
                        height: 'auto'
                      }}
                    >
                      {totalPages > 1 && (
                        <div className="absolute left-2 top-2 z-50 flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#1a1d23]/80 px-2 py-1 backdrop-blur-md sm:left-4 sm:top-4 sm:gap-2 sm:px-3 sm:py-1.5">
                          <button 
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="p-1 hover:bg-white/10 rounded-lg disabled:opacity-30 transition-colors"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <span className="text-[10px] font-bold text-[#94a3b8] min-w-[3rem] text-center">
                            Page {currentPage} / {totalPages}
                          </span>
                          <button 
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="p-1 hover:bg-white/10 rounded-lg disabled:opacity-30 transition-colors"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      )}
 
                      <img 
                        ref={imgRef}
                        src={processedUrl} 
                        alt="Processed" 
                        className={cn(
                          "w-full h-full object-cover transition-all duration-300",
                          settings.simulateCMYK && "simulate-cmyk"
                        )}
                      />
                      
                      {/* Floating: mod upscale + acțiuni AI */}
                      <div className="absolute bottom-2 left-1/2 z-50 flex max-w-[calc(100%-0.5rem)] -translate-x-1/2 flex-col items-center gap-1.5 transition-all duration-300 group-hover:bottom-4 sm:bottom-4 sm:gap-2 sm:group-hover:bottom-6">
                        <div
                          className="flex flex-wrap items-center justify-center gap-1 rounded-xl border border-white/10 bg-[#0d1117]/95 px-1.5 py-1 shadow-lg backdrop-blur-md sm:gap-1.5 sm:px-2 sm:py-1.5"
                          title="Modul se aplică la „AI Upscale” (nu la Imposition / AI Bleed)"
                        >
                          <span className="text-[8px] font-bold uppercase tracking-wider text-[#64748b] shrink-0">
                            Upscale
                          </span>
                          <button
                            type="button"
                            onClick={() => setSettings((s) => ({ ...s, upscaleMode: "extend" }))}
                            className={cn(
                              "rounded-lg px-2 py-1 text-[9px] font-bold uppercase transition-colors",
                              (settings.upscaleMode ?? "extend") === "extend"
                                ? "bg-emerald-500/25 text-emerald-400 ring-1 ring-emerald-500/40"
                                : "text-[#94a3b8] hover:bg-white/5"
                            )}
                          >
                            Extend
                          </button>
                          <button
                            type="button"
                            onClick={() => setSettings((s) => ({ ...s, upscaleMode: "recompose" }))}
                            className={cn(
                              "rounded-lg px-2 py-1 text-[9px] font-bold uppercase transition-colors",
                              settings.upscaleMode === "recompose"
                                ? "bg-emerald-500/25 text-emerald-400 ring-1 ring-emerald-500/40"
                                : "text-[#94a3b8] hover:bg-white/5"
                            )}
                          >
                            Recomp.
                          </button>
                        </div>

                        <div className="flex max-w-full flex-wrap items-center justify-center gap-0.5 rounded-2xl border border-white/10 bg-[#1a1d23]/90 p-0.5 shadow-[0_8px_32px_rgba(0,0,0,0.8)] backdrop-blur-xl sm:gap-1 sm:p-1 sm:group-hover:scale-105">
                        <button 
                          onClick={handleImposition}
                          disabled={isProcessing}
                          className="flex min-w-0 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[8px] font-bold uppercase tracking-wider text-[#94a3b8] transition-colors hover:bg-amber-500/10 hover:text-amber-500 disabled:opacity-50 sm:px-4 sm:py-2 sm:text-[9px]"
                        >
                          {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <LayoutGrid className="w-4 h-4" />}
                          <span>Imposition</span>
                        </button>
                        <div className="mx-0.5 h-6 w-px bg-white/5 sm:mx-1 sm:h-8" />
                        <button 
                          onClick={handleUpscale}
                          disabled={isProcessing}
                          className="flex min-w-0 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[8px] font-bold uppercase tracking-wider text-[#94a3b8] transition-colors hover:bg-emerald-500/10 hover:text-emerald-500 disabled:opacity-50 sm:px-4 sm:py-2 sm:text-[9px]"
                        >
                          {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUpCircle className="w-4 h-4" />}
                          <span>AI Upscale</span>
                        </button>
                        <div className="mx-0.5 h-6 w-px bg-white/5 sm:mx-1 sm:h-8" />
                        <button 
                          onClick={handleGenerativeFill}
                          disabled={isProcessing}
                          className="flex min-w-0 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[8px] font-bold uppercase tracking-wider text-[#94a3b8] transition-colors hover:bg-blue-500/10 hover:text-blue-500 disabled:opacity-50 sm:px-4 sm:py-2 sm:text-[9px]"
                        >
                          {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                          <span>AI Bleed</span>
                        </button>
                        </div>
                      </div>

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
                    </div>
                  ) : (
                    <div className="text-center space-y-4 opacity-30">
                      <ImageIcon className="w-12 h-12 mx-auto" />
                      <p className="text-sm">Upload a file to see preview</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col overflow-hidden rounded-3xl border border-[#2d333b] bg-[#16191e]">
                <div className="flex flex-col items-center gap-3 border-b border-[#2d333b] p-4 text-center sm:flex-row sm:p-6 sm:text-left">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20">
                    <Mic className="h-5 w-5 text-amber-500" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold uppercase tracking-widest">AI Print Agent</h3>
                    <p className="text-[10px] text-[#94a3b8]">Voice & Text Assistant</p>
                  </div>
                </div>

                <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto bg-[#0d1117]/30 p-4 sm:p-6">
                  {chatMessages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center gap-4 opacity-30 px-8">
                      <div className="w-16 h-16 rounded-full bg-[#1a1d23] flex items-center justify-center">
                        <Mic className="w-8 h-8" />
                      </div>
                      <p className="text-xs">"Setează formatul A3 și adaugă 3mm bleed"</p>
                      <p className="text-[10px]">Try asking me to configure your print settings or process the file.</p>
                    </div>
                  )}
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={cn(
                      "flex flex-col gap-1 max-w-[85%]",
                      msg.role === 'user' ? "ml-auto items-end" : "items-start"
                    )}>
                      <div className={cn(
                        "px-4 py-2.5 rounded-2xl text-xs leading-relaxed shadow-sm",
                        msg.role === 'user' 
                          ? "bg-amber-500 text-black font-medium rounded-tr-none" 
                          : "bg-[#1a1d23] border border-[#2d333b] text-[#e6edf3] rounded-tl-none"
                      )}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {isTyping && (
                    <div className="flex items-center gap-1 px-4 py-2 bg-[#1a1d23] border border-[#2d333b] rounded-2xl rounded-tl-none w-16">
                      <div className="w-1 h-1 bg-amber-500 rounded-full animate-bounce" />
                      <div className="w-1 h-1 bg-amber-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                      <div className="w-1 h-1 bg-amber-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                    </div>
                  )}
                </div>

                <div className="p-4 bg-[#16191e] border-t border-[#2d333b]">
                  <div className="relative">
                    <input 
                      ref={agentInputRef}
                      type="text" 
                      placeholder="Ask the AI agent..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSendMessage(e.currentTarget.value);
                          e.currentTarget.value = '';
                        }
                      }}
                      className="w-full bg-[#1a1d23] border border-[#2d333b] rounded-2xl px-4 py-3 pr-12 text-sm focus:outline-none focus:border-amber-500 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const el = agentInputRef.current;
                        if (!el) return;
                        handleSendMessage(el.value);
                        el.value = '';
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-[#94a3b8] hover:text-amber-500 transition-colors"
                      aria-label="Send message"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <AnimatePresence>
        {showMockup && processedUrl && (
          <MockupViewer 
            designImage={processedUrl}
            onClose={() => setShowMockup(false)}
            initialType={mockupType}
            hasKey={hasKey}
            handleSelectKey={handleSelectKey}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
