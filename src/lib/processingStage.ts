/** Raportare pași reali din servicii (Gemini, OpenAI, PDF etc.). */
export type ProcessingStageReporter = {
  stage: (message: string) => void;
  /** Progres determinist când știm pașii (ex. 2/3 regenerări OpenAI). */
  progressStep?: (current: number, total: number, message?: string) => void;
};

export function noopReporter(): ProcessingStageReporter {
  return { stage: () => {} };
}
