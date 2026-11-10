#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';
import { moduleDir } from '../server/module-dir.js';
import { createStudioServer } from './studio-server.js';
import { runDoctor, formatFindings, hasFailures, devServerPort } from './doctor.js';
import { runCheck, formatCheckReport } from './check.js';
import {
  checkErrorReport,
  checkExitCode,
  checkHeaderLines,
  checkSummaryLines,
  CHECK_COULD_NOT_RUN,
  parseCheckArgs,
  withCheckError,
} from './check-cli.js';
import {
  checkBuildArgs,
  checkPackArgs,
  packOutput,
  parseShareArgs,
  runBuildCommand,
  type PackResult,
} from '../server/pack.js';
import { PackError } from '../server/pack-error.js';
import { runApplyCommand } from './apply/cli.js';
import { planInitShare, writePlannedFiles } from './init-share.js';
import { planInitRoute } from './init-route.js';
import { readOwnVersion } from '../server/module-dir.js';
import { findGlobalOption, UsageError, USAGE_EXIT_CODE } from './cli-args.js';
import {
  commandSpec,
  parseDoctorArgs,
  parseInitArgs,
  parseMigrateArgs,
  parseStudioArgs,
  type DoctorArgs,
  type InitArgs,
} from './command-args.js';
import { commandHelpText, helpText } from './help.js';
import { resolveLocalesPath } from '../core/locale-folder.js';
import { runMigrate } from './migrate.js';

function printHelp() {
  console.log(helpText());
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

async function runStudio(port: number, appOrigin: string, appUrl?: string) {
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

  const server = createStudioServer({ studioDir, appOrigin, appUrl });

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
    console.log(`🔗 Editing app at: ${appUrl ?? appOrigin}`);
    console.log(`💡 Press Ctrl+C to stop the studio server.\n`);
  });
}

function runInit(projectDir: string, overwrite: boolean) {
  console.log(`\n🚀 Initializing LiveLocale API handler...`);
  const absoluteDir = path.resolve(projectDir);
  if (!fs.existsSync(absoluteDir)) {
    console.error(`Error: Directory "${projectDir}" does not exist.`);
    process.exit(1);
  }

  const plan = planInitRoute(absoluteDir);
  if (plan.kind === 'astro' || plan.kind === 'vite') {
    console.log(plan.text);
    return;
  }
  if (plan.kind === 'unknown') {
    console.error(`❌ ${plan.text}`);
    process.exitCode = USAGE_EXIT_CODE;
    return;
  }

  const { targetPath, content } = plan;
  const relTarget = path.relative(absoluteDir, targetPath);
  console.log(`📁 Target: ${absoluteDir}`);
  console.log(`🔧 Language detected: ${plan.isTypeScript ? 'TypeScript' : 'JavaScript'}`);
  console.log(`📍 Project structure: ${plan.routerType}`);

  if (plan.existing === 'same') {
    console.log(`✅ ${relTarget} is already there and up to date. Nothing to write.\n`);
    return;
  }
  // The route is where a team sets localesPath, allowedOrigins or a token: keep their edits.
  if (plan.existing === 'different' && !overwrite) {
    console.log(
      `⚠️  ${relTarget} already exists and differs from the default route. Left it unchanged.`
    );
    console.log(`   Pass --overwrite to replace it with the default.\n`);
    return;
  }

  try {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, content, 'utf8');
    console.log(
      plan.existing === 'different'
        ? `✅ Replaced the API Route Handler at:`
        : `✅ Created API Route Handler successfully at:`
    );
    console.log(`   ${relTarget}`);
    if (plan.hasNextIntl) {
      console.log(`\n💡 Detected 'next-intl' in your project!`);
      console.log(
        `   Wrap your translation hook with: import { wrapNextIntl } from 'livelocale/client';`
      );
      console.log(`   const t = wrapNextIntl(useTranslations('namespace'), 'namespace');`);
    } else if (plan.hasReactI18next) {
      console.log(`\n💡 Detected 'react-i18next' in your project!`);
      console.log(`   You can auto-wrap usages by running: npx livelocale migrate`);
    }
    console.log(`\n🎉 Initialization completed successfully!\n`);
  } catch (err: any) {
    console.error(`❌ Failed to write route handler: ${err.message}`);
    process.exit(1);
  }
}

async function runDoctorCommand({ dir, localesPath, app, share, token }: DoctorArgs) {
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
    const port = devServerPort(projectDir);
    console.log(
      `💡 Start your dev server and re-run with --app http://localhost:${port} for live checks.`
    );
  }
}

/**
 * `livelocale check`. Exit 0 clean, 1 problems found, 2 could not run (bad command line, missing
 * folder, missing locales, unknown --source, TypeScript missing for --hardcoded). With --json a
 * run that could not start still prints a report, with an `error` field.
 */
async function runCheckCommand(argv: string[]) {
  const json = argv.includes('--json');
  const couldNotRun = (message: string, localesDir: string | null = null) => {
    if (json) console.log(JSON.stringify(checkErrorReport(message, localesDir), null, 2));
    else console.error(`❌ ${message}`);
    process.exitCode = CHECK_COULD_NOT_RUN;
  };

  let parsed;
  try {
    parsed = parseCheckArgs(argv);
  } catch (err: any) {
    couldNotRun(err.message);
    return;
  }
  const { dir, localesPath, sourceLocale, unused, strict, hardcoded, allow } = parsed;

  const projectDir = path.resolve(dir);
  if (!fs.existsSync(projectDir)) {
    couldNotRun(`Directory "${dir}" does not exist.`);
    return;
  }

  let report;
  try {
    report = await runCheck({
      projectDir,
      localesPath,
      sourceLocale,
      unused,
      strict,
      hardcoded,
      allow,
    });
  } catch (err: any) {
    couldNotRun(
      err?.message ?? String(err),
      path.resolve(projectDir, resolveLocalesPath(projectDir, localesPath).path)
    );
    return;
  }

  // exitCode, not exit(): exiting immediately can truncate a large report piped to another tool.
  process.exitCode = checkExitCode(report);
  if (json) {
    console.log(JSON.stringify(withCheckError(report), null, 2));
    return;
  }

  for (const line of checkHeaderLines(report, projectDir)) console.log(line);
  console.log('--------------------------------------------------');
  if (report.issues.length > 0) {
    console.log(formatCheckReport(report));
    console.log('--------------------------------------------------');
  }

  for (const line of checkSummaryLines(report)) console.log(line);
}

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
    const options = parseShareArgs(args.slice(1), 'pack');
    checkPackArgs(options);
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
    process.exitCode = err.code === 'USAGE' ? USAGE_EXIT_CODE : 1;
  }
}

async function runBuildCli(args: string[]) {
  try {
    const options = parseShareArgs(args.slice(1), 'build');
    checkBuildArgs(options);
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
    process.exitCode = err.code === 'USAGE' ? USAGE_EXIT_CODE : 1;
  }
}

async function runInitShareCommand(args: Extract<InitArgs, { share: true }>) {
  const { dir, localesPath, sourceLocale, branches, overwrite } = args;

  const projectDir = path.resolve(dir);
  if (!fs.existsSync(projectDir)) {
    console.error(`Error: Directory "${dir}" does not exist.`);
    process.exit(1);
  }

  try {
    const plan = await planInitShare({
      projectDir,
      localesPath,
      sourceLocale,
      branches,
      version: readOwnVersion(),
      overwrite,
    });
    writePlannedFiles(projectDir, plan.files);
    console.log(`
🚀 LiveLocale share link setup (${plan.stack})`);
    for (const file of plan.files) {
      console.log(
        `  ${file.action.padEnd(9)} ${file.path}${file.reason ? ` (${file.reason})` : ''}`
      );
    }
    for (const note of plan.notes) console.log(`💡 ${note}`);
    console.log('Commit and push: the workflow must be on the default branch.');
  } catch (err: any) {
    console.error(`❌ ${err.message}`);
    process.exitCode = 1;
  }
}

const COMMANDS = ['migrate', 'init', 'studio', 'doctor', 'check', 'pack', 'build', 'apply'];

async function run() {
  const args = process.argv.slice(2);
  // Global flags count only before `--` (`build -- next build -h` passes -h to the build) and
  // never as an option's value (`check --source -v` is a missing value).
  const global = args[0] === 'help' ? 'help' : findGlobalOption(args, commandSpec(args[0]));
  if (global === 'help') {
    // `check --help` and `help check` print that command's part; anything else, all of it.
    const topic = args[0] === 'help' ? args[1] : args[0];
    console.log((topic !== undefined && commandHelpText(topic)) || helpText());
    return;
  }
  if (global === 'version') {
    console.log(readOwnVersion());
    return;
  }

  const [command, ...rest] = args;
  if (command === undefined) {
    printHelp();
    throw new UsageError(
      'Missing command. Run livelocale <command>, for example livelocale check.'
    );
  }
  if (!COMMANDS.includes(command)) {
    throw new UsageError(`Unknown command "${command}". Expected one of: ${COMMANDS.join(', ')}.`);
  }

  switch (command) {
    case 'doctor':
      return runDoctorCommand(parseDoctorArgs(rest));
    case 'check':
      return runCheckCommand(rest);
    case 'pack':
      return runPackCommand(args);
    case 'build':
      return runBuildCli(args);
    case 'apply':
      return runApplyCommand(rest);
    case 'init': {
      const init = parseInitArgs(rest);
      if (init.share) return runInitShareCommand(init);
      runInit(init.dir, init.overwrite);
      return;
    }
    case 'studio': {
      const { port, appOrigin, appUrl } = parseStudioArgs(rest);
      return runStudio(port, appOrigin, appUrl);
    }
    default:
      process.exitCode = await runMigrate(parseMigrateArgs(rest));
      return;
  }
}

run().catch((err: any) => {
  if (err instanceof UsageError) {
    console.error(`❌ ${err.message}`);
    process.exitCode = USAGE_EXIT_CODE;
    return;
  }
  console.error(`❌ ${err?.message || err}`);
  process.exit(1);
});
