import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/** The largest input `apply` reads from an argument, a file, stdin or the clipboard. */
export const MAX_APPLY_INPUT_BYTES = 1_048_576;

const TOO_LARGE_MESSAGE = 'The input is larger than 1 MB.';
const NO_INPUT_MESSAGE =
  'Pass the change link, a file that holds it, "-" to read stdin, or --clipboard. ' +
  '(cmd.exe cuts arguments at 8,191 characters; use --clipboard or a file for long links.)';
const NO_CLIPBOARD_MESSAGE =
  'Could not read the clipboard. Save the change link to a file and pass the file instead.';

/** A problem with what `apply` was asked to read. Its message is safe to print. */
export class ApplyInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApplyInputError';
  }
}

export interface ApplyInputOptions {
  /** Relative file paths resolve against this directory. */
  cwd: string;
  /** Read the clipboard instead of the argument. */
  clipboard?: boolean;
  /** Read for `-`. Defaults to `process.stdin`. */
  stdin?: NodeJS.ReadableStream;
  /** Defaults to {@link readClipboard}. */
  readClipboard?: () => Promise<string>;
}

function checkSize(text: string): string {
  if (Buffer.byteLength(text, 'utf8') > MAX_APPLY_INPUT_BYTES) {
    throw new ApplyInputError(TOO_LARGE_MESSAGE);
  }
  return text;
}

async function readStream(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const bytes = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_APPLY_INPUT_BYTES) throw new ApplyInputError(TOO_LARGE_MESSAGE);
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** The file `arg` names when it is an existing file under `cwd`, else null. */
function existingFile(arg: string, cwd: string): string | null {
  try {
    const resolved = path.resolve(cwd, arg);
    return fs.statSync(resolved, { throwIfNoEntry: false })?.isFile() ? resolved : null;
  } catch {
    // A link is rarely a valid path (too long, or characters the OS rejects).
    return null;
  }
}

/**
 * Returns the raw text that holds the link; decodeChangeLink finds the token
 * (fenced block first). `-` reads stdin, an existing file (relative to `cwd`)
 * is read, and any other argument is the text itself.
 */
export async function readApplyInput(
  arg: string | undefined,
  options: ApplyInputOptions
): Promise<string> {
  if (options.clipboard) return checkSize(await (options.readClipboard ?? readClipboard)());
  if (arg === undefined || arg === '') throw new ApplyInputError(NO_INPUT_MESSAGE);
  if (arg === '-') return readStream(options.stdin ?? process.stdin);

  const file = existingFile(arg, options.cwd);
  if (file === null) return checkSize(arg);
  if (fs.statSync(file).size > MAX_APPLY_INPUT_BYTES) throw new ApplyInputError(TOO_LARGE_MESSAGE);
  return checkSize(fs.readFileSync(file, 'utf8'));
}

type ClipboardCommand = [command: string, args: string[]];

function clipboardCommands(platform: NodeJS.Platform): ClipboardCommand[] {
  if (platform === 'win32') {
    return [
      ['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-Clipboard -Raw']],
    ];
  }
  if (platform === 'darwin') return [['pbpaste', []]];
  return [
    ['wl-paste', ['--no-newline']],
    ['xclip', ['-selection', 'clipboard', '-o']],
    ['xsel', ['--clipboard', '--output']],
  ];
}

const TOO_LARGE = Symbol('too large');

/** Resolves to stdout, null when the command fails, or TOO_LARGE. */
function run(
  execFileImpl: typeof execFile,
  [command, args]: ClipboardCommand
): Promise<string | null | typeof TOO_LARGE> {
  return new Promise((resolve) => {
    try {
      execFileImpl(
        command,
        args,
        { encoding: 'utf8', windowsHide: true, maxBuffer: MAX_APPLY_INPUT_BYTES + 1 },
        (error, stdout) => {
          const code = (error as NodeJS.ErrnoException | null)?.code;
          if (code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') resolve(TOO_LARGE);
          else resolve(error ? null : String(stdout));
        }
      );
    } catch {
      resolve(null);
    }
  });
}

/**
 * Reads the system clipboard: PowerShell on Windows, `pbpaste` on macOS, and
 * `wl-paste`, then `xclip`, then `xsel` on Linux. Throws `ApplyInputError`
 * when no command works or the text is larger than 1 MB.
 */
export async function readClipboard(
  execFileImpl: typeof execFile = execFile,
  platform: NodeJS.Platform = process.platform
): Promise<string> {
  for (const command of clipboardCommands(platform)) {
    const text = await run(execFileImpl, command);
    if (text === TOO_LARGE) throw new ApplyInputError(TOO_LARGE_MESSAGE);
    if (text !== null) return checkSize(text);
  }
  throw new ApplyInputError(NO_CLIPBOARD_MESSAGE);
}
