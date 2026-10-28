#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';
import { moduleDir } from '../server/module-dir.js';
import { createStudioServer } from './studio-server.js';
import { runDoctor, formatFindings, hasFailures, normalizeAppUrl } from './doctor.js';
import { runCheck, formatCheckReport, hasCheckFailures } from './check.js';
import {
  BUILD_USAGE,
  packOutput,
  parseShareArgs,
  runBuildCommand,
  type PackResult,
} from '../server/pack.js';
import { PackError } from '../server/pack-error.js';
import { runApplyCommand } from './apply/cli.js';

const DEFAULT_STUDIO_PORT = 3010;
const DEFAULT_APP_ORIGIN = 'http://localhost:3000';

function printHelp() {
  console.log(`
LiveLocale (livelocale) CLI

Usage:
  npx livelocale <command> [options]

Commands:
  migrate     Bulk migrate existing react-i18next translation usages to wrap them with wrapTranslationEngine automatically.
  init        Initialize the API route handler inside a Next.js project automatically.
  studio      Start the visual editing studio local web server.
  doctor      Check the project for common integration problems (route, provider, middleware, CSP, locales).
  check       Check translations for missing keys, placeholder drift, broken ICU syntax and unused keys (CI-friendly).
  pack        Write the share Studio (livelocale/) into a built site folder and link every HTML page to it.
  build       Run your build command, then pack its output (Next.js: packs into public/livelocale/ first).
  apply       Apply a LiveLocale change link to your locale files (--pr opens a pull request)

Options for migrate:
  --dir <path>       Directory to scan (default: current directory)
  --exclude <list>   Comma-separated list of directories to exclude (default: node_modules,.next,dist,.git)
  --dry-run          Preview changes without writing them to disk

Options for init:
  --dir <path>       Target project directory (default: current directory)

Options for studio:
  --port <number>    Port to run the studio server on (default: ${DEFAULT_STUDIO_PORT})
  --app <origin>     Origin of the app being edited (default: ${DEFAULT_APP_ORIGIN})
                     Can also be changed at run time with ?app=<origin> on the Studio URL.

Options for doctor:
  --dir <path>       Project directory to inspect (default: current directory)
  --locales <path>   Locales directory relative to the project (default: locales)
  --app <url>        Also probe the running app or deployed site, e.g. http://localhost:3000
                     or https://user.github.io/repo/ (a path is the app base)
  --share            Run the share link probes even when livelocale/manifest.json is missing
  --token <token>    Access token for a preview deployment (default: LIVELOCALE_TOKEN)

Options for check:
  --dir <path>       Project directory to scan (default: current directory)
  --locales <path>   Locales directory relative to the project (default: locales)
  --source <locale>  Locale the others are compared against (default: en, else the first locale)
  --no-unused        Do not report keys that code never references
  --strict           Treat warnings (unused keys, empty values) as failures
  --json             Print the full report as JSON

Options for pack:
  pack <outDir>      Built site folder, relative to --dir (e.g. dist, build, out)
  --dir <path>       Project directory (default: current directory)
  --locales <path>   Locales directory relative to the project (default: locales)
  --source <locale>  Source locale (default: en, else the first locale)
  --base <path>      Site path the app is served from, e.g. /repo/ (default: detected, else /)
  --expose-repo      Put the GitHub owner/repo into livelocale/manifest.json
  --no-inject        Do not add the flag.js script to HTML files

Options for build:
  build [--preview] [--out <dir>] [pack options] -- <command...>
  --preview          Run the command with LIVELOCALE=preview and NEXT_PUBLIC_LIVELOCALE=preview
  --out <dir>        Build output folder (default: detected from dist/, build/, out/)

Options for apply:
  apply <link|file|->  The change link, a file that holds it, or - to read stdin
  --clipboard        Read the change link from the clipboard instead
  --pr               Commit the changes on a new branch and open a pull request
  --dir <path>       Project directory (default: current directory)
  --locales <path>   Locales directory relative to the project (default: locales)
  --source <locale>  Source locale (default: en, else the first locale)
  --force            Apply edits the translator saved with "Save anyway"
  --dry-run          Show what would change without writing files
  --github-event      Run inside the generated GitHub workflow; reads the link from the event file
  --branches <a,b>    Branches a link may target (default: the repository's default branch)

Global Options:
  -h, --help         Show help information
`);
}

function normalizeOriginArg(value: string, flag: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('bad protocol');
    return url.origin;
  } catch {
    console.error(
      `Error: ${flag} must be an http(s) origin such as http://localhost:3001 (got "${value}").`
    );
    process.exit(1);
  }
}

/** `doctor --app`: an http(s) URL whose path, when given, is the app base. */
function normalizeAppArg(value: string): { origin: string; base: string } {
  try {
    return normalizeAppUrl(value);
  } catch {
    console.error(
      `Error: --app must be an http(s) URL such as http://localhost:3000 or https://user.github.io/repo/ (got "${value}").`
    );
    process.exit(1);
  }
}

/**
 * True when something already accepts connections on localhost:port. On Windows
 * another process can hold [::1]:port while our [::]:port bind still succeeds,
 * so the browser would silently reach the other server.
 */
function isPortAnswering(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: 'localhost', port });
    const done = (answering: boolean) => {
      socket.destroy();
      resolve(answering);
    };
    socket.setTimeout(1000, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

async function runStudio(port: number, appOrigin: string) {
  console.log(`\n🚀 Starting LiveLocale Studio...`);
  const studioDir = path.resolve(moduleDir(), '../studio');

  if (!fs.existsSync(path.join(studioDir, 'index.html'))) {
    console.error(`Error: Studio assets not found at "${studioDir}".`);
    console.error(`Did you build the project? Run "npm run build" first.`);
    process.exit(1);
  }

  if (await isPortAnswering(port)) {
    console.error(
      `Error: something is already running on localhost:${port}. Stop it or pick another port with --port <number>.`
    );
    process.exit(1);
  }

  const server = createStudioServer({ studioDir, appOrigin });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Error: port ${port} is already in use. Pick another with --port <number>.`);
    } else {
      console.error(`Error: failed to start the Studio server: ${err.message}`);
    }
    process.exit(1);
  });

  server.listen(port, () => {
    console.log(`\n🎨 LiveLocale Studio is running!`);
    console.log(`📡 Studio: http://localhost:${port}`);
    console.log(`🔗 Editing app at: ${appOrigin}`);
    console.log(`💡 Press Ctrl+C to stop the studio server.\n`);
  });
}

function runInit(projectDir: string) {
  console.log(`\n🚀 Initializing LiveLocale API handler...`);
  const absoluteDir = path.resolve(projectDir);
  if (!fs.existsSync(absoluteDir)) {
    console.error(`Error: Directory "${projectDir}" does not exist.`);
    process.exit(1);
  }

  // 1. Detect TypeScript vs. JavaScript
  const isTypeScript = fs.existsSync(path.join(absoluteDir, 'tsconfig.json'));
  const fileExt = isTypeScript ? 'ts' : 'js';
  console.log(`📁 Target: ${absoluteDir}`);
  console.log(`🔧 Language detected: ${isTypeScript ? 'TypeScript' : 'JavaScript'}`);

  // 2. Check for installed libraries in package.json
  let hasNextIntl = false;
  let hasReactI18next = false;
  const targetPkgPath = path.join(absoluteDir, 'package.json');
  if (fs.existsSync(targetPkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(targetPkgPath, 'utf8'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      hasNextIntl = Boolean(allDeps['next-intl']);
      hasReactI18next = Boolean(allDeps['react-i18next']);
    } catch {}
  }

  // 3. Check for App Router vs Pages Router
  const appDirPath = path.join(absoluteDir, 'app');
  const pagesDirPath = path.join(absoluteDir, 'pages');
  const srcAppDirPath = path.join(absoluteDir, 'src', 'app');
  const srcPagesDirPath = path.join(absoluteDir, 'src', 'pages');

  let targetPath = '';
  let routerType = '';
  let content = '';

  if (fs.existsSync(appDirPath)) {
    targetPath = path.join(appDirPath, 'api', 'livelocale', `route.${fileExt}`);
    routerType = 'Next.js App Router (root)';
  } else if (fs.existsSync(srcAppDirPath)) {
    targetPath = path.join(srcAppDirPath, 'api', 'livelocale', `route.${fileExt}`);
    routerType = 'Next.js App Router (src/)';
  } else if (fs.existsSync(pagesDirPath)) {
    targetPath = path.join(pagesDirPath, 'api', `livelocale.${fileExt}`);
    routerType = 'Next.js Pages Router (root)';
  } else if (fs.existsSync(srcPagesDirPath)) {
    targetPath = path.join(srcPagesDirPath, 'api', `livelocale.${fileExt}`);
    routerType = 'Next.js Pages Router (src/)';
  } else {
    // Default fallback to root app router structure
    targetPath = path.join(absoluteDir, 'app', 'api', 'livelocale', `route.${fileExt}`);
    routerType = 'Default App Router (app/ not found)';
  }

  console.log(`📍 Project structure: ${routerType}`);

  if (routerType.includes('App Router')) {
    content = `import { createLiveLocaleHandler } from 'livelocale/server';
import * as path from 'path';

const handler = createLiveLocaleHandler({
  localesPath: path.resolve('./locales'), // Adjust relative to project root
});

export const GET = handler;
export const POST = handler;
export const OPTIONS = handler;
`;
  } else {
    content = `import { createLiveLocaleHandler } from 'livelocale/server';
import * as path from 'path';

// Pages Router API route: the handler accepts the (req, res) signature.
const handler = createLiveLocaleHandler({
  localesPath: path.resolve('./locales'), // Adjust relative to project root
});

export default handler;
`;
  }

  // Ensure target folder exists
  const targetDir = path.dirname(targetPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Write file
  try {
    fs.writeFileSync(targetPath, content, 'utf8');
    console.log(`✅ Created API Route Handler successfully at:`);
    console.log(`   ${path.relative(absoluteDir, targetPath)}`);
    if (hasNextIntl) {
      console.log(`\n💡 Detected 'next-intl' in your project!`);
      console.log(
        `   Wrap your translation hook with: import { wrapNextIntl } from 'livelocale/client';`
      );
      console.log(`   const t = wrapNextIntl(useTranslations('namespace'), 'namespace');`);
    } else if (hasReactI18next) {
      console.log(`\n💡 Detected 'react-i18next' in your project!`);
      console.log(`   You can auto-wrap usages by running: npx livelocale migrate`);
    }
    console.log(`\n🎉 Initialization completed successfully!\n`);
  } catch (err: any) {
    console.error(`❌ Failed to write route handler: ${err.message}`);
    process.exit(1);
  }
}

async function runMigrate(args: string[]) {
  let dir = '.';
  let excludes = ['node_modules', '.next', 'dist', '.git'];
  let dryRun = false;

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dir') {
      dir = args[++i] || '.';
    } else if (arg === '--exclude') {
      const val = args[++i];
      if (val) {
        excludes = val.split(',').map((s) => s.trim());
      }
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else {
      // Positional dir arg if not prefixed
      if (arg && !arg.startsWith('--')) {
        dir = arg;
      }
    }
  }

  const absoluteDir = path.resolve(dir);
  if (!fs.existsSync(absoluteDir)) {
    console.error(`Error: Directory "${dir}" does not exist.`);
    process.exit(1);
  }

  // The codemod depends on the optional `typescript` peer; load it only here.
  let transformReactI18next: typeof import('./transform.js').transformReactI18next;
  try {
    const transform = await import('./transform.js');
    await transform.loadTypeScript();
    transformReactI18next = transform.transformReactI18next;
  } catch (err: any) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }

  console.log(`\n🚀 Starting migration scanner...`);
  console.log(`📁 Target: ${absoluteDir}`);
  console.log(`🚫 Excluded: ${excludes.join(', ')}`);
  if (dryRun) {
    console.log(`🧪 Mode: DRY RUN (no files will be modified)`);
  }
  console.log('--------------------------------------------------');

  let scannedCount = 0;
  let migratedCount = 0;

  async function walk(currentDir: string) {
    const files = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const file of files) {
      const fullPath = path.join(currentDir, file.name);

      if (file.isDirectory()) {
        if (excludes.includes(file.name)) {
          continue;
        }
        await walk(fullPath);
      } else if (file.isFile()) {
        const ext = path.extname(file.name);
        if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
          scannedCount++;
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            const result = await transformReactI18next(content, fullPath);

            if (result.modified) {
              migratedCount++;
              const relativePath = path.relative(absoluteDir, fullPath);
              if (dryRun) {
                console.log(`[DRY RUN] Would migrate: ${relativePath}`);
              } else {
                fs.writeFileSync(fullPath, result.code, 'utf8');
                console.log(`✅ Migrated: ${relativePath}`);
              }
            }
          } catch (err: any) {
            console.error(`❌ Error processing file ${fullPath}:`, err.message);
          }
        }
      }
    }
  }

  try {
    await walk(absoluteDir);
  } catch (err: any) {
    console.error(`❌ Walk error:`, err.message);
  }

  console.log('--------------------------------------------------');
  console.log(`📊 Summary:`);
  console.log(`   Scanned:  ${scannedCount} files`);
  if (dryRun) {
    console.log(`   Would migrate: ${migratedCount} files`);
  } else {
    console.log(`   Migrated: ${migratedCount} files`);
  }
  console.log(`\n🎉 Done!`);
}

async function runDoctorCommand(args: string[]) {
  let dir = '.';
  let localesPath: string | undefined;
  let app: { origin: string; base: string } | undefined;
  let share = false;
  let token: string | undefined;
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dir') {
      dir = args[++i] || '.';
    } else if (arg === '--locales') {
      localesPath = args[++i];
    } else if (arg === '--app') {
      app = normalizeAppArg(args[++i] || '');
    } else if (arg === '--share') {
      share = true;
    } else if (arg === '--token') {
      token = args[++i];
    } else if (arg && !arg.startsWith('--')) {
      dir = arg;
    }
  }

  const projectDir = path.resolve(dir);
  if (!fs.existsSync(projectDir)) {
    console.error(`Error: Directory "${dir}" does not exist.`);
    process.exit(1);
  }

  console.log(`
🩺 LiveLocale doctor — ${projectDir}`);
  if (app) console.log(`🔗 Probing app at ${app.base}`);
  console.log('--------------------------------------------------');

  const findings = await runDoctor({
    projectDir,
    localesPath,
    appOrigin: app?.origin,
    appBase: app?.base,
    share,
    token,
  });
  console.log(formatFindings(findings));
  console.log('--------------------------------------------------');

  const fails = findings.filter((f) => f.level === 'fail').length;
  const warns = findings.filter((f) => f.level === 'warn').length;
  if (hasFailures(findings)) {
    console.log(`❌ ${fails} problem(s), ${warns} warning(s). Fix the problems above and re-run.`);
    // exitCode, not exit(): open fetch sockets from --app probes crash Node on Windows otherwise.
    process.exitCode = 1;
    return;
  }
  console.log(
    warns > 0
      ? `✅ No blocking problems, ${warns} warning(s) worth a look.`
      : `✅ Everything looks good.`
  );
  const shareLink = findings.find((f) => f.title === 'Share link')?.detail;
  if (shareLink) console.log(`🔗 Share link: ${shareLink}`);
  if (!app) {
    console.log(
      `💡 Start your dev server and re-run with --app http://localhost:3000 for live checks.`
    );
  }
}

async function runCheckCommand(args: string[]) {
  let dir = '.';
  let localesPath: string | undefined;
  let sourceLocale: string | undefined;
  let unused = true;
  let strict = false;
  let json = false;
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dir') {
      dir = args[++i] || '.';
    } else if (arg === '--locales') {
      localesPath = args[++i];
    } else if (arg === '--source') {
      sourceLocale = args[++i];
    } else if (arg === '--no-unused') {
      unused = false;
    } else if (arg === '--strict') {
      strict = true;
    } else if (arg === '--json') {
      json = true;
    } else if (arg && !arg.startsWith('--')) {
      dir = arg;
    }
  }

  const projectDir = path.resolve(dir);
  if (!fs.existsSync(projectDir)) {
    console.error(`Error: Directory "${dir}" does not exist.`);
    process.exit(1);
  }

  let report;
  try {
    report = await runCheck({ projectDir, localesPath, sourceLocale, unused, strict });
  } catch (err: any) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }

  const failed = hasCheckFailures(report);
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    // exitCode, not exit(): exiting immediately can truncate a large report piped to another tool.
    process.exitCode = failed ? 1 : 0;
    return;
  }

  console.log(`\n🔎 LiveLocale check — ${projectDir}`);
  console.log(
    `🌐 Locales: ${report.locales.join(', ') || 'none'}` +
      (report.sourceLocale ? ` (source: ${report.sourceLocale})` : '') +
      ` · ${report.codeKeyCount} key(s) referenced in code`
  );
  console.log('--------------------------------------------------');
  if (report.issues.length > 0) {
    console.log(formatCheckReport(report));
    console.log('--------------------------------------------------');
  }

  const fails = report.issues.filter((i) => i.level === 'fail').length;
  const warns = report.issues.filter((i) => i.level === 'warn').length;
  if (failed) {
    console.log(`❌ ${fails} problem(s), ${warns} warning(s).`);
    process.exitCode = 1;
    return;
  }
  console.log(
    warns > 0 ? `✅ No problems, ${warns} warning(s) worth a look.` : `✅ Translations look good.`
  );
}

const PACK_USAGE = 'Usage: livelocale pack <outDir> [options]';

/** Prints each pack warning, then where the share folder went and the link path to open. */
function printPackSummary(result: PackResult, projectDir: string, warnings: string[]) {
  for (const warning of warnings) console.log(`⚠️  ${warning}`);
  const outRel =
    path.relative(projectDir, path.dirname(result.shareDir)).split(path.sep).join('/') || '.';
  console.log(
    `✅ LiveLocale share folder written to ${outRel}/livelocale/ (${result.manifest.locales.length} locales, ${result.manifest.codeKeys.length} code keys, ${result.htmlInjected.length} HTML files linked).`
  );
  console.log(`🔗 Open ${result.shareUrlPath} on the deployed site.`);
}

async function runPackCommand(args: string[]) {
  try {
    const options = parseShareArgs(args.slice(1));
    if (
      options.positional.length !== 1 ||
      options.out !== undefined ||
      options.preview ||
      options.command.length > 0
    ) {
      throw new PackError('USAGE', PACK_USAGE);
    }
    const projectDir = path.resolve(options.dir);
    const result = await packOutput({
      projectDir,
      outDir: options.positional[0]!,
      localesPath: options.locales,
      sourceLocale: options.source,
      base: options.base,
      exposeRepo: options.exposeRepo,
      injectHtml: options.inject ? 'auto' : false,
    });
    printPackSummary(result, projectDir, result.warnings);
  } catch (err) {
    if (!(err instanceof PackError)) throw err;
    console.error(`❌ ${err.message}`);
    process.exitCode = 1;
  }
}

async function runBuildCli(args: string[]) {
  try {
    const options = parseShareArgs(args.slice(1));
    if (options.positional.length > 0 || !options.inject) {
      throw new PackError('USAGE', BUILD_USAGE);
    }
    const projectDir = path.resolve(options.dir);
    const result = await runBuildCommand({
      projectDir,
      command: options.command,
      preview: options.preview,
      outDir: options.out,
      localesPath: options.locales,
      sourceLocale: options.source,
      base: options.base,
      exposeRepo: options.exposeRepo,
    });
    if (result.pack !== null) {
      printPackSummary(result.pack, projectDir, result.warnings);
    } else {
      for (const warning of result.warnings) console.log(`⚠️  ${warning}`);
    }
    process.exitCode = result.exitCode;
  } catch (err) {
    if (!(err instanceof PackError)) throw err;
    console.error(`❌ ${err.message}`);
    process.exitCode = 1;
  }
}

async function run() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h') || args[0] === 'help') {
    printHelp();
    process.exit(0);
  }

  const COMMANDS = ['migrate', 'init', 'studio', 'doctor', 'check', 'pack', 'build', 'apply'];
  if (!args[0] || !COMMANDS.includes(args[0])) {
    console.error(`Unknown command: "${args[0]}". Expected one of: ${COMMANDS.join(', ')}.`);
    printHelp();
    process.exit(1);
  }

  if (args[0] === 'doctor') {
    await runDoctorCommand(args);
    return;
  }

  if (args[0] === 'check') {
    await runCheckCommand(args);
    return;
  }

  if (args[0] === 'pack') {
    await runPackCommand(args);
    return;
  }

  if (args[0] === 'build') {
    await runBuildCli(args);
    return;
  }

  if (args[0] === 'apply') {
    await runApplyCommand(args.slice(1));
    return;
  }

  if (args[0] === 'init') {
    let dir = '.';
    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      if (arg === '--dir') {
        dir = args[++i] || '.';
      } else if (arg && !arg.startsWith('--')) {
        dir = arg;
      }
    }
    runInit(dir);
    process.exit(0);
  }

  if (args[0] === 'studio') {
    let port = DEFAULT_STUDIO_PORT;
    let appOrigin = DEFAULT_APP_ORIGIN;
    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      if (arg === '--port') {
        const val = parseInt(args[++i] || String(DEFAULT_STUDIO_PORT), 10);
        if (!isNaN(val)) port = val;
      } else if (arg === '--app') {
        appOrigin = normalizeOriginArg(args[++i] || '', '--app');
      }
    }
    await runStudio(port, appOrigin);
    return;
  }

  await runMigrate(args);
}

run().catch((err: any) => {
  console.error(`❌ ${err?.message || err}`);
  process.exit(1);
});
