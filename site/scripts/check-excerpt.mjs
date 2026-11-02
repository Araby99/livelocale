// Sets the CI sample's real `check --hardcoded` output (site/src/ci/check-output.json) as HTML for
// the developer story. Lines keep the CLI's own words, glyphs and indentation; only the run header
// (the folder and locale banner) and the divider rules are left out of the excerpt. Each part gets
// its one-job colour: failures in Exit 1, warnings with their glyph on an amber fill, locales, files and
// keys in Hunk, the hardcoded string inside a dashed Exit 1 outline, the rest in Comment.

export const MARKER = '<!-- ci:check-output -->';

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const span = (cls, text) => `<span class="${cls}">${text}</span>`;

/** True for the lines the excerpt leaves out: the run header and the dashed rules. */
const isChrome = (line) => /^\s*$/.test(line) || /^-{8,}$/.test(line) || /^(🔎|🌐)/u.test(line);

/** One output line as HTML. Lines it does not recognise are kept, escaped, in Comment. */
export function renderLine(line) {
  const indent = /^\s*/.exec(line)[0];
  const body = line.slice(indent.length);
  let m;
  if ((m = /^(✖)\s(.*)$/u.exec(body)))
    return indent + span('c-fail', `${escapeHtml(m[1])} ${escapeHtml(m[2])}`);
  if ((m = /^(❌)\s(.*)$/u.exec(body)))
    return indent + span('c-fail', `${escapeHtml(m[1])} ${escapeHtml(m[2])}`);
  if ((m = /^(⚠)\s(.*)$/u.exec(body)))
    return indent + span('c-warn-glyph', m[1]) + ' ' + span('c-warn', escapeHtml(m[2]));
  if ((m = /^(\d+:\d+)(\s+)(".*")$/.exec(body)))
    return indent + span('c-loc', m[1]) + m[2] + span('c-hardcoded', escapeHtml(m[3]));
  if ((m = /^\[([a-z-]+)\]\s(\S+)(\s.*)$/i.exec(body)))
    return (
      indent +
      span('c-locale', `[${escapeHtml(m[1])}]`) +
      ' ' +
      span('c-key', escapeHtml(m[2])) +
      span('c-comment', escapeHtml(m[3]))
    );
  if (/^[\w./-]+\.(tsx?|jsx?|json)$/.test(body)) return indent + span('c-file', escapeHtml(body));
  return indent + span('c-comment', escapeHtml(body));
}

/**
 * The excerpt's HTML for a <pre>: the command, the CLI's lines, then its exit code. Throws when
 * nothing is left after the header is removed, so a broken run cannot ship an empty block.
 */
export function renderCheckExcerpt({ output, status }) {
  const lines = output.split(/\r?\n/).filter((l) => !isChrome(l));
  if (lines.length === 0) throw new Error('check --hardcoded printed nothing to excerpt');
  const prompt = `${span('c-prompt', '$')} npx livelocale check --hardcoded`;
  const exit = `${span('c-comment', '# exit')} ${span(status === 0 ? 'c-pass' : 'c-fail', String(status))}`;
  return [prompt, ...lines.map(renderLine), exit].join('\n');
}

/** Writes the excerpt into html in place of MARKER. Throws when the marker is missing. */
export function injectCheckExcerpt(html, data) {
  if (!html.includes(MARKER)) throw new Error('check excerpt marker missing from index.html');
  return html.replace(MARKER, () => renderCheckExcerpt(data));
}
