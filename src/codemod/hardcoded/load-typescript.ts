import { createRequire } from 'module';
import * as path from 'path';
import type { TypeScriptModule } from './scan-jsx.js';

export const TYPESCRIPT_MISSING =
  'Install typescript as a dev dependency to enable hardcoded-text detection: npm install -D typescript';

/**
 * The problem when the project has a `typescript` without the JavaScript compiler API. TypeScript 7
 * (the default in a new create-vite app) is a native compiler whose package exports only its
 * version, so nothing can parse with it; 4.7 to 6.x can.
 */
export function typescriptUnusable(version: string, feature = 'hardcoded-text detection'): string {
  return `TypeScript ${version} has no JavaScript compiler API, which ${feature} needs. Install TypeScript 5 or 6 as a dev dependency: npm install -D typescript@5`;
}

/** The `typescript` module object (CommonJS or ESM) when it has the compiler API, else null. */
export function withCompilerApi(mod: any): TypeScriptModule | null {
  const ts = mod?.default ?? mod;
  return typeof ts?.createSourceFile === 'function' ? (ts as TypeScriptModule) : null;
}

/** The version a `typescript` module object reports, for messages. */
export function typescriptVersion(mod: any): string {
  return String((mod?.default ?? mod)?.version ?? 'unknown');
}

export type ProjectTypeScript = { ts: TypeScriptModule } | { problem: string };

/**
 * Loads `typescript` the way the project itself resolves it (an optional peer, never bundled),
 * or names the setup problem that keeps hardcoded-text detection from running.
 */
export async function loadProjectTypeScript(
  projectDir: string,
  feature?: string
): Promise<ProjectTypeScript> {
  let mod: any;
  try {
    mod = createRequire(path.join(path.resolve(projectDir), 'package.json'))('typescript');
  } catch {
    return { problem: TYPESCRIPT_MISSING };
  }
  const ts = withCompilerApi(mod);
  if (ts) return { ts };
  return { problem: typescriptUnusable(typescriptVersion(mod), feature) };
}

/** Thrown when the `typescript` that loads has no compiler API: a setup problem, not a bad file. */
export class TypeScriptUnusableError extends Error {}
