export type Lhr = {
  categories: Record<string, { score: number | null }>;
  audits?: Record<string, { numericValue?: number; details?: unknown }>;
};
export const LH_PATHS: string[];
export function assertScores(lhr: Lhr, min: number): string[];
export function medianLhr(runs: Lhr[]): Lhr;
