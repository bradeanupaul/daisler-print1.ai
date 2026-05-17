/** Logging dev pentru fluxul AI Upscale / bleed (consolă browser). */

const PREFIX = "[print1 AI]";

function devOnly(): boolean {
  return typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV);
}

export function aiLog(step: string, detail?: Record<string, unknown>) {
  if (!devOnly() || typeof console === "undefined") return;
  if (detail && Object.keys(detail).length > 0) {
    console.info(PREFIX, step, detail);
  } else {
    console.info(PREFIX, step);
  }
}

export function aiWarn(step: string, detail?: unknown) {
  if (!devOnly() || typeof console === "undefined") return;
  console.warn(PREFIX, step, detail ?? "");
}

export function aiError(step: string, err: unknown) {
  if (!devOnly() || typeof console === "undefined") return;
  console.error(PREFIX, step, err);
}
