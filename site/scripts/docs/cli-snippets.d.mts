export interface SnippetSpec {
  fixture: string | null;
  files?: Record<string, string>;
  git?: { remote: string };
  setup?: string[][];
  args: string[];
  expect: number;
  /** Keep only this many of the output's first lines. */
  head?: number;
}
export interface Snippet {
  command: string;
  output: string;
  status: number;
}
export const SNIPPETS: Record<string, SnippetSpec>;
export function runSnippet(name: string, spec: SnippetSpec, cli: string): Snippet;
export function writeCliSnippets(outDir?: string): void;
