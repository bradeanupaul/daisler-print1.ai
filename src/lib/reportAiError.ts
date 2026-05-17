import { toast } from "sonner";
import { formatAiApiError, type AiErrorFormatContext } from "./apiErrorMessage";

export type ReportAiErrorOptions = {
  /** Titlu scurt înainte de mesaj (toast). */
  title?: string;
  /** Nu afișa toast (doar returnează mesajul formatat). */
  silentToast?: boolean;
  /** Durată toast în ms (implicit 12s). */
  durationMs?: number;
  /** Furnizor pentru clasificare corectă a erorii (OpenAI vs Gemini). */
  provider?: AiErrorFormatContext["provider"];
};

/** Formatează eroarea API și o afișează utilizatorului (toast), nu doar în consolă. */
export function reportAiError(err: unknown, opts?: ReportAiErrorOptions): string {
  const msg = formatAiApiError(err, { provider: opts?.provider });
  if (!opts?.silentToast) {
    const text = opts?.title ? `${opts.title}: ${msg}` : msg;
    toast.error(text, { duration: opts?.durationMs ?? 12_000 });
  }
  return msg;
}
