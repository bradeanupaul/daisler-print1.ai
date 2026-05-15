import { GoogleGenAI, Type, Modality } from "@google/genai";
import {
  preferOpenAI,
  resolveGeminiApiKey,
  hasGeminiKeyConfigured,
  hasOpenAIKeyConfigured,
} from "../lib/aiKeys";
import { loadAiAppSettings } from "../lib/aiAppSettings";
import { buildUpscaleExtendOutpaintPrompt } from "../lib/extendOutpaintPrompt";
import { buildUpscaleRecomposePrompt } from "../lib/recomposePrompt";
import { resolveGeminiImageModel } from "../lib/geminiImageConfig";
import { resolveGeminiTextModel } from "../lib/geminiTextConfig";
import type { ProcessingStageReporter } from "../lib/processingStage";
import { resolveImageForGemini, ensureImageDataUrl } from "../lib/imageDataUrl";
import { composeExtendCenterContain, pickCanvasSizeForMmAspect } from "../lib/upscaleCompose";
import type { UpscaleMode } from "../types";
import * as openaiPrint from "./openaiPrint";

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
  } catch (error: any) {
    console.error("AI Analysis failed:", error);
    if (error.message?.includes("429") || error.message?.includes("RESOURCE_EXHAUSTED")) {
      throw new Error("QUOTA_EXHAUSTED");
    }
    return null;
  }
}

function getClosestAspectRatio(width: number, height: number, model: string): string {
  const ratio = width / height;
  const standardRatios = [
    { name: "1:1", value: 1 },
    { name: "4:3", value: 4/3 },
    { name: "3:4", value: 3/4 },
    { name: "3:2", value: 3/2 },
    { name: "2:3", value: 2/3 },
    { name: "16:9", value: 16/9 },
    { name: "9:16", value: 9/16 },
    { name: "1:2", value: 0.5 },
    { name: "2:1", value: 2 },
    { name: "9:5", value: 1.8 }, // Business Card
    { name: "5:9", value: 5/9 }
  ];
  
  return standardRatios.reduce((prev, curr) => 
    Math.abs(curr.value - ratio) < Math.abs(prev.value - ratio) ? curr : prev
  ).name;
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
  targetW: number,
  targetH: number,
  formatName: string,
  bleedMm: number,
  mode: UpscaleMode = "extend",
  reporter?: ProcessingStageReporter,
): Promise<string | null> {
  const ai = getAI();
  const model = resolveGeminiImageModel();
  const aspectRatio = getClosestAspectRatio(targetW, targetH, model);

  const originalW = targetW - bleedMm * 2;
  const originalH = targetH - bleedMm * 2;

  reporter?.stage("Gemini: pregătesc imaginea pentru API…");
  let inputDataUrl = await ensureImageDataUrl(imageData);
  let prompt: string;

  if (mode === "extend") {
    const { width: cw, height: ch } = pickCanvasSizeForMmAspect(targetW, targetH);
    reporter?.stage(`Gemini: compun canvas extend (${cw}×${ch}px)…`);
    inputDataUrl = await composeExtendCenterContain(inputDataUrl, cw, ch);
    prompt = buildUpscaleExtendOutpaintPrompt({
      formatName,
      targetW,
      targetH,
      bleedMm,
    });
  } else {
    prompt = `${buildUpscaleRecomposePrompt({
      formatName,
      targetW,
      targetH,
      bleedMm,
    })}

Net trim (after bleed): ~${originalW}×${originalH} mm.`;
  }

  try {
    reporter?.stage(`Gemini: trimit cerere (${model}, 2K)…`);
    const imagePart = await geminiInlineImage(inputDataUrl);
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          parts: [{ text: prompt }, imagePart],
        },
      ],
      config: {
        imageConfig: {
          aspectRatio,
          imageSize: "2K",
        },
      },
    });

    reporter?.stage("Gemini: primesc răspunsul…");
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        reporter?.stage("Gemini: imagine generată.");
        return `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (error) {
    console.error("AI Upscale failed (Gemini):", error);
    throw error;
  }
}

/** Upscale / recompose / extend: cu mod debug + ambele chei → Gemini și OpenAI în paralele; altfel ruta unică (preferOpenAI). */
export async function upscaleImage(
  imageData: string,
  targetW: number,
  targetH: number,
  formatName: string,
  bleedMm: number,
  mode: UpscaleMode = "extend",
  reporter?: ProcessingStageReporter,
): Promise<UpscaleGenerationResult> {
  const app = loadAiAppSettings();
  const gOk = hasGeminiKeyConfigured();
  const oOk = hasOpenAIKeyConfigured();

  if (app.debugCompareImageModels && gOk && oOk) {
    reporter?.stage("Generez în paralel: Gemini + OpenAI…");
    const { gemini, openai } = await runDebugDualImageCompare(
      upscaleImageGemini(imageData, targetW, targetH, formatName, bleedMm, mode, {
        stage: (m) => reporter?.stage(m),
      }),
      openaiPrint.upscaleImage(imageData, targetW, targetH, formatName, bleedMm, mode, reporter),
    );
    return { kind: "dual", gemini, openai };
  }

  if (preferOpenAI()) {
    const url = await openaiPrint.upscaleImage(
      imageData,
      targetW,
      targetH,
      formatName,
      bleedMm,
      mode,
      reporter,
    );
    if (!url) throw new Error("EMPTY_RESPONSE");
    return { kind: "single", imageUrl: url, provider: "openai" };
  }

  const url = await upscaleImageGemini(imageData, targetW, targetH, formatName, bleedMm, mode, reporter);
  if (!url) throw new Error("EMPTY_RESPONSE");
  return { kind: "single", imageUrl: url, provider: "gemini" };
}

async function generativeFillGemini(
  imageData: string,
  bleedMm: number,
  targetWidthMm: number,
  targetHeightMm: number,
  reporter?: ProcessingStageReporter,
): Promise<string | null> {
  const ai = getAI();
  const model = resolveGeminiImageModel();
  const totalW = targetWidthMm + 2 * bleedMm;
  const totalH = targetHeightMm + 2 * bleedMm;
  const aspectRatio = getClosestAspectRatio(totalW, totalH, model);

  const prompt = `
    DESIGN EXTENSION for print: extend the artwork outward by ${bleedMm}mm on all sides.
    The original ${targetWidthMm}×${targetHeightMm}mm content must remain SACRED and UNTOUCHED in the center.
    Continue structural patterns from the edges (radial sunbursts, rays, stripes, halftone, grids, ornamental frames, texture) with correct geometry — do not replace extended areas with a single flat cream/beige/paper color when the source shows repeating or radial structure.
    Fill the ${aspectRatio} frame with believable design continuation, not empty voids. No white edges, no added borders.
  `;

  try {
    reporter?.stage("Gemini: pregătesc imaginea pentru bleed…");
    const imagePart = await geminiInlineImage(imageData);
    reporter?.stage(`Gemini: trimit cerere bleed (${model}, 2K)…`);
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          parts: [{ text: prompt }, imagePart],
        },
      ],
      config: {
        imageConfig: {
          aspectRatio,
          imageSize: "2K",
        },
      },
    });

    reporter?.stage("Gemini: primesc răspunsul bleed…");
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        reporter?.stage("Gemini: bleed generat.");
        return `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (error) {
    console.error("Generative Fill failed (Gemini):", error);
    throw error;
  }
}

/** Bleed generativ: cu mod debug + ambele chei → Gemini și OpenAI în paralele. */
export async function generativeFill(
  imageData: string,
  bleedMm: number,
  targetWidthMm: number,
  targetHeightMm: number,
  reporter?: ProcessingStageReporter,
): Promise<AiReconstructedImageResult> {
  const app = loadAiAppSettings();
  const gOk = hasGeminiKeyConfigured();
  const oOk = hasOpenAIKeyConfigured();

  if (app.debugCompareImageModels && gOk && oOk) {
    reporter?.stage("Generez bleed în paralel: Gemini + OpenAI…");
    const { gemini, openai } = await runDebugDualImageCompare(
      generativeFillGemini(imageData, bleedMm, targetWidthMm, targetHeightMm, {
        stage: (m) => reporter?.stage(m),
      }),
      openaiPrint.generativeFill(imageData, bleedMm, targetWidthMm, targetHeightMm, reporter),
    );
    return { kind: "dual", gemini, openai };
  }

  if (preferOpenAI()) {
    const url = await openaiPrint.generativeFill(imageData, bleedMm, targetWidthMm, targetHeightMm, reporter);
    if (!url) throw new Error("EMPTY_RESPONSE");
    return { kind: "single", imageUrl: url, provider: "openai" };
  }

  const url = await generativeFillGemini(imageData, bleedMm, targetWidthMm, targetHeightMm, reporter);
  if (!url) throw new Error("EMPTY_RESPONSE");
  return { kind: "single", imageUrl: url, provider: "gemini" };
}

/** Rafinare pe o singură imagine (ex. din dialogul de comparare). Un apel Gemini. */
export async function refineGeminiImageFromPrompt(
  imageDataUrl: string,
  userInstruction: string
): Promise<string | null> {
  const ai = getAI();
  const model = resolveGeminiImageModel();
  const aspectRatio = getClosestAspectRatio(210, 297, model);
  const prompt = `Edit this image for professional print output. Apply ONLY what the user asks. Keep composition coherent unless they request layout changes. No watermarks.

User instruction:
${userInstruction}`;

  try {
    const imagePart = await geminiInlineImage(imageDataUrl);
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          parts: [{ text: prompt }, imagePart],
        },
      ],
      config: {
        imageConfig: {
          aspectRatio,
          imageSize: "2K",
        },
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (error) {
    console.error("refineGeminiImageFromPrompt failed:", error);
    throw error;
  }
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
