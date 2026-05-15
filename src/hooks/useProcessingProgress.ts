import { useCallback, useEffect, useRef, useState } from "react";
import type { ProcessingStageReporter } from "../lib/processingStage";

export function useProcessingProgress() {
  const [isActive, setIsActive] = useState(false);
  /** null = bară indeterminată; 0–100 = pași reali */
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [elapsedSec, setElapsedSec] = useState(0);

  const startMsRef = useRef(0);
  const elapsedTickRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      setIsActive(true);
      setProgress(null);
      setElapsedSec(0);
      setLog([]);
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

  const reporterRef = useRef<ProcessingStageReporter>({ stage, progressStep });
  reporterRef.current = { stage, progressStep };

  const getReporter = useCallback((): ProcessingStageReporter => reporterRef.current, []);

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
  }, [clearElapsedTick]);

  useEffect(() => () => clearElapsedTick(), [clearElapsedTick]);

  return {
    isActive,
    progress,
    message,
    log,
    elapsedSec,
    begin,
    stage,
    progressStep,
    getReporter,
    done,
    stop,
  };
}
