import { existsSync, readFileSync } from 'fs';
import * as path from 'path';

/** Next.js config file names, in the order they are read. */
export const NEXT_CONFIG_FILES = [
  'next.config.js',
  'next.config.mjs',
  'next.config.cjs',
  'next.config.ts',
  'next.config.mts',
];

const VITE_CONFIG_FILES = [
  'vite.config.js',
  'vite.config.mjs',
  'vite.config.cjs',
  'vite.config.ts',
  'vite.config.mts',
];

export type BuildTarget =
  | { kind: 'next'; staticExport: boolean; base: string | null } // base = Next basePath
  | { kind: 'cra'; base: string | null } // from package.json homepage ('./' for '.')
  | { kind: 'vite'; base: null }
  | { kind: 'other'; base: null };

const OUTPUT_EXPORT = /\boutput\s*:\s*['"`]export['"`]/;
const BASE_PATH = /\bbasePath\s*:\s*['"`](\/[^'"`]*)['"`]/;
const EXPORTS_POST =
  /export\s+(?:const|let|var|async\s+function|function)\s+POST\b|export\s*\{[^}]*\bPOST\b[^}]*\}/;

interface PackageJson {
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
  homepage?: unknown;
}

function readText(file: string): string | null {
  try {
    return readFileSync(file, 'utf-8');
  } catch {
    return null;
  }
}

function readPackageJson(projectDir: string): PackageJson {
  const text = readText(path.join(projectDir, 'package.json'));
  if (text === null) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? (parsed as PackageJson) : {};
  } catch {
    return {};
  }
}

function hasDependency(pkg: PackageJson, name: string): boolean {
  return Boolean(pkg.dependencies?.[name] ?? pkg.devDependencies?.[name]);
}

function firstExisting(projectDir: string, names: string[]): string | null {
  for (const name of names) {
    const file = path.join(projectDir, name);
    if (existsSync(file)) return file;
  }
  return null;
}

/** Removes block comments and whole-line `//` comments so commented-out options never match. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

function craBase(homepage: unknown): string | null {
  if (typeof homepage !== 'string') return null;
  const value = homepage.trim();
  if (value === '.' || value === './') return './';
  if (value.startsWith('/')) return value;
  try {
    return new URL(value).pathname;
  } catch {
    return null;
  }
}

/** Detects the project's build stack. The first match wins: Next, CRA, Vite, then other. */
export function detectBuildTarget(projectDir: string): BuildTarget {
  const pkg = readPackageJson(projectDir);

  const nextConfig = firstExisting(projectDir, NEXT_CONFIG_FILES);
  if (nextConfig || hasDependency(pkg, 'next')) {
    const source = stripComments((nextConfig && readText(nextConfig)) ?? '');
    return {
      kind: 'next',
      staticExport: OUTPUT_EXPORT.test(source),
      base: BASE_PATH.exec(source)?.[1] ?? null,
    };
  }

  if (hasDependency(pkg, 'react-scripts')) return { kind: 'cra', base: craBase(pkg.homepage) };

  if (hasDependency(pkg, 'vite') || firstExisting(projectDir, VITE_CONFIG_FILES)) {
    return { kind: 'vite', base: null };
  }

  return { kind: 'other', base: null };
}

const ROUTE_DIRS = ['app', 'src/app'];
const ROUTE_EXTENSIONS = ['ts', 'js', 'mjs', 'tsx', 'jsx'];

/**
 * Finds a LiveLocale Next route that exports POST, which `output: 'export'` cannot build.
 * Returns its POSIX path relative to the project, or null.
 */
export function findExportBlockingRoute(projectDir: string): string | null {
  for (const dir of ROUTE_DIRS) {
    for (const ext of ROUTE_EXTENSIONS) {
      const rel = `${dir}/api/livelocale/route.${ext}`;
      const source = readText(path.join(projectDir, rel));
      if (source !== null && EXPORTS_POST.test(source)) return rel;
    }
  }
  return null;
}

/** Output folders to look for, most likely first. */
export function outputCandidates(target: BuildTarget): string[] {
  return target.kind === 'cra' ? ['build', 'dist', 'out'] : ['dist', 'build', 'out'];
}
