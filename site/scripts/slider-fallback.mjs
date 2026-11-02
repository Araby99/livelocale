// Writes the slider's no-JavaScript fallback from the same check --hardcoded report the island
// reads (site/src/slider/hardcoded.json), so the static page and the island cannot drift (§3.3).
// The edits are string and regex work on the known static markup in site/index.html.
import { summaryLine } from '../src/slider/report.ts';

const MARKER = '<!-- slider:check-output -->';
const CLASS_NAME = 'is-untranslated';

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const decodeHtml = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

const normalise = (s) => s.replace(/\s+/g, ' ').trim();

/** The [start, end) range of the slider's Arabic half, matched by counting its tag's nesting. */
function arabicRange(html) {
  const island = html.indexOf('data-island="slider"');
  if (island === -1) return null;
  const open = /<([a-z][\w-]*)\b[^>]*\bdata-lang="ar"[^>]*>/g;
  open.lastIndex = island;
  const first = open.exec(html);
  if (!first) return null;
  const tag = first[1];
  const tags = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g');
  tags.lastIndex = first.index + first[0].length;
  let depth = 1;
  for (let m = tags.exec(html); m; m = tags.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return [first.index, m.index + m[0].length];
  }
  return null;
}

/** Adds the class to an opening tag, appending to its class attribute when it has one. */
function addClass(openTag) {
  if (/\sclass="/.test(openTag))
    return openTag.replace(/\sclass="([^"]*)"/, ` class="$1 ${CLASS_NAME}"`);
  return openTag.replace(/\s*(\/?)>$/, ` class="${CLASS_NAME}"$1>`);
}

/**
 * Outlines each element of the Arabic half whose data-key is an untranslated key or whose own
 * text (the text right after its opening tag) is hardcoded, then writes the summary line and the
 * escaped check output in place of the marker. Throws when the marker is missing.
 */
export function injectSliderFallback(html, { findings, output }) {
  if (!html.includes(MARKER)) throw new Error('slider fallback marker missing');
  const keys = new Set(findings.keys);
  const texts = new Set(findings.texts.map(normalise));

  let result = html;
  const range = arabicRange(html);
  if (range) {
    const [start, end] = range;
    const half = html
      .slice(start, end)
      .replace(/<([a-z][\w-]*)\b([^>]*)>([^<]*)/g, (match, _tag, attrs, text) => {
        const key = /\sdata-key="([^"]*)"/.exec(attrs)?.[1];
        const own = normalise(decodeHtml(text));
        if (!(key && keys.has(key)) && !(own && texts.has(own))) return match;
        const openTag = match.slice(0, match.length - text.length);
        return addClass(openTag) + text;
      });
    result = html.slice(0, start) + half + html.slice(end);
  }

  // The HTML parser drops one newline right after <pre>, so a leading one is doubled to survive.
  const pre = (output.startsWith('\n') ? '\n' : '') + escapeHtml(output);
  return result.replace(MARKER, `<p>${escapeHtml(summaryLine(findings))}</p><pre>${pre}</pre>`);
}
