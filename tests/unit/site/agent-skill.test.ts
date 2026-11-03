// @vitest-environment node
// The Agent Skill in skills/livelocale/ and the Claude Code marketplace that installs it: the skill
// must name only commands, flags, exports and docs pages that exist, so an agent that follows it
// runs real commands.
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { parseHelp } from '../../../site/scripts/docs/cli-help.mjs';

const SKILL_DIR = 'skills/livelocale';
const DOCS = 'site/docs';
const DOCS_URL = 'https://livelocale.js.org/docs/';

const cli = parseHelp(
  spawnSync(process.execPath, ['dist/codemod/index.js', '--help'], { encoding: 'utf8' }).stdout
);

/** SKILL.md and every Markdown file under references/, as [path, text]. */
function skillFiles(): [string, string][] {
  const refs = join(SKILL_DIR, 'references');
  const files = [join(SKILL_DIR, 'SKILL.md')];
  if (fs.existsSync(refs))
    for (const f of fs.readdirSync(refs)) if (f.endsWith('.md')) files.push(join(refs, f));
  return files.map((f) => [f, fs.readFileSync(f, 'utf8')]);
}

/** The flat `key: value` frontmatter of a Markdown file. */
function frontmatter(text: string): Record<string, string> {
  const block = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text)?.[1] ?? '';
  const data: Record<string, string> = {};
  for (const line of block.split(/\r?\n/)) {
    const pair = /^([\w-]+):\s*(.*)$/.exec(line);
    if (pair) data[pair[1]!] = pair[2]!.trim();
  }
  return data;
}

/** The code in a Markdown text: each fenced block's lines and each inline code span. */
function codeSnippets(md: string): string[] {
  const snippets: string[] = [];
  const prose = md.replace(/^\s*```[^\n]*\n([\s\S]*?)^\s*```/gm, (_, body: string) => {
    snippets.push(...body.split('\n'));
    return '';
  });
  for (const [, code] of prose.matchAll(/`([^`\n]+)`/g)) snippets.push(code!);
  return snippets;
}

/** VitePress's heading anchor: lowercase, punctuation dropped, spaces to hyphens. */
function slug(heading: string): string {
  return heading
    .replace(/`/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

it('has Agent Skills frontmatter with a name that matches its folder and a description', () => {
  const data = frontmatter(fs.readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8'));
  expect(data.name).toBe('livelocale');
  expect(data.name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  expect(data.description!.length).toBeGreaterThan(100);
  expect(data.description!.length).toBeLessThanOrEqual(1024);
  for (const trigger of ['Next.js', 'Vite', 'static-host', 'share links', '--hardcoded', 'CI'])
    expect(data.description).toContain(trigger);
});

it('keeps SKILL.md short enough to load whole', () => {
  const lines = fs.readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8').split('\n').length;
  expect(lines).toBeLessThanOrEqual(250);
});

it('names only commands and flags the CLI prints in its help', () => {
  const wrong: string[] = [];
  let seen = 0;
  for (const [file, md] of skillFiles()) {
    for (const code of codeSnippets(md)) {
      for (const [, command, rest] of code.matchAll(/\blivelocale ([a-z][\w-]*|--help)([^;|]*)/g)) {
        seen++;
        if (command === '--help') continue;
        const flags = cli[command!];
        if (!flags) {
          wrong.push(`${file}: livelocale ${command}`);
          continue;
        }
        // flags end at ` -- `, where the wrapped build command starts
        const own = rest!.split(/\s--\s/)[0]!;
        for (const [flag] of own.matchAll(/--[a-z][\w-]*/g))
          if (!flags.includes(flag)) wrong.push(`${file}: livelocale ${command} ${flag}`);
      }
    }
  }
  expect(seen).toBeGreaterThan(10);
  expect(wrong).toEqual([]);
});

it('imports only what each livelocale entry point exports', () => {
  const entry: Record<string, string> = {
    client: 'src/client/index.ts',
    server: 'src/server/index.ts',
    react: 'src/react/index.tsx',
    vite: 'src/server/vite-plugin.ts',
  };
  const exported = (sub: string, name: string) => {
    const source = fs.readFileSync(entry[sub]!, 'utf8');
    return (
      new RegExp(`export\\s+(?:async\\s+)?(?:function|const|class)\\s+${name}\\b`).test(source) ||
      new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`).test(source)
    );
  };
  const wrong: string[] = [];
  let seen = 0;
  for (const [file, md] of skillFiles()) {
    const uses = [
      ...[...md.matchAll(/import \{([^}]+)\} from 'livelocale\/(\w+)'/g)].flatMap(
        ([, names, sub]) => names!.split(',').map((n) => [n.trim(), sub!])
      ),
      ...[...md.matchAll(/`(\w+)(?:\([^`]*\))?` from `livelocale\/(\w+)`/g)].map(([, n, sub]) => [
        n!,
        sub!,
      ]),
    ];
    for (const [name, sub] of uses) {
      seen++;
      if (!entry[sub!] || !exported(sub!, name!)) wrong.push(`${file}: ${name} from ${sub}`);
    }
  }
  expect(seen).toBeGreaterThanOrEqual(5);
  expect(wrong).toEqual([]);
});

it('links only to docs pages and headings that exist', () => {
  const wrong: string[] = [];
  let seen = 0;
  for (const [file, md] of skillFiles()) {
    for (const [url] of md.matchAll(/https:\/\/livelocale\.js\.org\/[^\s),`]*/g)) {
      seen++;
      const clean = url.replace(/[.,;:]+$/, '');
      if (/^https:\/\/livelocale\.js\.org\/llms(-full)?\.txt$/.test(clean)) continue;
      if (!clean.startsWith(DOCS_URL)) {
        wrong.push(`${file}: ${clean}`);
        continue;
      }
      const [path, hash] = clean.slice(DOCS_URL.length).split('#');
      const page = path === '' || path!.endsWith('/') ? `${path}index.md` : path!;
      if (!page.endsWith('.html') && !page.endsWith('index.md')) {
        wrong.push(`${file}: ${clean} (not a canonical .html URL)`);
        continue;
      }
      const source = join(DOCS, page.replace(/\.html$/, '.md'));
      if (!fs.existsSync(source)) {
        wrong.push(`${file}: ${clean} (no ${source})`);
        continue;
      }
      if (hash) {
        const ids = [...fs.readFileSync(source, 'utf8').matchAll(/^#{2,4} (.+)$/gm)].map((m) =>
          slug(m[1]!)
        );
        if (!ids.includes(hash)) wrong.push(`${file}: ${clean} (no #${hash})`);
      }
    }
  }
  expect(seen).toBeGreaterThan(5);
  expect(wrong).toEqual([]);
});

it('is installable from the Claude Code marketplace in this repository', () => {
  const market = JSON.parse(fs.readFileSync('.claude-plugin/marketplace.json', 'utf8')) as {
    name: string;
    owner: { name: string };
    plugins: { name: string; source: string; description: string }[];
  };
  expect(market.name).toBe('livelocale');
  expect(market.owner.name).toBeTruthy();
  expect(market.plugins).toHaveLength(1);
  const [entry] = market.plugins;
  expect(entry!.source).toMatch(/^\.\//);
  expect(entry!.source).not.toContain('..');
  const root = entry!.source;
  const manifest = JSON.parse(
    fs.readFileSync(join(root, '.claude-plugin/plugin.json'), 'utf8')
  ) as {
    name: string;
  };
  expect(manifest.name).toBe(entry!.name);
  expect(fs.existsSync(join(root, 'skills', 'livelocale', 'SKILL.md'))).toBe(true);

  const guide = fs.readFileSync(join(DOCS, 'guides/ai-agents.md'), 'utf8');
  expect(guide).toContain('/plugin marketplace add Araby99/livelocale');
  expect(guide).toContain(`/plugin install ${entry!.name}@${market.name}`);
});
