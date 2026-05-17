/** data:image/png;base64,... */
const DATA_URL_RE = /^data:(image\/[a-z0-9.+-]+)(?:;[^,]*)?,([\s\S]+)$/i;

function guessMimeFromPath(url: string): string | null {
  const path = url.split("?")[0].split("#")[0].toLowerCase();
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".gif")) return "image/gif";
  if (path.endsWith(".svg")) return "image/svg+xml";
  return null;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Convertește blob:/https:/data: într-un data URL cu MIME image/* valid. */
export async function ensureImageDataUrl(url: string): Promise<string> {
  const trimmed = url.trim();
  const parsed = trimmed.match(DATA_URL_RE);
  if (parsed) {
    return `data:${parsed[1]};base64,${parsed[2]}`;
  }

  const res = await fetch(trimmed);
  if (!res.ok) {
    throw new Error(`Nu s-a putut încărca imaginea (${res.status}).`);
  }
  const blob = await res.blob();
  let mime = blob.type;
  if (!mime || mime === "application/octet-stream") {
    mime = guessMimeFromPath(trimmed) ?? "image/png";
  }
  if (!mime.startsWith("image/")) {
    mime = "image/png";
  }
  const base64 = arrayBufferToBase64(await blob.arrayBuffer());
  return `data:${mime};base64,${base64}`;
}

const AI_MIN_LONG_EDGE = 512;
const AI_MAX_LONG_EDGE = 2048;

/** Pregătește sursa pentru edit/upscale: data URL valid, min 512px pe latura lungă. */
export async function prepareImageForAiUpscale(url: string): Promise<string> {
  const dataUrl = await ensureImageDataUrl(url);

  if (typeof document === "undefined") {
    return dataUrl;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const nw = img.naturalWidth || img.width;
      const nh = img.naturalHeight || img.height;
      if (!nw || !nh) {
        reject(new Error("Dimensiuni imagine invalide pentru AI."));
        return;
      }
      const long = Math.max(nw, nh);
      let scale = 1;
      if (long < AI_MIN_LONG_EDGE) scale = AI_MIN_LONG_EDGE / long;
      else if (long > AI_MAX_LONG_EDGE) scale = AI_MAX_LONG_EDGE / long;

      const w = Math.max(1, Math.round(nw * scale));
      const h = Math.max(1, Math.round(nh * scale));
      if (Math.abs(scale - 1) < 0.001) {
        resolve(dataUrl);
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2D indisponibil."));
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () =>
      reject(new Error("Nu s-a putut încărca imaginea pentru recreare AI."));
    img.src = dataUrl;
  });
}

/** Payload pentru Gemini `inlineData` — evită MIME greșit (ex. `http` din blob:). */
export async function resolveImageForGemini(
  url: string,
): Promise<{ mimeType: string; data: string }> {
  const dataUrl = await ensureImageDataUrl(url);
  const m = dataUrl.match(DATA_URL_RE);
  if (!m) {
    throw new Error("Imagine invalidă pentru Gemini.");
  }
  return { mimeType: m[1], data: m[2] };
}
