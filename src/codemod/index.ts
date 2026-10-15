#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createStudioServer } from './studio-server.js';

const getDirname = () => {
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }
  return path.dirname(fileURLToPath((import.meta as any).url));
};

const DEFAULT_STUDIO_PORT = 3010;
const DEFAULT_APP_ORIGIN = 'http://localhost:3000';

function printHelp() {
  console.log(`
i18n Lens (next-i18n-lens) CLI

Usage:
  npx next-i18n-lens <command> [options]

Commands:
  migrate     Bulk migrate existing react-i18next translation usages to wrap them with wrapTranslationEngine automatically.
  init        Initialize the API route handler inside a Next.js project automatically.
  studio      Start the visual editing studio local web server.

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

function runStudio(port: number, appOrigin: string) {
  console.log(`\n🚀 Starting i18n Lens Studio...`);
  const studioDir = path.resolve(getDirname(), '../studio');

  if (!fs.existsSync(path.join(studioDir, 'index.html'))) {
    console.error(`Error: Studio assets not found at "${studioDir}".`);
    console.error(`Did you build the project? Run "npm run build" first.`);
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
    console.log(`\n🎨 i18n Lens Studio is running!`);
    console.log(`📡 Studio: http://localhost:${port}`);
    console.log(`🔗 Editing app at: ${appOrigin}`);
    console.log(`💡 Press Ctrl+C to stop the studio server.\n`);
  });
}

function runInit(projectDir: string) {
  console.log(`\n🚀 Initializing i18n Lens API handler...`);
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
    targetPath = path.join(appDirPath, 'api', 'i18n-lens', 'mutate', `route.${fileExt}`);
    routerType = 'Next.js App Router (root)';
  } else if (fs.existsSync(srcAppDirPath)) {
    targetPath = path.join(srcAppDirPath, 'api', 'i18n-lens', 'mutate', `route.${fileExt}`);
    routerType = 'Next.js App Router (src/)';
  } else if (fs.existsSync(pagesDirPath)) {
    targetPath = path.join(pagesDirPath, 'api', 'i18n-lens', `mutate.${fileExt}`);
    routerType = 'Next.js Pages Router (root)';
  } else if (fs.existsSync(srcPagesDirPath)) {
    targetPath = path.join(srcPagesDirPath, 'api', 'i18n-lens', `mutate.${fileExt}`);
    routerType = 'Next.js Pages Router (src/)';
  } else {
    // Default fallback to root app router structure
    targetPath = path.join(absoluteDir, 'app', 'api', 'i18n-lens', 'mutate', `route.${fileExt}`);
    routerType = 'Default App Router (app/ not found)';
  }

  console.log(`📍 Project structure: ${routerType}`);

  if (routerType.includes('App Router')) {
    content = `import { createI18nLensHandler } from 'next-i18n-lens/server';
import * as path from 'path';

const handler = createI18nLensHandler({
  localesPath: path.resolve('./locales'), // Adjust relative to project root
});

export const GET = handler;
export const POST = handler;
export const OPTIONS = handler;
`;
  } else {
    content = `import { createI18nLensHandler } from 'next-i18n-lens/server';
import * as path from 'path';

// Pages Router API route: the handler accepts the (req, res) signature.
const handler = createI18nLensHandler({
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
        `   Wrap your translation hook with: import { wrapNextIntl } from 'next-i18n-lens/client';`
      );
      console.log(`   const t = wrapNextIntl(useTranslations('namespace'), 'namespace');`);
    } else if (hasReactI18next) {
      console.log(`\n💡 Detected 'react-i18next' in your project!`);
      console.log(`   You can auto-wrap usages by running: npx next-i18n-lens migrate`);
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

async function run() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h') || args[0] === 'help') {
    printHelp();
    process.exit(0);
  }

  // Expect command: migrate, init, or studio
  if (args[0] !== 'migrate' && args[0] !== 'init' && args[0] !== 'studio') {
    console.error(`Unknown command: "${args[0]}". Did you mean "migrate", "init", or "studio"?`);
    printHelp();
    process.exit(1);
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
    runStudio(port, appOrigin);
    return;
  }

  await runMigrate(args);
}

run().catch((err: any) => {
  console.error(`❌ ${err?.message || err}`);
  process.exit(1);
});
