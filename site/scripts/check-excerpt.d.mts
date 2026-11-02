export const MARKER: string;
export function renderLine(line: string): string;
export function renderCheckExcerpt(data: { output: string; status: number }): string;
export function injectCheckExcerpt(html: string, data: { output: string; status: number }): string;
