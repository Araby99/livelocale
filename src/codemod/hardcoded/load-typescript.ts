import { createRequire } from 'module';
import * as path from 'path';
import type { TypeScriptModule } from './scan-jsx.js';

export const TYPESCRIPT_MISSING =
  'Install typescript as a dev dependency to enable hardcoded-text detection: npm install -D typescript';

export function typescriptUnusable(version: string): string {
  return `typescript ${version} found but its compiler API is unavailable; hardcoded-text detection needs typescript 4.7–6.x`;
}

export type ProjectTypeScript = { ts: TypeScriptModule } | { problem: string };

/**
 * Loads `typescript` the way the project itself resolves it (an optional peer, never bundled),
 * or names the setup problem that keeps hardcoded-text detection from running.
 */
export async function loadProjectTypeScript(projectDir: string): Promise<ProjectTypeScript> {
  let mod: any;
  try {
    mod = createRequire(path.join(path.resolve(projectDir), 'package.json'))('typescript');
  } catch {
    return { problem: TYPESCRIPT_MISSING };
  }
  const ts = mod?.default ?? mod;
  if (typeof ts?.createSourceFile === 'function') return { ts: ts as TypeScriptModule };
  return { problem: typescriptUnusable(String(ts?.version ?? 'unknown')) };
}
