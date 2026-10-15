import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import type { GitGateway, GitStatus, GitChange, GitChangeStatus } from './router.js';

const execFileAsync = promisify(execFile);

/** Diffs larger than this are truncated so the Studio never receives megabytes of JSON. */
const MAX_DIFF_BYTES = 200_000;

function mapStatus(xy: string): GitChangeStatus {
  if (xy === '??') return 'added';
  const code = xy.trim()[0] ?? '';
  switch (code) {
    case 'M':
      return 'modified';
    case 'A':
      return 'added';
    case 'D':
      return 'deleted';
    case 'R':
      return 'renamed';
    default:
      return 'modified';
  }
}

/**
 * Thin wrapper over the `git` CLI, scoped to the locales directory. Every
 * command receives arguments as an array (no shell), and every path argument
 * is the locales directory relative to the repository root, so the Studio can
 * only ever stage, commit, or discard translation files.
 */
export class GitClient implements GitGateway {
  private async git(cwd: string, args: string[]): Promise<string> {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    return stdout;
  }

  /** Resolves the repository root and the locales path relative to it (forward slashes). */
  private async locate(
    localesPath: string
  ): Promise<{ root: string; rel: string; absolute: string } | null> {
    const absolute = path.resolve(localesPath);
    const cwd = fs.existsSync(absolute) ? absolute : path.dirname(absolute);
    if (!fs.existsSync(cwd)) return null;
    try {
      const root = (await this.git(cwd, ['rev-parse', '--show-toplevel'])).trim();
      if (!root) return null;
      const rel = path.relative(root, absolute).split(path.sep).join('/');
      if (rel.startsWith('..')) return null; // locales directory lives outside the repo
      return { root: path.resolve(root), rel: rel || '.', absolute };
    } catch {
      return null;
    }
  }

  async status(localesPath: string): Promise<GitStatus> {
    const loc = await this.locate(localesPath);
    if (!loc) return { isRepo: false, branch: null, changes: [] };

    let branch: string | null = null;
    try {
      branch = (await this.git(loc.root, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim() || null;
    } catch {
      branch = null; // fresh repository without commits
    }

    const changes: GitChange[] = [];
    try {
      const out = await this.git(loc.root, [
        'status',
        '--porcelain=v1',
        '--untracked-files=all',
        '--',
        loc.rel,
      ]);
      for (const line of out.split('\n')) {
        if (line.length < 4) continue;
        const xy = line.slice(0, 2);
        let file = line.slice(3).trim();
        const arrow = file.indexOf(' -> ');
        if (arrow !== -1) file = file.slice(arrow + 4);
        if (file.startsWith('"') && file.endsWith('"')) file = file.slice(1, -1);
        changes.push({ path: file, status: mapStatus(xy) });
      }
    } catch {}

    return { isRepo: true, branch, changes, mode: 'local', pullRequestUrl: null };
  }

  async diff(localesPath: string): Promise<string> {
    const loc = await this.locate(localesPath);
    if (!loc) return '';

    let out = '';
    try {
      out = await this.git(loc.root, ['diff', '--no-color', '--', loc.rel]);
    } catch {}

    // Untracked files are not part of `git diff`; synthesize an all-additions hunk.
    try {
      const untracked = await this.git(loc.root, [
        'ls-files',
        '--others',
        '--exclude-standard',
        '--',
        loc.rel,
      ]);
      for (const file of untracked
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)) {
        const full = path.join(loc.root, file);
        let content = '';
        try {
          content = fs.readFileSync(full, 'utf-8');
        } catch {
          continue;
        }
        const lines = content.split('\n');
        if (lines[lines.length - 1] === '') lines.pop();
        out +=
          `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n` +
          `@@ -0,0 +1,${lines.length} @@\n` +
          lines.map((l) => `+${l}`).join('\n') +
          '\n';
      }
    } catch {}

    if (Buffer.byteLength(out, 'utf-8') > MAX_DIFF_BYTES) {
      out = out.slice(0, MAX_DIFF_BYTES) + '\n… diff truncated …\n';
    }
    return out;
  }

  async commit(localesPath: string, message: string): Promise<{ hash: string }> {
    const loc = await this.locate(localesPath);
    if (!loc) throw new Error('Not a git repository.');

    const status = await this.status(localesPath);
    if (status.changes.length === 0) {
      throw new Error(`No changes to commit under ${loc.rel}.`);
    }

    await this.git(loc.root, ['add', '-A', '--', loc.rel]);
    await this.git(loc.root, ['commit', '-q', '-m', message, '--', loc.rel]);
    const hash = (await this.git(loc.root, ['rev-parse', '--short', 'HEAD'])).trim();
    return { hash };
  }

  async discard(localesPath: string): Promise<void> {
    const loc = await this.locate(localesPath);
    if (!loc) throw new Error('Not a git repository.');

    try {
      await this.git(loc.root, ['checkout', '--', loc.rel]);
    } catch {
      // No tracked files under the locales directory yet; nothing to restore.
    }
    await this.git(loc.root, ['clean', '-fd', '--', loc.rel]);
  }
}
