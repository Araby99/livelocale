// The link guard's parts: reads links and ids out of built HTML and sorts each link into a file in
// the built site, an external URL, or one to skip. tests/site/links.spec.ts walks the built site
// with them, so a broken link, a missing anchor or a link off the allowed hosts fails the suite.
import { posix } from 'node:path';

/** Escapes a literal string for use inside a RegExp. */
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** A prefix and everything under it, never a longer name that starts the same way. */
const under = (prefix) => new RegExp(`^${escape(prefix)}(?:$|[/#?])`);

/** The only places the docs and the landing page may link to outside the site (spec §3.4). */
export const ALLOWED_EXTERNAL = [
  under('https://github.com/Araby99/livelocale'),
  under('https://www.npmjs.com/package/livelocale'),
  under('https://github.com/Araby99/tidewell'),
  under('https://js.org'),
  under('https://livelocale.js.org'),
];

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Decodes the HTML character references an attribute value can carry. */
function decodeEntities(value) {
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, ref) => {
    if (ref[0] !== '#') return NAMED[ref.toLowerCase()] ?? whole;
    const hex = ref[1] === 'x' || ref[1] === 'X';
    return String.fromCodePoint(hex ? parseInt(ref.slice(2), 16) : Number(ref.slice(1)));
  });
}

/** Every value of one attribute in `html`, decoded, on `tag` elements or on any element. */
function attributeValues(html, attribute, tag = '[a-z][a-z0-9-]*') {
  const value = String.raw`\s${attribute}\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))`;
  const pattern = new RegExp(String.raw`<${tag}\b[^>]*?${value}`, 'gi');
  return [...html.matchAll(pattern)].map((m) => decodeEntities(m[1] ?? m[2] ?? m[3]));
}

/**
 * Every `<a href>` value in a page, entities decoded.
 * @param {string} html
 * @returns {string[]}
 */
export function extractLinks(html) {
  return attributeValues(html, 'href', 'a');
}

/**
 * Every `id` value in a page: the targets a `#hash` link can land on.
 * @param {string} html
 * @returns {Set<string>}
 */
export function extractIds(html) {
  return new Set(attributeValues(html, 'id'));
}

/**
 * Sorts a link found on a built page.
 * @param {string} href the attribute value, decoded
 * @param {string} pageUrl the URL the page is served at
 * @param {string} base the site base, such as `/livelocale/`
 * @param {string} distDir the built site's folder, which `base` serves
 * @returns {import('./links.d.mts').LinkKind}
 */
export function classifyLink(href, pageUrl, base, distDir) {
  if (/^\s*(?:mailto|javascript):/i.test(href)) return { kind: 'skip' };
  const url = new URL(href, pageUrl);
  if (url.origin !== new URL(pageUrl).origin || !url.pathname.startsWith(base)) {
    return { kind: 'external', url: url.href };
  }
  let path = decodeURIComponent(url.pathname.slice(base.length));
  if (path === '' || path.endsWith('/')) path += 'index.html';
  return {
    kind: 'internal',
    file: posix.join(distDir, path),
    hash: decodeURIComponent(url.hash.slice(1)),
  };
}
