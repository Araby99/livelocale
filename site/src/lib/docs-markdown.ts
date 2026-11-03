// A docs page as clean Markdown, for readers that are not browsers (AI assistants, llms-full.txt,
// the `.md` copy served beside every page). The page's own Markdown, with each piece that only the
// docs theme can render turned into plain Markdown: the front door's StackPicker becomes a list,
// DocShot an image, DocClip a link to the video, a `cli` fence the real run it shows, a details
// box a bold label, the changelog marker the changelog. Every link becomes absolute, so the text
// reads the same wherever it is copied to.

export interface MarkdownContext {
  /** The page's absolute HTML URL; relative links resolve against it. */
  pageUrl: string;
  /** The docs' absolute URL (`<site>docs/`); `/x` links resolve against it, as VitePress does. */
  docsUrl: string;
  /** The recorded run behind a `cli <name>` fence. */
  cliRun(name: string): { command: string; output: string; status: number };
  /** The built URL of a DocShot by name (the webp) or of a DocClip (the mp4); undefined when unbuilt. */
  mediaUrl(kind: 'shot' | 'clip', name: string): string | undefined;
  /** The changelog's body, for the page that holds the marker. */
  changelog(): string;
}

const CHANGELOG_MARKER = '<!-- @changelog -->';

/** Attributes of one component tag: `name="value"` pairs and bare flags. */
function attributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of tag.matchAll(/([:\w-]+)(?:="([^"]*)")?/g)) {
    if (m[1] && !/^[A-Z]/.test(m[1])) attrs[m[1]] = m[2] ?? '';
  }
  return attrs;
}

/** Resolves a link target against the page, leaving absolute URLs and mail links alone. */
export function absoluteHref(href: string, ctx: Pick<MarkdownContext, 'pageUrl' | 'docsUrl'>) {
  if (/^[a-z][a-z\d+.-]*:/i.test(href)) return href;
  if (href.startsWith('/')) return new URL(href.slice(1), ctx.docsUrl).href;
  return new URL(href, ctx.pageUrl).href;
}

/** Rewrites every Markdown link and image target outside inline code to an absolute URL. */
function absoluteLinks(line: string, ctx: MarkdownContext): string {
  // Code spans (opening and closing on backtick runs of one length, as in ``a `b` c``) are set
  // aside first, so a link inside one stays as written while a link whose label holds one is
  // still rewritten.
  const spans: string[] = [];
  const held = line.replace(/(`+)(?:.*?[^`])?\1(?!`)/g, (span) => `\0${spans.push(span) - 1}\0`);
  return held
    .replace(
      /(!?\[[^\]]*\])\(([^)\s]+)((?:\s+"[^"]*")?)\)/g,
      (_m, label: string, href: string, title: string) =>
        `${label}(${absoluteHref(href, ctx)}${title})`
    )
    .replace(/\0(\d+)\0/g, (_m, i: string) => spans[Number(i)]!);
}

/** The front door's stacks, read from its `<script setup>` array. */
function stacksList(script: string, ctx: MarkdownContext): string[] {
  const items = [
    ...script.matchAll(/title:\s*'([^']*)',\s*text:\s*'([^']*)',\s*href:\s*'([^']*)'/g),
  ];
  if (items.length === 0) throw new Error('StackPicker: no stacks found in <script setup>');
  return items.map((m) => `- [${m[1]}](${absoluteHref(m[3]!, ctx)}): ${m[2]}`);
}

/** The page's Markdown, cleaned for reading outside the docs theme. */
export function docsMarkdown(source: string, ctx: MarkdownContext): string {
  const body = source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').replace(/\r\n/g, '\n');
  const out: string[] = [];
  let script = '';
  let fence: { marker: string; cli: boolean } | null = null;
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (fence) {
      if (line.trim() === fence.marker) {
        if (!fence.cli) out.push(line);
        fence = null;
      } else if (!fence.cli) out.push(line);
      continue;
    }
    const open = /^(`{3,}|~{3,})(.*)$/.exec(line.trim());
    if (open) {
      const cli = /^cli\s+(\S+)$/.exec(open[2]!.trim());
      fence = { marker: open[1]!, cli: Boolean(cli) };
      if (cli) {
        const run = ctx.cliRun(cli[1]!);
        out.push('```text', `$ ${run.command}`);
        if (run.output !== '') out.push(...run.output.split('\n'));
        out.push(`# exit ${run.status}`, '```');
      } else out.push(line);
      continue;
    }
    if (line.startsWith('<script setup')) {
      const end = lines.indexOf('</script>', i);
      if (end === -1) throw new Error('<script setup> is not closed');
      script = lines.slice(i + 1, end).join('\n');
      i = end;
      // Drop the blank line the block leaves behind.
      if (lines[i + 1] === '') i++;
      continue;
    }
    if (/^<StackPicker\b/.test(line)) {
      out.push(...stacksList(script, ctx));
      continue;
    }
    const shot = /^<DocShot\b(.*?)\/>$/.exec(line);
    if (shot) {
      const a = attributes(shot[1]!);
      const url = ctx.mediaUrl('shot', a.name!);
      out.push(url ? `![${a.alt}](${url})` : `Screenshot: ${a.alt}`);
      if (a.caption) out.push('', `*${a.caption}*`);
      continue;
    }
    const clip = /^<DocClip\b(.*?)\/>$/.exec(line);
    if (clip) {
      const a = attributes(clip[1]!);
      const url = ctx.mediaUrl('clip', a.name!);
      out.push(url ? `[Video: ${a.label}](${url})` : `Video: ${a.label}`);
      if (a.caption) out.push('', `*${a.caption}*`);
      continue;
    }
    const details = /^:::\s*details\s+(.+)$/.exec(line);
    if (details) {
      out.push(`**${details[1]!.trim()}**`);
      continue;
    }
    if (line.trim() === ':::') continue;
    if (line.trim() === CHANGELOG_MARKER) {
      out.push(...ctx.changelog().replace(/\r\n/g, '\n').trimEnd().split('\n'));
      continue;
    }
    out.push(absoluteLinks(line, ctx));
  }
  if (fence) throw new Error('a code fence is not closed');
  return `${out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()}\n`;
}
