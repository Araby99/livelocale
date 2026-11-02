export const SEAM: number;
export const CUTS: Record<string, { size: [number, number]; camera: Record<string, unknown> }>;
export function filterGraph(name: string): string;
export function cutVideos(names?: string[]): void;
