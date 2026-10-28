/** `livelocale init --share`: plans the share-link build change and the GitHub workflow. */

import * as fs from 'fs';
import * as path from 'path';
import { parseGitignore } from '../core/gitignore.js';
import { stringifyLike } from '../core/json-path.js';
import { LOCALE_RE } from '../core/validate.js';
import { parseGitHubSlug, runGit, type GitRunner } from '../server/build-info.js';
import {
  VITE_CONFIG_FILES,
  detectBuildTarget,
  findExportBlockingRoute,
} from '../server/build-target.js';

export type ShareStack = 'vite' | 'cra' | 'webpack' | 'next-export' | 'next-server' | 'unknown';

export const CHECKOUT_ACTION = 'actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2';

export const WORKFLOW_PATH = '.github/workflows/livelocale.yml';

const LOCALES_CANDIDATES = [
  'locales',
  'src/locales',
  'public/locales',
  'src/i18n/locales',
  'messages',
];
const SAFE_ARG = /^[A-Za-z0-9_./-]+$/;
const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const MAX_BRANCHES = 10;
const SHARE_GITIGNORE = 'public/livelocale/';

interface PackageJson {
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
  scripts?: Record<string, unknown>;
  [key: string]: unknown;
}

function readText(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return null;
  }
}

function parsePackageJson(text: string | null): PackageJson | null {
  if (text === null) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as PackageJson)
      : null;
  } catch {
    return null;
  }
}

function hasDependency(pkg: PackageJson | null, name: string): boolean {
  return Boolean(pkg?.dependencies?.[name] ?? pkg?.devDependencies?.[name]);
}

/** Maps the shared build detector onto the stacks `init --share` knows how to set up. */
export function detectShareStack(projectDir: string): { stack: ShareStack; evidence: string } {
  const target = detectBuildTarget(projectDir);
  if (target.kind === 'next') {
    return target.staticExport
      ? { stack: 'next-export', evidence: "Next.js with output: 'export'" }
      : { stack: 'next-server', evidence: "Next.js without output: 'export'" };
  }
  if (target.kind === 'vite') return { stack: 'vite', evidence: 'Vite' };
  if (target.kind === 'cra') return { stack: 'cra', evidence: 'react-scripts' };
  const pkg = parsePackageJson(readText(path.join(projectDir, 'package.json')));
  for (const name of ['webpack', '@rsbuild/core']) {
    if (hasDependency(pkg, name)) return { stack: 'webpack', evidence: `${name} dependency` };
  }
  const config = fs
    .readdirSync(projectDir)
    .find((name) => /^webpack\.config\.[A-Za-z]+$/.test(name));
  if (config) return { stack: 'webpack', evidence: config };
  return { stack: 'unknown', evidence: 'no Vite, Next.js, CRA, webpack or Rsbuild setup found' };
}

export interface WorkflowOptions {
  version: string;
  localesPath: string;
  sourceLocale: string;
  branches: string[];
  dir?: string;
}

function checkSafePath(name: string, value: string): void {
  const segments = value.split('/');
  if (!SAFE_ARG.test(value) || value.startsWith('/') || segments.includes('..')) {
    throw new Error(`\`${name}\` may only contain letters, digits, ".", "_", "-" and "/".`);
  }
}

/** Rejects anything that could change the meaning of the workflow's `run:` line or a script. */
export function validateShareArgs(o: {
  localesPath: string;
  sourceLocale: string;
  branches: string[];
  dir?: string;
}): void {
  checkSafePath('--locales', o.localesPath);
  if (o.dir !== undefined) checkSafePath('--dir', o.dir);
  if (!LOCALE_RE.test(o.sourceLocale)) {
    throw new Error('`--source` must be a locale code such as en or pt-BR.');
  }
  if (o.branches.length === 0) throw new Error('`--branches` needs at least one branch.');
  if (o.branches.length > MAX_BRANCHES) {
    throw new Error(`\`--branches\` takes at most ${MAX_BRANCHES} branches.`);
  }
  for (const branch of o.branches) checkSafePath('--branches', branch);
}

/** The exact `.github/workflows/livelocale.yml` text. */
export function renderWorkflow(o: WorkflowOptions): string {
  validateShareArgs(o);
  if (!VERSION_RE.test(o.version)) throw new Error(`Not a livelocale version: ${o.version}`);
  const dirArg = o.dir === undefined ? '' : ` --dir ${o.dir}`;
  return [
    '# Written by `npx livelocale init --share`. Turns LiveLocale change links into pull requests.',
    '# livelocale reads the link from the event file; it never reaches a shell command.',
    'name: LiveLocale',
    'on:',
    '  issues: { types: [opened] }',
    '  issue_comment: { types: [created] }',
    '  pull_request: { types: [closed] }',
    "  workflow_dispatch: { inputs: { link: { description: 'LiveLocale change link', required: true } } }",
    'permissions: { contents: write, pull-requests: write, issues: write }',
    "concurrency: { group: 'livelocale-${{ github.event.issue.number || github.run_id }}', queue: max }",
    'jobs:',
    '  apply:',
    '    if: >-',
    "      github.event_name == 'workflow_dispatch' ||",
    "      (github.event_name == 'issues' && contains(github.event.issue.body, '```livelocale')) ||",
    "      (github.event_name == 'issue_comment' && !github.event.issue.pull_request &&",
    "       startsWith(github.event.comment.body, '/livelocale')) ||",
    "      (github.event_name == 'pull_request' && startsWith(github.event.pull_request.head.ref, 'livelocale/issue-') &&",
    '       github.event.pull_request.base.ref != github.event.repository.default_branch)',
    '    runs-on: ubuntu-latest',
    '    steps:',
    `      - uses: ${CHECKOUT_ACTION}`,
    '        with: { persist-credentials: false }',
    `      - run: npx --yes livelocale@${o.version} apply --github-event --locales ${o.localesPath} --source ${o.sourceLocale} --branches ${o.branches.join(',')}${dirArg}`,
    "        env: { GITHUB_TOKEN: '${{ github.token }}' }",
    '',
  ].join('\n');
}

export interface PlannedFile {
  /** POSIX path relative to the project directory. */
  path: string;
  action: 'create' | 'update' | 'unchanged' | 'skipped';
  content?: string;
  reason?: string;
}

export interface InitShareOptions {
  projectDir: string;
  localesPath?: string;
  sourceLocale?: string;
  branches?: string[];
  version: string;
  overwrite?: boolean;
  git?: GitRunner;
}

function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

/** Accepts `./src/locales/` or `src\locales` and returns `src/locales`. */
function normalizeArgPath(p: string): string {
  return p
    .replace(/\\/g, '/')
    .replace(/^(?:\.\/)+/, '')
    .replace(/\/+$/, '');
}

function realDir(dir: string): string {
  try {
    return fs.realpathSync(dir);
  } catch {
    return path.resolve(dir);
  }
}

function holdsLocaleJson(dir: string): boolean {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  return entries.some((entry) => {
    if (entry.isFile())
      return entry.name.endsWith('.json') && LOCALE_RE.test(entry.name.slice(0, -5));
    if (!entry.isDirectory() || !LOCALE_RE.test(entry.name)) return false;
    try {
      return fs.readdirSync(path.join(dir, entry.name)).some((name) => name.endsWith('.json'));
    } catch {
      return false;
    }
  });
}

function findLocalesPath(projectDir: string): string {
  const found = LOCALES_CANDIDATES.find((rel) => holdsLocaleJson(path.join(projectDir, rel)));
  if (!found) throw new Error('Pass --locales <path>.');
  return found;
}

async function defaultBranchOf(git: GitRunner, cwd: string): Promise<string> {
  const ref = await git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], cwd);
  if (ref?.startsWith('origin/') && ref.length > 'origin/'.length) {
    return ref.slice('origin/'.length);
  }
  const head = await git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  if (head && head !== 'HEAD') return head;
  return 'main';
}

/** Plans a file write: `create` when missing, `unchanged` when equal, else `update`. */
function planWrite(projectDir: string, rel: string, content: string): PlannedFile {
  const current = readText(path.join(projectDir, rel));
  if (current === null) return { path: rel, action: 'create', content };
  return current === content
    ? { path: rel, action: 'unchanged' }
    : { path: rel, action: 'update', content };
}

interface BuildContext {
  projectDir: string;
  stack: ShareStack;
  localesPath: string;
  sourceLocale: string;
  notes: string[];
}

function planViteConfig(c: BuildContext): PlannedFile[] {
  const addNote = `Add liveLocaleVite({ localesPath: '${c.localesPath}', share: true }) to the plugins array in vite.config.`;
  const config = VITE_CONFIG_FILES.find((name) => fs.existsSync(path.join(c.projectDir, name)));
  if (!config) {
    c.notes.push(addNote);
    return [];
  }
  const source = readText(path.join(c.projectDir, config)) ?? '';
  if (!source.includes('liveLocaleVite(')) {
    c.notes.push(addNote);
    return [{ path: config, action: 'skipped', reason: 'no liveLocaleVite(...) call' }];
  }
  if (/\bshare\s*:/.test(source)) return [{ path: config, action: 'unchanged' }];
  const call = /liveLocaleVite\(\{\s*/;
  if (!call.test(source)) {
    c.notes.push(addNote);
    return [{ path: config, action: 'skipped', reason: 'liveLocaleVite(...) has no { options }' }];
  }
  const source2 = c.sourceLocale === 'en' ? '' : `sourceLocale: '${c.sourceLocale}', `;
  const next = source.replace(call, () => `liveLocaleVite({ share: true, ${source2}`);
  return [{ path: config, action: 'update', content: next }];
}

function planPackageScripts(c: BuildContext): PlannedFile[] {
  const text = readText(path.join(c.projectDir, 'package.json'));
  const pkg = parsePackageJson(text);
  const args = `--locales ${c.localesPath} --source ${c.sourceLocale}`;
  const isNext = c.stack === 'next-export' || c.stack === 'next-server';
  const outDir = c.stack === 'cra' ? 'build' : 'dist';
  const packCommand = `livelocale pack ${outDir} ${args}`;
  if (!pkg) {
    c.notes.push(
      isNext
        ? `Add "build:preview": "livelocale build --preview ${args} -- next build" to package.json.`
        : `Run "${packCommand}" after your build.`
    );
    return [{ path: 'package.json', action: 'skipped', reason: 'no readable package.json' }];
  }
  const scripts = { ...(pkg.scripts ?? {}) };
  if (isNext) {
    const wanted = `livelocale build --preview ${args} -- next build`;
    const current = scripts['build:preview'];
    if (
      current === wanted ||
      (typeof current === 'string' && current.includes('livelocale build'))
    ) {
      return [{ path: 'package.json', action: 'unchanged' }];
    }
    if (current !== undefined) {
      c.notes.push(`Set "build:preview" to "${wanted}" in package.json.`);
      return [
        {
          path: 'package.json',
          action: 'skipped',
          reason: 'scripts["build:preview"] already exists',
        },
      ];
    }
    scripts['build:preview'] = wanted;
  } else {
    const build = scripts.build;
    if (typeof build !== 'string' || build.trim() === '') {
      c.notes.push(`Run "${packCommand}" after your build.`);
      return [{ path: 'package.json', action: 'skipped', reason: 'no scripts.build' }];
    }
    if (build.includes('livelocale pack')) return [{ path: 'package.json', action: 'unchanged' }];
    scripts.build = `${build} && ${packCommand}`;
  }
  return [
    {
      path: 'package.json',
      action: 'update',
      content: stringifyLike({ ...pkg, scripts }, text),
    },
  ];
}

function planGitignore(projectDir: string): PlannedFile {
  const current = readText(path.join(projectDir, '.gitignore'));
  if (current === null) {
    return { path: '.gitignore', action: 'create', content: `${SHARE_GITIGNORE}\n` };
  }
  if (parseGitignore(current).ignores('public/livelocale', true)) {
    return { path: '.gitignore', action: 'unchanged' };
  }
  const sep = current === '' || current.endsWith('\n') ? '' : '\n';
  return { path: '.gitignore', action: 'update', content: `${current}${sep}${SHARE_GITIGNORE}\n` };
}

function planBuild(c: BuildContext): PlannedFile[] {
  switch (c.stack) {
    case 'vite':
      return planViteConfig(c);
    case 'cra':
    case 'webpack':
      return planPackageScripts(c);
    case 'next-export':
    case 'next-server': {
      const files = [...planPackageScripts(c), planGitignore(c.projectDir)];
      if (c.stack === 'next-export') {
        const route = findExportBlockingRoute(c.projectDir);
        if (route) {
          c.notes.push(
            `Delete ${route}: static export rejects POST routes, and livelocale build stops while it exists.`
          );
        }
      } else {
        c.notes.push(
          'Use "npm run build:preview" as the build command of your preview deployments.'
        );
      }
      return files;
    }
    case 'unknown':
      c.notes.push(
        `No supported build setup found. In custom CI, run LIVELOCALE=preview <your build> (only for SSR/SSG), then npx livelocale pack <outDir> --locales ${c.localesPath} --source ${c.sourceLocale}.`
      );
      return [];
  }
}

/** Plans every file `init --share` would write, without writing anything. */
export async function planInitShare(
  o: InitShareOptions
): Promise<{ stack: ShareStack; files: PlannedFile[]; notes: string[] }> {
  const projectDir = realDir(o.projectDir);
  const git = o.git ?? runGit;
  const sourceLocale = o.sourceLocale ?? 'en';
  const localesPath =
    o.localesPath !== undefined ? normalizeArgPath(o.localesPath) : findLocalesPath(projectDir);
  validateShareArgs({ localesPath, sourceLocale, branches: o.branches ?? ['main'] });

  const { stack } = detectShareStack(projectDir);
  const notes: string[] = [];
  const files = planBuild({ projectDir, stack, localesPath, sourceLocale, notes });

  const remote = await git(['remote', 'get-url', 'origin'], projectDir);
  if (!remote || parseGitHubSlug(remote) === null) {
    notes.push('One-click pull requests need GitHub. Use: npx livelocale apply "<link>" --pr');
    return { stack, files, notes };
  }

  const top = await git(['rev-parse', '--show-toplevel'], projectDir);
  const repoRoot = top ? realDir(top) : projectDir;
  const appRel = toPosix(path.relative(repoRoot, projectDir));
  const dir = appRel === '' ? undefined : appRel;
  const repoLocales = dir === undefined ? localesPath : `${dir}/${localesPath}`;
  const defaultBranch = await defaultBranchOf(git, projectDir);
  const branches = o.branches ?? [defaultBranch];
  const workflow = renderWorkflow({
    version: o.version,
    localesPath: repoLocales,
    sourceLocale,
    branches,
    dir,
  });

  const workflowRel = toPosix(path.relative(projectDir, path.join(repoRoot, WORKFLOW_PATH)));
  const planned = planWrite(projectDir, workflowRel, workflow);
  files.push(
    planned.action === 'update' && !o.overwrite
      ? {
          path: workflowRel,
          action: 'skipped',
          reason: 'it exists with different content; pass --overwrite to replace it',
        }
      : planned
  );
  for (const branch of branches) {
    if (branch === defaultBranch) continue;
    notes.push(
      `Also merge ${WORKFLOW_PATH} into \`${branch}\`; pull requests into it run workflows from that branch, so LiveLocale cannot close their issues otherwise.`
    );
  }
  return { stack, files, notes };
}

/** Writes the `create` and `update` entries of a plan. */
export function writePlannedFiles(projectDir: string, files: PlannedFile[]): void {
  for (const file of files) {
    if ((file.action !== 'create' && file.action !== 'update') || file.content === undefined) {
      continue;
    }
    const target = path.resolve(projectDir, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content, 'utf-8');
  }
}
