/** The Studio's brand colour tokens (Milestone 2b Task 33 table): `[light, dark]` hex per name. */
export const TOKENS = {
  app: ['#F4F5F7', '#0C0D0F'],
  surface: ['#FFFFFF', '#16181D'],
  raised: ['#F9FAFB', '#1E2127'],
  'raised-hover': ['#F4F5F7', '#1A1D22'],
  line: ['#D5D7DC', '#2A2D33'],
  'line-strong': ['#868B96', '#6B6F7A'],
  fg: ['#15171B', '#E8E4D9'],
  'fg-muted': ['#5E5B54', '#8C887D'],
  'fg-faint': ['#8A877F', '#6E6B64'],
  accent: ['#FFB224', '#FFB224'],
  'accent-hover': ['#FFC150', '#FFC150'],
  'accent-shadow': ['#8A5600', '#8A5600'],
  'on-accent': ['#15171B', '#0C0D0F'],
  'accent-fg': ['#8F5B00', '#FFB224'],
  'accent-soft': ['#FFF1D6', '#2E2412'],
  'accent-line': ['#D5D7DC', '#2A2D33'],
  focus: ['#8F5B00', '#FFB224'],
  'logo-ink': ['#15171B', '#E8E4D9'],
  'danger-fg': ['#C8243A', '#FF5468'],
  'danger-bg': ['#F9FAFB', '#1E2127'],
  'danger-line': ['#C8243A', '#FF5468'],
  'warning-fg': ['#8F5B00', '#FFB224'],
  'warning-bg': ['#FFF1D6', '#2E2412'],
  'warning-line': ['#D5D7DC', '#2A2D33'],
  'warning-solid': ['#FFB224', '#FFB224'],
  'on-warning': ['#15171B', '#0C0D0F'],
  'success-fg': ['#00785F', '#6FD69A'],
  'success-bg': ['#EBF4F2', '#16211D'],
  'success-line': ['#A6D0C7', '#2F5340'],
  'info-fg': ['#00708A', '#4FC3DC'],
  'info-bg': ['#EBF4F6', '#131F24'],
  'info-line': ['#A6CDD6', '#234D57'],
  overlay: ['#15171B73', '#000000A6'],
} as const satisfies Record<string, readonly [light: string, dark: string]>;

export type TokenName = keyof typeof TOKENS;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** `--*` declarations of the first top-level `<selector> {` block, values trimmed. */
export function cssDecls(css: string, selector: ':root' | '.dark'): Map<string, string> {
  const block = new RegExp(String.raw`(?:^|\n)${escapeRegExp(selector)}\s*\{([^}]*)\}`).exec(css);
  const decls = new Map<string, string>();
  if (!block) return decls;
  for (const m of block[1]!.matchAll(/(--[\w-]+)\s*:\s*([^;]*);/g)) decls.set(m[1]!, m[2]!.trim());
  return decls;
}

/** Body of the first `@theme inline {` block. */
export function themeInline(css: string): string {
  return /@theme\s+inline\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
}
