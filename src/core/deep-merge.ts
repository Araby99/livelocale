/**
 * Recursively merges `source` into `target`.
 *
 * Arrays and primitives in `source` replace `target` values; plain objects
 * are merged depth-first.
 */
export function deepMerge(target: any, source: any): any {
  if (typeof target !== 'object' || target === null) return source;
  if (typeof source !== 'object' || source === null) return target;

  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (key in target) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
