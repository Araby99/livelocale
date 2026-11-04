// @vitest-environment node
// The Agent Skill in plugins/livelocale/skills/livelocale/ and the Claude Code marketplace that
// installs it: the skill must name only commands, flags, exports and docs pages that exist, so an
// agent that follows it runs real commands. The marketplace waits in site/launch/ until go-live
// (site/LAUNCH.md step 8), because the skill links to https://livelocale.js.org/.
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { parseHelp } from '../../../site/scripts/docs/cli-help.mjs';

const PLUGIN_DIR = 'plugins/livelocale';
const SKILL_DIR = `${PLUGIN_DIR}/skills/livelocale`;
const MARKETPLACE = 'site/launch/marketplace.json';
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
        // `build [--preview] [--out <dir>] [pack options]`: build also takes every pack flag
        const flags =
          command === 'build' && cli.build ? [...cli.build, ...(cli.pack ?? [])] : cli[command!];
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

it('is installable from the Claude Code marketplace once it is copied to the repository root', () => {
  const market = JSON.parse(fs.readFileSync(MARKETPLACE, 'utf8')) as {
    name: string;
    owner: { name: string };
    plugins: { name: string; source: string; description: string }[];
  };
  expect(market.name).toBe('livelocale');
  expect(market.owner.name).toBeTruthy();
  expect(market.plugins).toHaveLength(1);
  const [entry] = market.plugins;
  // a plugin folder of its own, so installing copies the skill, not the whole repository
  expect(entry!.source).toBe(`./${PLUGIN_DIR}`);
  const manifest = JSON.parse(
    fs.readFileSync(join(PLUGIN_DIR, '.claude-plugin/plugin.json'), 'utf8')
  ) as { name: string; version: string };
  expect(manifest.name).toBe(entry!.name);
  expect(fs.existsSync(join(PLUGIN_DIR, 'skills', 'livelocale', 'SKILL.md'))).toBe(true);
  expect(fs.readdirSync(PLUGIN_DIR).sort()).toEqual(['.claude-plugin', 'skills']);

  const guide = fs.readFileSync(join(DOCS, 'guides/ai-agents.md'), 'utf8');
  expect(guide).toContain('/plugin marketplace add Araby99/livelocale');
  expect(guide).toContain(`/plugin install ${entry!.name}@${market.name}`);
  expect(guide).toContain(`tree/main/${SKILL_DIR}`);
  // the llms files follow the site base, so the preview build links to its own copies
  expect(guide).toContain('](../../llms.txt)');
  expect(guide).toContain('](../../llms-full.txt)');
  expect(guide).not.toContain('https://livelocale.js.org/llms');
});

// Without a version, Claude Code versions the plugin by commit, so every push to main would update
// the skill ahead of the npm release it describes.
it('versions the plugin with the npm package', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as { version: string };
  const manifest = JSON.parse(
    fs.readFileSync(join(PLUGIN_DIR, '.claude-plugin/plugin.json'), 'utf8')
  ) as { version: string };
  expect(manifest.version).toBe(pkg.version);
  expect(fs.readFileSync('CONTRIBUTING.md', 'utf8')).toContain(
    'plugins/livelocale/.claude-plugin/plugin.json'
  );
});

// Every docs link in the skill is on https://livelocale.js.org/, so the marketplace that installs
// it went live with the domain, in the go-live commit, as the launch copy.
it('publishes the marketplace in the go-live commit, after the domain switch', () => {
  expect(fs.readFileSync('.claude-plugin/marketplace.json', 'utf8')).toBe(
    fs.readFileSync('site/launch/marketplace.json', 'utf8')
  );
  const launch = fs.readFileSync('site/LAUNCH.md', 'utf8');
  const step8 = /^- \[ \] 8\. [\s\S]*?(?=^- \[ \] 9\. )/m.exec(launch)![0];
  expect(step8).toContain(
    'copy `site/launch/marketplace.json` to `.claude-plugin/marketplace.json`'
  );
  expect(launch.indexOf('`SITE_URL` = `https://livelocale.js.org/`')).toBeLessThan(
    launch.indexOf('site/launch/marketplace.json')
  );
});

// Findings an agent would act on wrongly: each pins a fact of src/ the skill must keep.
describe('the advice an agent acts on', () => {
  const skill = () => fs.readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');

  it('keeps the Next.js share build off production', () => {
    expect(skill()).toContain(
      'Use `npm run build:preview` only as the build command of a staging or preview deployment, never production'
    );
  });

  // src/codemod/init-share.ts: on output: 'export' it says to delete the route, and build stops
  it('says what a Next.js static export does to the route init wrote', () => {
    expect(skill()).toMatch(/`output: 'export'`[^\n]*delete `app\/api\/livelocale\/route\.ts`/);
  });

  // src/codemod/doctor.ts treats any X-Frame-Options as a blocker; SAMEORIGIN blocks port 3010
  it('never suggests allowing the Studio through X-Frame-Options', () => {
    const pages = [
      ...skillFiles().map(([, text]) => text),
      fs.readFileSync(join(DOCS, 'guides/teams.md'), 'utf8'),
    ];
    for (const text of pages) {
      expect(text).not.toMatch(
        /`X-Frame-Options`, only while|in `frame-ancestors` \/ `X-Frame-Options`/
      );
      expect(text).toContain("frame-ancestors 'self' http://localhost:3010");
    }
    expect(skill()).toMatch(/send no `X-Frame-Options`/);
  });

  it('shows the provider inside a whole root layout, with no stray semicolon', () => {
    expect(skill()).not.toMatch(/<LiveLocaleProvider \/>;/);
    expect(skill()).toContain('export default function RootLayout({ children })');
  });

  it('routes CRA, webpack and Rsbuild projects and next-i18n-lens upgrades', () => {
    expect(skill()).toMatch(/`react-scripts`, `webpack` or `@rsbuild\/core`/);
    expect(frontmatter(skill()).description).toContain('migrating from next-i18n-lens');
    expect(skill()).toContain('https://livelocale.js.org/docs/guides/migrate.html');
  });
});
