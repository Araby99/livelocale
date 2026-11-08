export const CUTS: Record<string, { size: [number, number]; camera: Record<string, string> }>;
export function filterGraph(name: string): string;
export function cutVideos(names?: string[]): void;
