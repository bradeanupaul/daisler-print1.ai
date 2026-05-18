import { GoogleGenAI, Type, Modality } from "@google/genai";
import {
  preferOpenAI,
  resolveGeminiApiKey,
  hasGeminiKeyConfigured,
  hasOpenAIKeyConfigured,
} from "../lib/aiKeys";
import { loadAiAppSettings } from "../lib/aiAppSettings";
import { aiError, aiLog } from "../lib/aiUpscaleLog";
import { addAlgorithmicBleed, type PrintLayoutMm } from "../lib/printLayoutPostProcess";
import { buildUpscalePrompt, type ExtendMarginBands } from "../lib/aiUpscalePrompts";
import {
  resolveGeminiImageModel,
  resolveGeminiImageModelForUpscale,
} from "../lib/geminiImageConfig";
import { resolveGeminiTextModel } from "../lib/geminiTextConfig";
import { resolvePrintGenerationProfile } from "../lib/printGenerationProfile";
import type { ProcessingStageReporter } from "../lib/processingStage";
import { prefixProcessingReporter } from "../lib/processingStage";
import {
  resolveImageForGemini,
  ensureImageDataUrl,
  prepareImageForAiUpscale,
} from "../lib/imageDataUrl";
import {
  composeExtendOutpaintCanvas,
  composeRecomposeCanvasForGemini,
  pickUpscaleNetCanvasPixels,
} from "../lib/upscaleCompose";
import type { UpscaleMode } from "../types";
import * as openaiPrint from "./openaiPrint";
import { pickGeminiAspectRatio } from "../lib/geminiAspectRatio";
import { geminiImageWithQualityLoop } from "./geminiImageQuality";

const getAI = () => {
  const apiKey = resolveGeminiApiKey();
  return new GoogleGenAI({ apiKey });
};

async function geminiInlineImage(imageUrl: string) {
  const { mimeType, data } = await resolveImageForGemini(imageUrl);
  return { inlineData: { data, mimeType } };
}

export async function processAgentMessage(message: string, currentSettings: any, hasFile: boolean) {
  if (preferOpenAI()) {
    return openaiPrint.processAgentMessage(message, currentSettings, hasFile);
  }
  const ai = getAI();
  const model = resolveGeminiTextModel();

  const prompt = `
    You are an AI Print Agent for print1.ai Print Processor. 
    Your goal is to help users prepare their files for printing.
    
    Current Settings: ${JSON.stringify(currentSettings)}
    Has File Uploaded: ${hasFile}
    
    Available Formats: business-card (90x50mm), a4 (210x297mm), a3 (297x420mm), a5 (148x210mm), banner-100-200 (1000x2000mm), mug-wrap (200x90mm), sticker (100x100mm).
    
    Bleed Logic: 
    - Bleed is generated OUTSIDE the target format.
    - If user says 100x100mm with 3mm bleed, the output is 106x106mm.
    - We support "CutContour" detection for stickers.
    
    Instructions:
    1. Parse the user's intent from their message (Romanian language expert).
    2. If they mention a format (e.g., "sticker", "autocolant", "poster", "A3", "cana", "carte de vizita", "fluturas", "flyer"), update the formatId.
    3. If they mention DPI (e.g., "300 DPI", "calitate mare", "rezolutie"), update the dpi.
    4. If they mention bleed or cutline (e.g., "3mm cutline", "margine de taiere", "aduna bleed", "cut contour"), update the bleed and/or addCutLine.
    5. If they mention safe margin (e.g., "zona de siguranta", "marginile", "sa nu se taie"), update safeMargin.
    6. If they say "go", "start", "proceseaza", "da-i drumul", set action to "process".
    7. If they say "upscale", "imbunatateste", "mareste rezolutia", "claritate", set action to "upscale".
    8. If they haven't uploaded a file and want to start, set action to "request_file".
    9. If they want to download (e.g., "descarca", "da-mi fisierul", "PDF", "salveaza"), set action to "download".
    10. If they mention imposition (e.g., "impozare", "multiplica-le", "pune pe coala", "umple foaia"), set action to "imposition".
    11. If they mention CMYK/Print simulation (e.g., "vezi cum iese la print", "fara neon", "culori print"), update simulateCMYK.
    12. If they ask for a combined action (e.g., "seteaza A3 si descarca"), include both the settingsUpdate and the action.
    
    Return a JSON response with:
    - reply: A friendly, concise response in Romanian.
    - settingsUpdate: An object with keys to update in settings (e.g., { formatId: "a3", dpi: 300, bleed: 3, simulateCMYK: true }).
    - action: "process" | "download" | "request_file" | "upscale" | "imposition" | "none"
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: message }] }],
      config: {
        systemInstruction: prompt,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reply: { type: Type.STRING },
            settingsUpdate: { 
              type: Type.OBJECT,
              properties: {
                formatId: { type: Type.STRING },
                dpi: { type: Type.NUMBER },
                bleed: { type: Type.NUMBER },
                safeMargin: { type: Type.NUMBER },
                addCutLine: { type: Type.BOOLEAN },
                simulateCMYK: { type: Type.BOOLEAN }
              }
            },
            action: { type: Type.STRING, enum: ["process", "download", "request_file", "upscale", "imposition", "none"] }
          },
          required: ["reply", "action"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("Empty response from AI");
    return JSON.parse(text);
  } catch (error) {
    console.error("AI Agent failed:", error);
    return { reply: "Îmi pare rău, am întâmpinat o problemă tehnică. Te rog să încerci din nou.", action: "none" };
  }
}

export async function generateSpeech(text: string) {
  if (preferOpenAI()) {
    return openaiPrint.generateSpeech(text);
  }
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: `Say naturally in Romanian: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      return base64Audio;
    }
    return null;
  } catch (error) {
    console.error("TTS failed:", error);
    return null;
  }
}

export async function analyzePrintQuality(imageData: string, targetDpi: number, targetWidthMm: number, targetHeightMm: number) {
  if (preferOpenAI()) {
    return openaiPrint.analyzePrintQuality(imageData, targetDpi, targetWidthMm, targetHeightMm);
  }
  const ai = getAI();
  const model = resolveGeminiTextModel();

  const prompt = `
    Analyze this image for print quality. 
    Target: ${targetWidthMm}x${targetHeightMm}mm at ${targetDpi} DPI.
    
    Provide a JSON response with:
    - currentEstimatedQuality: "low" | "medium" | "high"
    - issues: string[] (e.g., "Low resolution", "Blurry edges", "Text too close to edge")
    - recommendations: string[]
    - canUpscaleHelp: boolean
    - colorWarnings: Array<{ color: string, reason: string }> (e.g., { color: "#00ff00", reason: "Out of CMYK gamut" })
    - boundingBoxes: Array<{ box_2d: [number, number, number, number], label: string }> (coordinates in 0-1000 scale: [ymin, xmin, ymax, xmax])

    For issues and recommendations: be specific and technical (DPI, margins, blur, gamut, legibility). Do not output vague one-word judgments alone such as "slab", "slabă", "bun", "bon", "prost", "ok" — always tie statements to observable facts.
  `;

  try {
    const imagePart = await geminiInlineImage(imageData);
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          parts: [{ text: prompt }, imagePart],
        },
      ],
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text;
    if (!text) throw new Error("Empty response from AI");
    
    // Clean JSON if needed (sometimes AI wraps it in markdown blocks)
    const cleanJson = text.replace(/```json\n?|\n?```/g, '').trim();
    const result = JSON.parse(cleanJson);
    
    // Ensure basic structure
    return {
      currentEstimatedQuality: result.currentEstimatedQuality || 'medium',
      issues: result.issues || [],
      recommendations: result.recommendations || [],
      canUpscaleHelp: !!result.canUpscaleHelp,
      colorWarnings: result.colorWarnings || [],
      boundingBoxes: result.boundingBoxes || []
    };
  } catch (error: unknown) {
    console.error("AI Analysis failed:", error);
    throw error;
  }
}

export type UpscaleGenerationResult =
  | { kind: "single"; imageUrl: string; provider: "gemini" | "openai" }
  | {
      kind: "dual";
      gemini: { imageUrl: string | null; error?: string };
      openai: { imageUrl: string | null; error?: string };
    };

/** Același contract pentru upscale, generative bleed, etc. */
export type AiReconstructedImageResult = UpscaleGenerationResult;

async function runDebugDualImageCompare(
  geminiTask: Promise<string | null>,
  openaiTask: Promise<string | null>
): Promise<{
  gemini: { imageUrl: string | null; error?: string };
  openai: { imageUrl: string | null; error?: string };
}> {
  const wrap = (p: Promise<string | null>) =>
    p.then(
      (url) => ({ imageUrl: url, error: undefined as string | undefined }),
      (e: unknown) => ({
        imageUrl: null as string | null,
        error: e instanceof Error ? e.message : String(e),
      })
    );
  const [gemini, openai] = await Promise.all([wrap(geminiTask), wrap(openaiTask)]);
  return { gemini, openai };
}

async function upscaleImageGemini(
  imageData: string,
  netW: number,
  netH: number,
  formatName: string,
  mode: UpscaleMode = "extend",
  reporter?: ProcessingStageReporter,
  targetDpi?: number,
  safeMarginMm = 0,
  bleedMm = 0,
): Promise<string | null> {
  const profile = resolvePrintGenerationProfile(targetDpi);
  const model = resolveGeminiImageModelForUpscale(mode);
  const { width: cw, height: ch } = pickUpscaleNetCanvasPixels(netW, netH, targetDpi);
  const aspectRatio = pickGeminiAspectRatio(cw, ch);

  aiLog("gemini upscale start", { model, mode, netW, netH, targetDpi, safeMarginMm, bleedMm, canvas: { cw, ch } });

  reporter?.stage("Gemini: pregătesc imaginea…");
  const originalDataUrl = await prepareImageForAiUpscale(imageData);
  let inputDataUrl = originalDataUrl;
  let extendBands: ExtendMarginBands = "minimal";
  const promptCtx = { formatName, netW, netH, safeMarginMm, bleedMm };

  if (mode === "recompose") {
    reporter?.stage(`Gemini: canvas recompose ${cw}×${ch}px…`);
    inputDataUrl = await composeRecomposeCanvasForGemini(inputDataUrl, cw, ch);
  } else {
    reporter?.stage(`Gemini: canvas extend ${cw}×${ch}px…`);
    const composed = await composeExtendOutpaintCanvas(inputDataUrl, cw, ch);
    inputDataUrl = composed.dataUrl;
    extendBands = composed.bands;
  }

  const prompt =
    mode === "extend"
      ? buildUpscalePrompt("extend", {
          ...promptCtx,
          canvasPxW: cw,
          canvasPxH: ch,
          bands: extendBands,
        })
      : buildUpscalePrompt("recompose", {
          ...promptCtx,
          canvasPxW: cw,
          canvasPxH: ch,
        });

  try {
    const url = await geminiImageWithQualityLoop({
      editSourceDataUrl: inputDataUrl,
      basePrompt: prompt,
      imageConfig: { aspectRatio, imageSize: profile.geminiImageSize },
      critique: { mode, intentSummary: prompt, originalImageUrl: originalDataUrl },
      reporter,
      targetDpi,
      providerLabel: `Gemini (${model})`,
      forcedImageModel: model,
    });
    aiLog("gemini upscale done", { hasUrl: Boolean(url) });
    return url;
  } catch (error) {
    aiError("gemini upscale failed", error);
    throw error;
  }
}

/** Upscale: furnizor principal din Setări AI, fallback la celălalt; opțional comparare duală. */
export async function upscaleImage(
  imageData: string,
  netW: number,
  netH: number,
  formatName: string,
  mode: UpscaleMode = "extend",
  reporter?: ProcessingStageReporter,
  targetDpi?: number,
  safeMarginMm = 0,
  bleedMm = 0,
): Promise<UpscaleGenerationResult> {
  const app = loadAiAppSettings();
  const gOk = hasGeminiKeyConfigured();
  const oOk = hasOpenAIKeyConfigured();

  aiLog("upscaleImage route", {
    primary: app.primaryImageProvider,
    debugDual: app.debugCompareImageModels,
    gOk,
    oOk,
    mode,
    netW,
    netH,
    targetDpi,
    safeMarginMm,
    bleedMm,
  });

  if (!gOk && !oOk) {
    throw new Error("Nu există cheie API. Adaugă Gemini sau OpenAI în setări.");
  }

  if (app.debugCompareImageModels && gOk && oOk) {
    reporter?.stage("Generez în paralel: Gemini + OpenAI (ambele rulează)…");
    const geminiReporter = prefixProcessingReporter(reporter, "Gemini");
    const openaiReporter = prefixProcessingReporter(reporter, "OpenAI");
    const { gemini, openai } = await runDebugDualImageCompare(
      upscaleImageGemini(
        imageData,
        netW,
        netH,
        formatName,
        mode,
        geminiReporter,
        targetDpi,
        safeMarginMm,
        bleedMm,
      ),
      openaiPrint.upscaleImage(
        imageData,
        netW,
        netH,
        formatName,
        mode,
        openaiReporter,
        targetDpi,
        safeMarginMm,
        bleedMm,
      ),
    );
    aiLog("dual compare result", {
      geminiOk: Boolean(gemini.imageUrl),
      openaiOk: Boolean(openai.imageUrl),
      geminiErr: gemini.error,
      openaiErr: openai.error,
    });
    return { kind: "dual", gemini, openai };
  }

  const tryOrder: Array<"gemini" | "openai"> =
    app.primaryImageProvider === "openai" ? ["openai", "gemini"] : ["gemini", "openai"];

  let lastErr: unknown;
  for (const provider of tryOrder) {
    if (provider === "gemini" && !gOk) continue;
    if (provider === "openai" && !oOk) continue;
    const label = provider === "gemini" ? "Gemini" : "OpenAI";
    let url: string | null = null;
    try {
      aiLog(`trying ${label}`);
      url =
        provider === "gemini"
          ? await upscaleImageGemini(
              imageData,
              netW,
              netH,
              formatName,
              mode,
              reporter,
              targetDpi,
              safeMarginMm,
              bleedMm,
            )
          : await openaiPrint.upscaleImage(
              imageData,
              netW,
              netH,
              formatName,
              mode,
              reporter,
              targetDpi,
              safeMarginMm,
              bleedMm,
            );
    } catch (e) {
      lastErr = e;
      aiError(`${label} failed`, e);
      reporter?.stage(`${label} eșuat — încerc alt furnizor…`);
      continue;
    }
    if (url) {
      aiLog(`${label} success`);
      return { kind: "single", imageUrl: url, provider };
    }
    lastErr = new Error(`${label}: API fără imagine în răspuns`);
    reporter?.stage(`${label}: răspuns gol — încerc alt furnizor…`);
  }

  if (lastErr instanceof Error) throw lastErr;
  throw new Error("Nu s-a generat nicio imagine. Verifică cotă/cheie API în Setări AI.");
}

export async function generativeFill(
  imageData: string,
  bleedMm: number,
  targetWidthMm: number,
  targetHeightMm: number,
  reporter?: ProcessingStageReporter,
  targetDpi?: number,
): Promise<AiReconstructedImageResult> {
  const layout: PrintLayoutMm = {
    netWidthMm: targetWidthMm,
    netHeightMm: targetHeightMm,
    bleedMm,
    safeMarginMm: 0,
    dpi: targetDpi ?? 300,
  };
  const url = await addAlgorithmicBleed(imageData, layout, reporter?.stage, {
    applySafeZoneFill: false,
  });

  const app = loadAiAppSettings();
  const gOk = hasGeminiKeyConfigured();
  const oOk = hasOpenAIKeyConfigured();

  if (app.debugCompareImageModels && gOk && oOk) {
    reporter?.stage("Bleed algoritmic (fără AI) — același rezultat în ambele coloane.");
    return { kind: "dual", gemini: { imageUrl: url }, openai: { imageUrl: url } };
  }

  return {
    kind: "single",
    imageUrl: url,
    provider: preferOpenAI() ? "openai" : "gemini",
  };
}

/** Rafinare pe o singură imagine (ex. din dialogul de comparare). Un apel Gemini. */
export async function refineGeminiImageFromPrompt(
  imageDataUrl: string,
  userInstruction: string,
  reporter?: ProcessingStageReporter,
  targetDpi?: number,
): Promise<string | null> {
  const prompt = `Edit this image for professional print output. Apply ONLY what the user asks. Keep composition coherent unless they request layout changes. No watermarks.

User instruction:
${userInstruction}`;
  const input = await prepareImageForAiUpscale(imageDataUrl);
  const profile = resolvePrintGenerationProfile(targetDpi);
  const aspectRatio = pickGeminiAspectRatio(210, 297);
  return geminiImageWithQualityLoop({
    editSourceDataUrl: input,
    basePrompt: prompt,
    imageConfig: { aspectRatio, imageSize: profile.geminiImageSize },
    critique: { mode: "recompose", intentSummary: prompt, originalImageUrl: input },
    reporter,
    targetDpi,
  });
}

export type MockupImageProvider = "gemini" | "openai";

export type MockupGenerationResult =
  | { kind: "single"; imageUrl: string; provider: MockupImageProvider }
  | {
      kind: "dual";
      gemini: { imageUrl: string | null; error?: string };
      openai: { imageUrl: string | null; error?: string };
    };

async function generateCustomMockupGemini(
  userPrompt: string,
  designImageData: string,
  apiKey?: string
): Promise<string | null> {
  const ai = apiKey ? new GoogleGenAI({ apiKey }) : getAI();
  const model = resolveGeminiImageModel();

  const systemPrompt = `
    You are an expert product photographer and mockup generator. 
    The user wants to see their design on a specific product described in their message.
    
    User Request: "${userPrompt}"
    
    Instructions:
    1. Generate a highly realistic, professional product photography mockup based on the user's request.
    2. The provided design image MUST be printed directly onto the product.
    3. The design should follow the contours, shadows, and texture of the material perfectly.
    4. Clean background, studio lighting, high resolution.
    5. If the user request is vague, assume a professional studio setting.
  `;

  try {
    const imagePart = await geminiInlineImage(designImageData);
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          parts: [{ text: systemPrompt }, imagePart],
        },
      ],
      config: {
        imageConfig: {
          aspectRatio: "1:1",
        },
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (error: unknown) {
    console.error("Custom Mockup Generation failed (Gemini):", error);
    const msg = error instanceof Error ? error.message : String(error);
    if (
      msg.includes("Requested entity was not found") ||
      msg.includes("API_KEY_INVALID") ||
      msg.toLowerCase().includes("invalid api key")
    ) {
      throw new Error("INVALID_API_KEY");
    }
    throw error;
  }
}

/** Mockup AI: respectă setările din `aiAppSettings` (model primar, mod debug dual). */
export async function generateCustomMockup(
  userPrompt: string,
  designImageData: string,
  apiKey?: string
): Promise<MockupGenerationResult> {
  const app = loadAiAppSettings();
  const gOk = hasGeminiKeyConfigured();
  const oOk = hasOpenAIKeyConfigured();

  if (app.debugCompareImageModels && gOk && oOk) {
    const { gemini, openai } = await runDebugDualImageCompare(
      generateCustomMockupGemini(userPrompt, designImageData, apiKey),
      openaiPrint.generateCustomMockup(userPrompt, designImageData, apiKey)
    );
    return { kind: "dual", gemini, openai };
  }

  const tryOrder: MockupImageProvider[] =
    app.primaryImageProvider === "openai" ? ["openai", "gemini"] : ["gemini", "openai"];

  let lastErr: unknown;
  for (const provider of tryOrder) {
    if (provider === "gemini" && !gOk) continue;
    if (provider === "openai" && !oOk) continue;
    try {
      const url =
        provider === "gemini"
          ? await generateCustomMockupGemini(userPrompt, designImageData, apiKey)
          : await openaiPrint.generateCustomMockup(userPrompt, designImageData, apiKey);
      if (url) return { kind: "single", imageUrl: url, provider };
    } catch (e) {
      lastErr = e;
    }
  }

  if (lastErr instanceof Error) throw lastErr;
  throw new Error(
    "Nu există cheie API pentru modelul ales. Adaugă Gemini și/sau OpenAI în setări sau .env."
  );
}
