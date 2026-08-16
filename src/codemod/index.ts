#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { fileURLToPath } from 'url';
import { transformReactI18next } from './transform.js';

const getDirname = () => {
  try {
    return __dirname;
  } catch {
    return path.dirname(fileURLToPath(import.meta.url));
  }
};

function printHelp() {
  console.log(`
next-i18n-lens CLI

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
  --port <number>    Port to run the studio server on (default: 3010)

Global Options:
  -h, --help         Show help information
`);
}

function runStudio(projectDir: string, port: number) {
  console.log(`\n🚀 Starting next-i18n-lens Visual Studio...`);
  const studioDir = path.resolve(getDirname(), '../studio');

  if (!fs.existsSync(studioDir)) {
    console.error(`Error: Studio directory not found at "${studioDir}".`);
    console.error(`Did you build the project? Run "npm run build" first.`);
    process.exit(1);
  }

  const mimeTypes: Record<string, string> = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.json': 'application/json',
  };

  const server = http.createServer((req, res) => {
    // RULE SEC-009: Never reflect arbitrary origins — only localhost clients.
    const origin = req.headers.origin || '';
    const isLocalhostOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    if (isLocalhostOrigin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    // RULE SEC-010: PATH CONTAINMENT — resolve the requested path and verify
    // it stays inside the studio directory (blocks /../../etc/passwd escapes).
    const urlPath = req.url?.split('?')[0] || '/';
    let filePath: string;
    try {
      filePath = path.resolve(studioDir, `.${decodeURIComponent(urlPath)}`);
    } catch {
      res.statusCode = 400;
      res.end('Bad Request');
      return;
    }

    if (filePath !== studioDir && !filePath.startsWith(studioDir + path.sep)) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }

    if (urlPath === '/' || filePath === studioDir) {
      filePath = path.join(studioDir, 'index.html');
    }

    // Fallback to index.html for SPA client-side routing
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(studioDir, 'index.html');
    }

    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.statusCode = 550;
        res.end(`Server Error: ${err.code}`);
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
      }
    });
  });

  server.listen(port, () => {
    console.log(`\n🎨 next-i18n-lens Visual Translation Studio is running!`);
    console.log(`📡 URL: http://localhost:${port}`);
    console.log(`💡 Press Ctrl+C to stop the studio server.\n`);
  });
}

function runInit(projectDir: string) {
  console.log(`\n🚀 Initializing next-i18n-lens API handler...`);
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

  // 2. Check for App Router vs Pages Router
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
    console.log(`\n🎉 Initialization completed successfully!\n`);
  } catch (err: any) {
    console.error(`❌ Failed to write route handler: ${err.message}`);
    process.exit(1);
  }
}

function run() {
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
    let port = 3010;
    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      if (arg === '--port') {
        const val = parseInt(args[++i] || '3010', 10);
        if (!isNaN(val)) port = val;
      }
    }
    runStudio(process.cwd(), port);
    return;
  }

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

  console.log(`\n🚀 Starting migration scanner...`);
  console.log(`📁 Target: ${absoluteDir}`);
  console.log(`🚫 Excluded: ${excludes.join(', ')}`);
  if (dryRun) {
    console.log(`🧪 Mode: DRY RUN (no files will be modified)`);
  }
  console.log('--------------------------------------------------');

  let scannedCount = 0;
  let migratedCount = 0;

  function walk(currentDir: string) {
    const files = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const file of files) {
      const fullPath = path.join(currentDir, file.name);

      if (file.isDirectory()) {
        if (excludes.includes(file.name)) {
          continue;
        }
        walk(fullPath);
      } else if (file.isFile()) {
        const ext = path.extname(file.name);
        if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
          scannedCount++;
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            const result = transformReactI18next(content, fullPath);

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
    walk(absoluteDir);
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

run();
