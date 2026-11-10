/** Parsers of the commands that have no module of their own: `migrate`, `init`, `studio`, `doctor`. */

import { normalizeAppUrl } from './doctor.js';
import {
  folderArg,
  parseCommandArgs,
  splitList,
  UsageError,
  type CommandSpec,
} from './cli-args.js';
import { COMMAND_SPECS } from './command-specs.js';

export { COMMAND_SPECS };

/** The option spec of a command word (`build` shares `pack`'s), or undefined for an unknown one. */
export function commandSpec(command: string | undefined): CommandSpec | undefined {
  const name = command === 'build' ? 'pack' : command;
  return name !== undefined && Object.prototype.hasOwnProperty.call(COMMAND_SPECS, name)
    ? COMMAND_SPECS[name as keyof typeof COMMAND_SPECS]
    : undefined;
}

export const DEFAULT_STUDIO_PORT = 3010;
export const DEFAULT_APP_ORIGIN = 'http://localhost:3000';
const DEFAULT_EXCLUDES = ['node_modules', '.next', 'dist', '.git'];

export interface MigrateArgs {
  dir: string;
  excludes: string[];
  dryRun: boolean;
}

/** Parses the arguments after `migrate`. */
export function parseMigrateArgs(argv: string[]): MigrateArgs {
  const parsed = parseCommandArgs(COMMAND_SPECS.migrate, argv);
  const exclude = parsed.values['--exclude'];
  return {
    dir: folderArg(parsed),
    excludes: exclude === undefined ? [...DEFAULT_EXCLUDES] : splitList(exclude),
    dryRun: parsed.flags.has('--dry-run'),
  };
}

export interface DoctorArgs {
  dir: string;
  localesPath?: string;
  app?: { origin: string; base: string };
  share: boolean;
  token?: string;
}

/** Parses the arguments after `doctor`. */
export function parseDoctorArgs(argv: string[]): DoctorArgs {
  const parsed = parseCommandArgs(COMMAND_SPECS.doctor, argv);
  const app = parsed.values['--app'];
  const args: DoctorArgs = { dir: folderArg(parsed), share: parsed.flags.has('--share') };
  if (parsed.values['--locales'] !== undefined) args.localesPath = parsed.values['--locales'];
  if (parsed.values['--token'] !== undefined) args.token = parsed.values['--token'];
  if (app !== undefined) {
    try {
      args.app = normalizeAppUrl(app);
    } catch {
      throw new UsageError(
        `--app must be an http(s) URL such as http://localhost:3000 or https://user.github.io/repo/ (got "${app}").`
      );
    }
  }
  return args;
}

export interface StudioArgs {
  port: number;
  appOrigin: string;
  /** The full `--app` URL when it has a path, query or hash: the page the Studio opens first. */
  appUrl?: string;
}

/** Parses the arguments after `studio`. */
export function parseStudioArgs(argv: string[]): StudioArgs {
  const parsed = parseCommandArgs(COMMAND_SPECS.studio, argv);
  const port = parsed.values['--port'];
  const app = parsed.values['--app'];
  const args: StudioArgs = { port: DEFAULT_STUDIO_PORT, appOrigin: DEFAULT_APP_ORIGIN };
  if (port !== undefined) {
    const value = Number(port);
    if (!/^\d+$/.test(port) || value < 1 || value > 65535) {
      throw new UsageError(`--port must be a port number from 1 to 65535 (got "${port}").`);
    }
    args.port = value;
  }
  if (app !== undefined) {
    try {
      const url = new URL(app);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('bad protocol');
      args.appOrigin = url.origin;
      if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
        args.appUrl = url.origin + url.pathname + url.search + url.hash;
      }
    } catch {
      throw new UsageError(
        `--app must be an http(s) URL such as http://localhost:3001 (got "${app}").`
      );
    }
  }
  return args;
}

export type InitArgs =
  | { share: false; dir: string; overwrite: boolean }
  | {
      share: true;
      dir: string;
      localesPath?: string;
      sourceLocale?: string;
      branches?: string[];
      overwrite: boolean;
    };

const SHARE_ONLY = ['--locales', '--source', '--branches'] as const;

/** Parses the arguments after `init`, with or without `--share`. */
export function parseInitArgs(argv: string[]): InitArgs {
  const parsed = parseCommandArgs(COMMAND_SPECS.init, argv);
  if (!parsed.flags.has('--share')) {
    for (const flag of SHARE_ONLY) {
      if (parsed.values[flag] !== undefined || parsed.flags.has(flag)) {
        throw new UsageError(`${flag} only works with init --share.`);
      }
    }
    return { share: false, dir: folderArg(parsed), overwrite: parsed.flags.has('--overwrite') };
  }
  const folder = parsed.positionals[0];
  if (folder !== undefined) {
    throw new UsageError(
      `init --share takes the project folder as --dir ${folder}, not as a plain argument.`
    );
  }
  const branches = parsed.values['--branches'];
  return {
    share: true,
    dir: parsed.values['--dir'] ?? '.',
    localesPath: parsed.values['--locales'],
    sourceLocale: parsed.values['--source'],
    branches: branches === undefined ? undefined : splitList(branches),
    overwrite: parsed.flags.has('--overwrite'),
  };
}
