const fs = require("fs");
const path = require("path");
const appPath = path.join(__dirname, "../src/App.tsx");
const lines = fs.readFileSync(appPath, "utf8").split("\n");

function slice1(a, b) {
  return lines.slice(a - 1, b).join("\n");
}

// L114–122: file … isUpscaleNeeded (skip user L112-113)
const headState = lines.slice(113, 122).join("\n");
// L123–162: rest through refs (includes showHistory, drops history if we skip L124-125)
const midState = lines.slice(122, 162).join("\n"); // 123-162 in 1-based = index 122-161

const handleSelect = slice1(206, 225);
const handleDownload = slice1(367, 447);
const handleImposition = slice1(449, 533);
const handleAIAnalysis = slice1(535, 593);
const handleUpscale = slice1(595, 629);
const handleGenerativeFill = slice1(631, 655);
const handleTrace = slice1(657, 669);
const handleSendMessage = slice1(688, 719);

const renderPDFPage = slice1(227, 257).replace("}, []);", "}, [handleAIAnalysis]);");
const pdfEffect = slice1(259, 263);
const rasterizeToPNG = slice1(265, 292);
const onDrop = slice1(294, 365);
const dropzone = slice1(358, 365); // wait 358-365 is useDropzone - check

const useDropzoneBlock = slice1(358, 365);

const startListening = slice1(671, 686);

const header = `import { useCallback, useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import ImageTracer from "imagetracerjs";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { User as FirebaseUser } from "firebase/auth";
import { db, handleFirestoreError, OperationType } from "../../firebase";
import { hasAnyAiKeyConfigured } from "../../lib/aiKeys";
import {
  PRINT_FORMATS,
  type HistoryItem,
  type MockupType,
  type ProcessingSettings,
  Unit,
} from "../../types";
import { generateImpositionPDF, generatePrintPDF } from "../../services/pdf";
import {
  analyzePrintQuality,
  generativeFill,
  generateSpeech,
  processAgentMessage,
  upscaleImage,
} from "../../services/gemini";
import { DEFAULT_PRINT_SETTINGS } from "./defaultPrintSettings";

export type PrintWorkspaceModel = ReturnType<typeof usePrintWorkspace>;

export function usePrintWorkspace(opts: {
  user: FirebaseUser | null;
  history: HistoryItem[];
}) {
  const { user, history } = opts;
`;

const footer = `
  return {
    file,
    setFile,
    originalBuffer,
    previewUrl,
    processedUrl,
    originalDimensions,
    isUpscaleNeeded,
    isProcessing,
    isAnalyzing,
    analysis,
    tracedSvg,
    showMockup,
    setShowMockup,
    mockupType,
    setMockupType,
    showHistory,
    setShowHistory,
    history,
    hasKey,
    isListening,
    chatMessages,
    isTyping,
    isApproved,
    setIsApproved,
    totalPages,
    currentPage,
    setCurrentPage,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    settings,
    setSettings,
    imgRef,
    agentInputRef,
    handleSelectKey,
    handleDownload,
    handleImposition,
    handleAIAnalysis,
    handleUpscale,
    handleGenerativeFill,
    handleTrace,
    startListening,
    handleSendMessage,
    getRootProps,
    getInputProps,
    isDragActive,
  };
}
`;

// handleAIAnalysis must be useCallback before renderPDFPage - we'll inject
const handleAIWrapped = `  const handleAIAnalysis = useCallback(async (urlOverride?: string) => {
${slice1(536, 592)
    .replace("  const handleAIAnalysis = async (urlOverride?: string) => {", "")
    .replace(/^\s*}\s*;\s*$/, "")}
  }, [settings, previewUrl]);`;

const renderFixed = `  const renderPDFPage = useCallback(async (buffer: ArrayBuffer, pageNum: number) => {
${slice1(228, 256)
    .replace("  const renderPDFPage = useCallback(async (buffer: ArrayBuffer, pageNum: number) => {", "")
    .replace(/\s*\}, \[\]\);\s*$/, "")}
  }, [handleAIAnalysis]);`;

const out = [
  header,
  headState,
  midState.replace(
    "  const [settings, setSettings] = useState<ProcessingSettings>({",
    "  const [settings, setSettings] = useState<ProcessingSettings>({ ...DEFAULT_PRINT_SETTINGS, "
  ),
  // fix duplicate - actually replace whole settings init with useState(DEFAULT_PRINT_SETTINGS)
];

// Simpler: use DEFAULT_PRINT_SETTINGS entirely
const stateWithDefaults = [
  headState,
  "  const [settings, setSettings] = useState<ProcessingSettings>(DEFAULT_PRINT_SETTINGS);",
  lines.slice(160, 162).join("\n"),
].join("\n");

const full = [
  header,
  headState,
  "  const [settings, setSettings] = useState<ProcessingSettings>(DEFAULT_PRINT_SETTINGS);",
  lines.slice(160, 162).join("\n"),
  "  // API Key",
  slice1(202, 204),
  handleSelect,
  handleAIWrapped,
  renderFixed,
  pdfEffect,
  rasterizeToPNG,
  onDrop.replace("}, [renderPDFPage]);", "}, [renderPDFPage, rasterizeToPNG, settings, handleAIAnalysis, handleUpscale]);"),
  useDropzoneBlock,
  handleDownload,
  handleImposition,
  handleUpscale,
  handleGenerativeFill,
  handleTrace,
  startListening,
  handleSendMessage,
  footer,
].join("\n");

// Fix broken replacements - manual edit simpler: output raw slices for hand merge

fs.writeFileSync(
  path.join(__dirname, "../src/features/print-workspace/usePrintWorkspace.RAW.ts"),
  full
);
console.log("Wrote usePrintWorkspace.RAW.ts (likely needs hand fix)");
