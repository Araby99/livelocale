import { execFileSync } from 'child_process';

/** Per-test timeout for tests that run real git commands, sized for a loaded machine. */
export const REAL_GIT_TEST_TIMEOUT = 30_000;

/**
 * Runs one git command synchronously and returns its trimmed output. It never prompts, and a
 * command that runs longer than 20 s is killed, so a stuck git fails the test with a clear error.
 */
export function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    timeout: 20_000,
    windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  }).trim();
}

/**
 * Turns off the git features that leave a background process behind after a command returns
 * (auto gc, auto maintenance, the fsmonitor daemon), so nothing holds the folder at cleanup.
 */
export function disableBackgroundGit(repo: string): void {
  git(repo, 'config', 'gc.auto', '0');
  git(repo, 'config', 'maintenance.auto', 'false');
  git(repo, 'config', 'core.fsmonitor', 'false');
}
