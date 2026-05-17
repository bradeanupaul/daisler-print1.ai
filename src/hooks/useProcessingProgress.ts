import { useCallback, useEffect, useRef, useState } from "react";
import type { ProcessingStageReporter } from "../lib/processingStage";
import { AiUsageAccumulator, type AiUsageSummary } from "../lib/aiUsage";

export function useProcessingProgress() {
  const [isActive, setIsActive] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const startMsRef = useRef(0);
  const elapsedTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const usageRef = useRef<AiUsageAccumulator | null>(null);

  const clearElapsedTick = useCallback(() => {
    if (elapsedTickRef.current) {
      clearInterval(elapsedTickRef.current);
      elapsedTickRef.current = null;
    }
  }, []);

  const pushLog = useCallback((line: string) => {
    const text = line.trim();
    if (!text) return;
    setMessage(text);
    setLog((prev) => {
      if (prev[prev.length - 1] === text) return prev;
      const next = [...prev, text];
      return next.length > 8 ? next.slice(-8) : next;
    });
  }, []);

  const begin = useCallback(
    (initialMessage: string) => {
      clearElapsedTick();
      startMsRef.current = Date.now();
      usageRef.current = new AiUsageAccumulator();
      setIsActive(true);
      setProgress(null);
      setElapsedSec(0);
      setLog([]);
      setErrorMessage(null);
      pushLog(initialMessage);

      elapsedTickRef.current = setInterval(() => {
        setElapsedSec(Math.floor((Date.now() - startMsRef.current) / 1000));
      }, 1000);
    },
    [clearElapsedTick, pushLog],
  );

  const stage = useCallback(
    (text: string) => {
      pushLog(text);
    },
    [pushLog],
  );

  const progressStep = useCallback(
    (current: number, total: number, label?: string) => {
      if (label) pushLog(label);
      if (total > 0) {
        setProgress(Math.min(99, Math.round((current / total) * 100)));
      }
    },
    [pushLog],
  );

  const getReporter = useCallback((): ProcessingStageReporter => {
    return {
      stage,
      progressStep,
      usage: usageRef.current ?? undefined,
    };
  }, [stage, progressStep]);

  const getUsageSummary = useCallback((): AiUsageSummary | null => {
    const summary = usageRef.current?.summarize();
    return summary && summary.callCount > 0 ? summary : null;
  }, []);

  const done = useCallback(() => {
    clearElapsedTick();
    pushLog("Gata.");
    setProgress(100);
    window.setTimeout(() => {
      setIsActive(false);
      setProgress(null);
      setElapsedSec(0);
    }, 400);
  }, [clearElapsedTick, pushLog]);

  const stop = useCallback(() => {
    clearElapsedTick();
    setIsActive(false);
    setProgress(null);
    setElapsedSec(0);
    setErrorMessage(null);
  }, [clearElapsedTick]);

  const fail = useCallback(
    (errorText: string) => {
      clearElapsedTick();
      const text = errorText.trim() || "Eroare la procesarea AI.";
      setErrorMessage(text);
      setMessage(text);
      setIsActive(true);
      setProgress(null);
      pushLog(`Eroare: ${text}`);
    },
    [clearElapsedTick, pushLog],
  );

  const dismissError = useCallback(() => {
    clearElapsedTick();
    setErrorMessage(null);
    setIsActive(false);
    setProgress(null);
    setElapsedSec(0);
  }, [clearElapsedTick]);

  useEffect(() => () => clearElapsedTick(), [clearElapsedTick]);

  return {
    isActive,
    progress,
    message,
    log,
    elapsedSec,
    errorMessage,
    begin,
    stage,
    progressStep,
    getReporter,
    getUsageSummary,
    done,
    stop,
    fail,
    dismissError,
  };
}
