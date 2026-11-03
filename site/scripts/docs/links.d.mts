export const ALLOWED_EXTERNAL: RegExp[];
export function extractLinks(html: string): string[];
export function extractIds(html: string): Set<string>;
export type LinkKind =
  | { kind: 'internal'; file: string; hash: string }
  | { kind: 'external'; url: string }
  | { kind: 'skip' };
export function classifyLink(
  href: string,
  pageUrl: string,
  base: string,
  distDir: string
): LinkKind;
