import * as fs from 'fs';

/**
 * Deletes a test's temporary folder. On Windows a just-exited child process, the indexer or an
 * antivirus scan can hold the folder for a moment, so removal is retried; if it still fails, the
 * folder is left behind with a warning instead of failing the test.
 */
export function removeTempDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch (error) {
    console.warn(`Could not remove temporary folder ${dir}: ${(error as Error).message}`);
  }
}
