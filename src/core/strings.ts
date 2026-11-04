/**
 * Removes every trailing `/` from `value` in one backward scan.
 *
 * Same result as `value.replace(/\/+$/, '')`, without that regex's quadratic
 * backtracking on long runs of `/` that do not end the string.
 */
export function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 0x2f) end -= 1;
  return value.slice(0, end);
}
