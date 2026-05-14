import { GoogleGenAI, Type, Modality } from "@google/genai";
import { preferOpenAI, resolveGeminiApiKey } from "../lib/aiKeys";
import { buildUpscaleExtendOutpaintPrompt } from "../lib/extendOutpaintPrompt";
import { buildUpscaleRecomposePrompt } from "../lib/recomposePrompt";
import { composeExtendCenterContain, pickCanvasSizeForMmAspect } from "../lib/upscaleCompose";
import type { UpscaleMode } from "../types";
import * as openaiPrint from "./openaiPrint";

const getAI = () => {
  const apiKey = resolveGeminiApiKey();
  return new GoogleGenAI({ apiKey });
};

export async function processAgentMessage(message: string, currentSettings: any, hasFile: boolean) {
  if (preferOpenAI()) {
    return openaiPrint.processAgentMessage(message, currentSettings, hasFile);
  }
  const ai = getAI();
  const model = "gemini-3-flash-preview";
  
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
  const model = "gemini-3-flash-preview";
  
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
  `;

  try {
    const mimeType = imageData.split(';')[0].split(':')[1] || "image/jpeg";
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          parts: [
            { text: prompt },
            { inlineData: { data: imageData.split(',')[1], mimeType } }
          ]
        }
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

export async function upscaleImage(
  imageData: string,
  targetW: number,
  targetH: number,
  formatName: string,
  bleedMm: number,
  mode: UpscaleMode = "extend"
) {
  if (preferOpenAI()) {
    return openaiPrint.upscaleImage(
      imageData,
      targetW,
      targetH,
      formatName,
      bleedMm,
      mode
    );
  }
  const ai = getAI();
  const model = "gemini-1.5-pro"; // Using Pro model for better layout intelligence and font reconstruction
  const aspectRatio = getClosestAspectRatio(targetW, targetH, model);

  const originalW = targetW - bleedMm * 2;
  const originalH = targetH - bleedMm * 2;

  let inputDataUrl = imageData;
  let prompt: string;

  if (mode === "extend") {
    const { width: cw, height: ch } = pickCanvasSizeForMmAspect(targetW, targetH);
    inputDataUrl = await composeExtendCenterContain(imageData, cw, ch);
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
    const mimeType = inputDataUrl.split(";")[0].split(":")[1] || "image/jpeg";
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          parts: [
            { text: prompt },
            { inlineData: { data: inputDataUrl.split(",")[1], mimeType } },
          ],
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
    console.error("AI Upscale failed:", error);
    throw error;
  }
}

export async function generativeFill(imageData: string, bleedMm: number, targetWidthMm: number, targetHeightMm: number) {
  if (preferOpenAI()) {
    return openaiPrint.generativeFill(imageData, bleedMm, targetWidthMm, targetHeightMm);
  }
  const ai = getAI();
  const model = "gemini-3.1-flash-image-preview";
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
    const mimeType = imageData.split(';')[0].split(':')[1] || "image/jpeg";
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          parts: [
            { text: prompt },
            { inlineData: { data: imageData.split(',')[1], mimeType } }
          ]
        }
      ],
      config: {
        imageConfig: {
          aspectRatio,
          imageSize: "2K"
        }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (error) {
    console.error("Generative Fill failed:", error);
    throw error;
  }
}

export async function generateCustomMockup(userPrompt: string, designImageData: string, apiKey?: string) {
  if (preferOpenAI()) {
    return openaiPrint.generateCustomMockup(userPrompt, designImageData, apiKey);
  }
  const ai = apiKey ? new GoogleGenAI({ apiKey }) : getAI();
  const model = "gemini-2.5-flash-image";
  
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
    const mimeType = designImageData.split(';')[0].split(':')[1] || "image/jpeg";
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          parts: [
            { text: systemPrompt },
            { inlineData: { data: designImageData.split(',')[1], mimeType } }
          ]
        }
      ],
      config: {
        imageConfig: {
          aspectRatio: "1:1"
        }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (error: any) {
    console.error("Custom Mockup Generation failed:", error);
    if (error.message?.includes("Requested entity was not found") || error.message?.includes("API_KEY_INVALID") || error.message?.toLowerCase().includes("invalid api key")) {
      throw new Error("INVALID_API_KEY");
    }
    throw error;
  }
}
