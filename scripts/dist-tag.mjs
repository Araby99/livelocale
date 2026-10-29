// Maps a package version to its npm dist-tag, and builds the x.y.z-next.N prerelease version.
// Used by .github/workflows/publish.yml; no dependencies, so it runs right after `npm ci`.
import { pathToFileURL } from 'node:url';

const RELEASE = /^\d+\.\d+\.\d+$/;
const NEXT = /^\d+\.\d+\.\d+-next\.\d+$/;

/**
 * @param {string} version
 * @returns {'latest' | 'next'}
 */
export function distTagFor(version) {
  if (RELEASE.test(version)) return 'latest';
  if (NEXT.test(version)) return 'next';
  throw new Error(`Unsupported version: ${version}`);
}

/**
 * @param {string} base
 * @param {number} n
 * @returns {string}
 */
export function prereleaseVersion(base, n) {
  if (!RELEASE.test(base)) throw new Error(`Prerelease base must be x.y.z: ${base}`);
  if (!Number.isInteger(n) || n < 0)
    throw new Error(`Prerelease number must be a whole number: ${n}`);
  return `${base}-next.${n}`;
}

function main(argv) {
  const [command, ...args] = argv;
  if (command === 'tag' && args.length === 1) return distTagFor(args[0]);
  if (command === 'prerelease' && args.length === 2) {
    const n = /^\d+$/.test(args[1]) ? Number(args[1]) : Number.NaN;
    return prereleaseVersion(args[0], n);
  }
  throw new Error('Usage: dist-tag.mjs tag <version> | prerelease <base> <n>');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(main(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
