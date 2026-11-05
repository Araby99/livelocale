export type ShotName =
  | 'next-studio-open'
  | 'next-alt-click'
  | 'next-saved-file'
  | 'vite-studio-open'
  | 'vite-alt-click'
  | 'vite-saved-file'
  | 'share-open-link'
  | 'share-alt-click'
  | 'share-send-dialog'
  | 'share-review-mode'
  | 'studio-plural'
  | 'studio-placeholder-warning'
  | 'studio-rtl-site'
  | 'studio-light'
  | 'studio-keyboard'
  | 'studio-missing';

export type ClipName = 'alt-click-edit' | 'send-link' | 'rtl-site';

export const SHOTS: Record<
  ShotName,
  { app: 'next' | 'vite' | 'share'; locale?: 'ar'; theme?: 'light'; use: string }
>;

export const CLIPS: Record<ClipName, { app: 'share'; seconds: number; use: string }>;

export interface DocsMedia {
  shots: Record<string, { file: string; width: number; height: number }>;
  clips: Record<
    string,
    { webm: string; mp4: string; poster: string; width: number; height: number; seconds: number }
  >;
}

export interface DocsPorts {
  next: number;
  vite: number;
  studio: number;
}

export const DEFAULT_PORTS: DocsPorts;

export function provenance(
  name: string,
  what: string,
  ports?: DocsPorts
): { prompt: string; createdAt: string };
