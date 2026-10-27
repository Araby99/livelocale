import type { GitRunner } from '../../../src/server/build-info.js';

/**
 * A scripted git runner. Each answer is keyed by the arguments joined with a
 * space; a missing key answers null, like a failed git command. `calls`
 * records every invocation in order.
 */
export function fakeGit(answers: Record<string, string | null>): GitRunner & { calls: string[] } {
  const calls: string[] = [];
  const runner = async (args: string[]): Promise<string | null> => {
    const key = args.join(' ');
    calls.push(key);
    return Object.prototype.hasOwnProperty.call(answers, key) ? (answers[key] ?? null) : null;
  };
  return Object.assign(runner, { calls });
}
