/** The Studio's brand colour tokens (Task 10 table): `[light, dark]` hex per name. */
export const TOKENS = {
  app: ['#FFF8F0', '#1C1714'],
  surface: ['#FFFDFA', '#231D19'],
  raised: ['#F7EEE4', '#2D2520'],
  'raised-hover': ['#EFE3D6', '#3A302A'],
  line: ['#E9DCCD', '#3B312A'],
  'line-strong': ['#8C7764', '#94806F'],
  fg: ['#1D1712', '#F6EEE6'],
  'fg-muted': ['#6B5B4D', '#CBBBAA'],
  'fg-faint': ['#A08B78', '#7D6A5B'],
  accent: ['#FF6B4A', '#FF7A5C'],
  'accent-hover': ['#FF8264', '#FF9478'],
  'accent-shadow': ['#C2472C', '#9E3A24'],
  'on-accent': ['#1D1712', '#1C1714'],
  'accent-fg': ['#B23A1E', '#FF8A6E'],
  'accent-soft': ['#FFE9E2', '#3A231C'],
  'accent-line': ['#F5B9A8', '#6E3426'],
  focus: ['#B23A1E', '#FF7A5C'],
  'logo-ink': ['#1D1712', '#F6EEE6'],
  'danger-fg': ['#B42318', '#FF8A80'],
  'danger-bg': ['#FDECEA', '#3A1E1A'],
  'danger-line': ['#F2B8B0', '#6E2E26'],
  'danger-solid': ['#B42318', '#C7362B'],
  'on-danger': ['#FFFFFF', '#FFFFFF'],
  'warning-fg': ['#8A5A00', '#F5C26B'],
  'warning-bg': ['#FDF3DC', '#3A2E17'],
  'warning-line': ['#E9CF8F', '#6B5426'],
  'warning-solid': ['#8A5A00', '#F5C26B'],
  'on-warning': ['#FFFFFF', '#1C1714'],
  'success-fg': ['#1A6B37', '#7FD49A'],
  'success-bg': ['#E6F4EA', '#183222'],
  'success-line': ['#A7D7B5', '#2F5E3E'],
  'info-fg': ['#1E5FA8', '#8DBEF5'],
  'info-bg': ['#E7F0FA', '#172839'],
  'info-line': ['#A9C7EA', '#2E4E73'],
  overlay: ['#1D171273', '#000000A6'],
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
