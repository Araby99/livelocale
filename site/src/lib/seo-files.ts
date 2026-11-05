// The files the docs build writes beside the site for crawlers and AI assistants, once VitePress
// has built the docs (site/docs/.vitepress/config.ts, buildEnd; the landing page is already in
// site/dist by then): sitemap.xml and robots.txt under the site base, a Markdown copy of every docs
// page beside its HTML, llms.txt (llmstxt.org) and llms-full.txt. All of it is generated from the
// docs sources and SITE_URL on every build, so none of it can drift from the pages.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { SidebarGroup } from './docs-config';
import { docsMarkdown, type MarkdownContext } from './docs-markdown';
import { NAME, NPM_URL, REPO_URL, SUMMARY, robotsTxt, sitemapXml, type SitemapEntry } from './seo';

/** A docs page's absolute URL: `guides/studio.md` → `<site>docs/guides/studio.html`, an index → its folder. */
export function docsPageUrl(siteUrl: string, relativePath: string): string {
  return `${siteUrl}docs/${relativePath.replace(/\.md$/, '.html').replace(/(^|\/)index\.html$/, '$1')}`;
}

/** The absolute URL of a docs page's Markdown copy: `guides/studio.md` → `<site>docs/guides/studio.md`. */
export function docsMarkdownUrl(siteUrl: string, relativePath: string): string {
  return `${siteUrl}docs/${relativePath}`;
}

/** The source file of a sidebar link: `/` → `index.md`, `/reference/cli/` → `reference/cli/index.md`. */
export function sidebarFile(link: string): string {
  const path = link.replace(/^\//, '');
  return path === '' || path.endsWith('/') ? `${path}index.md` : `${path}.md`;
}

const lastModified = new Map<string, string>();

/**
 * When any of `files` last changed in git, as an ISO date-time; the build time when git has no
 * history for them (a shallow clone keeps the last commit, so CI still gets a real date).
 */
export function gitLastModified(files: string[], cwd: string): string {
  const key = files.join('\n');
  const known = lastModified.get(key);
  if (known) return known;
  let date = '';
  try {
    date = execFileSync('git', ['log', '-1', '--format=%cI', '--', ...files], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    // not a git checkout: fall back to the build time
  }
  const iso = date ? new Date(date).toISOString() : new Date().toISOString();
  lastModified.set(key, iso);
  return iso;
}

export interface DocsPage {
  /** Relative to the docs folder, with `/`: `start/nextjs.md`. */
  file: string;
  title: string;
  description: string;
  url: string;
  markdownUrl: string;
}

/** A page's frontmatter `title` and `description` (single-line values, as every page writes them). */
export function frontmatter(source: string): { title: string; description: string } {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source)?.[1] ?? '';
  const field = (name: string) => {
    const value = new RegExp(`^${name}:\\s*(.+)$`, 'm').exec(block)?.[1]?.trim() ?? '';
    return value.replace(/^(['"])(.*)\1$/, '$2');
  };
  return { title: field('title'), description: field('description') };
}

/** Pages in llms.txt's "Optional" section: useful, but skippable when context is short. */
export const OPTIONAL_PAGES = new Set(['reference/changelog.md', 'guides/migrate.md']);

/** llms.txt in the llmstxt.org format: H1, blockquote summary, notes, link sections, Optional. */
export function llmsTxt(opts: { siteUrl: string; sidebar: SidebarGroup[]; pages: DocsPage[] }) {
  const { siteUrl, sidebar, pages } = opts;
  const byFile = new Map(pages.map((p) => [p.file, p]));
  const entry = (p: DocsPage) => `- [${p.title}](${p.markdownUrl}): ${p.description}`;
  const sections = sidebar.map((group) => {
    const items = group.items
      .map((item) => byFile.get(sidebarFile(item.link)))
      .filter((p): p is DocsPage => Boolean(p) && !OPTIONAL_PAGES.has(p!.file));
    return `## ${group.text}\n\n${items.map(entry).join('\n')}`;
  });
  const optional = [
    ...pages.filter((p) => OPTIONAL_PAGES.has(p.file)).map(entry),
    `- [All docs in one file](${siteUrl}llms-full.txt): every docs page listed here, as one Markdown file.`,
    `- [Source code](${REPO_URL}): the livelocale repository on GitHub, MIT licence.`,
    `- [npm package](${NPM_URL}): the package page on npm.`,
  ];
  return `# ${NAME}

> ${SUMMARY}

- Install: \`npm install livelocale\` (Node.js 18 or later). One package, MIT licence, no runtime dependencies, no account, no server.
- Next.js: \`npx livelocale init\` writes the API route; the Studio runs beside \`next dev\`. Vite: add the \`liveLocaleVite\` plugin from \`livelocale/vite\`; the Studio runs beside \`vite\`.
- Share links: \`npx livelocale init --share\` ships the Studio inside a static build, so someone with no git account can fix text on the deployed site and send a change link; on GitHub a workflow turns it into a pull request, elsewhere \`npx livelocale apply "<link>" --pr\` does.
- CI: \`npx livelocale check\` fails the build on missing keys, broken ICU and placeholder drift; \`--hardcoded\` also fails it on text that never went through translation.
- Keep next-intl or react-i18next: translations stay as JSON locale files in your repository. The Studio edits every locale, and right-to-left sites such as Arabic flip right to left under it.
- Every page below is Markdown; the same page as HTML ends in \`.html\` (the front door is \`${siteUrl}docs/\`). The landing page is ${siteUrl}.

${sections.join('\n\n')}

## Optional

${optional.join('\n')}
`;
}

/** llms-full.txt: every docs page's Markdown, in sidebar order, each under its source URL. */
export function llmsFullTxt(opts: { pages: (DocsPage & { markdown: string })[] }): string {
  const head = `# ${NAME} documentation\n\n> ${SUMMARY}\n`;
  const pages = opts.pages.map((p) => `Source: ${p.url}\n\n${p.markdown.trim()}\n`);
  return [head, ...pages].join('\n---\n\n');
}

/** The built URL of a docs media file, found by its name in `<docs out>/assets/`. */
function builtMedia(outDir: string, docsBaseUrl: string) {
  const assets = existsSync(join(outDir, 'assets')) ? readdirSync(join(outDir, 'assets')) : [];
  return (file: string) => {
    const dot = file.lastIndexOf('.');
    const stem = file.slice(0, dot).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const ext = file.slice(dot + 1);
    const pattern = new RegExp(`^${stem}\\.[\\w-]+\\.${ext}$`);
    const found = assets.find((name) => pattern.test(name));
    return found ? `${docsBaseUrl}assets/${found}` : undefined;
  };
}

export interface SeoBuild {
  siteUrl: string;
  /** site/dist: the landing page is there; the docs are in its docs/ folder. */
  distDir: string;
  /** site/docs. */
  docsDir: string;
  /** The repository root, where git runs and CHANGELOG.md lives. */
  repoDir: string;
  /** site/.cache/docs-cli: the recorded `cli` runs. */
  cliDir: string;
  /** site/media/docs/manifest.json. */
  mediaManifest: string;
  sidebar: SidebarGroup[];
  changelog(): string;
}

/** Every docs page in sidebar order, with its title, description and URLs. */
export function docsPages(build: Pick<SeoBuild, 'siteUrl' | 'docsDir' | 'sidebar'>): DocsPage[] {
  return build.sidebar
    .flatMap((group) => group.items.map((item) => sidebarFile(item.link)))
    .map((file) => {
      const { title, description } = frontmatter(readFileSync(join(build.docsDir, file), 'utf8'));
      if (!title || !description) throw new Error(`docs/${file} needs a title and a description`);
      return {
        file,
        title,
        description,
        url: docsPageUrl(build.siteUrl, file),
        markdownUrl: docsMarkdownUrl(build.siteUrl, file),
      };
    });
}

/** The source files a docs page's last change is read from (the changelog page is CHANGELOG.md too). */
export function docsSources(file: string): string[] {
  return file === 'reference/changelog.md'
    ? [`site/docs/${file}`, 'CHANGELOG.md']
    : [`site/docs/${file}`];
}

/** Writes the Markdown copies, llms.txt, llms-full.txt, sitemap.xml and robots.txt into distDir. */
export function writeSeoFiles(build: SeoBuild): void {
  const { siteUrl, distDir, docsDir, repoDir } = build;
  const docsOut = join(distDir, 'docs');
  const docsUrl = `${siteUrl}docs/`;
  const media = JSON.parse(readFileSync(build.mediaManifest, 'utf8')) as {
    shots: Record<string, { file: string }>;
    clips: Record<string, { mp4: string }>;
  };
  const mediaFile = builtMedia(docsOut, docsUrl);
  const pages = docsPages(build).map((page) => {
    const ctx: MarkdownContext = {
      pageUrl: page.url,
      docsUrl,
      cliRun: (name) => JSON.parse(readFileSync(join(build.cliDir, `${name}.json`), 'utf8')),
      mediaUrl: (kind, name) => {
        const file = kind === 'shot' ? media.shots[name]?.file : media.clips[name]?.mp4;
        return file ? mediaFile(file) : undefined;
      },
      changelog: build.changelog,
    };
    const markdown = docsMarkdown(readFileSync(join(docsDir, page.file), 'utf8'), ctx);
    const target = join(docsOut, page.file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, markdown);
    return { ...page, markdown };
  });

  writeFileSync(join(distDir, 'llms.txt'), llmsTxt({ siteUrl, sidebar: build.sidebar, pages }));
  writeFileSync(join(distDir, 'llms-full.txt'), llmsFullTxt({ pages }));

  const entries: SitemapEntry[] = [
    { url: siteUrl, lastmod: gitLastModified(['site/index.html'], repoDir) },
    ...pages.map((p) => ({ url: p.url, lastmod: gitLastModified(docsSources(p.file), repoDir) })),
  ];
  writeFileSync(join(distDir, 'sitemap.xml'), sitemapXml(entries));
  writeFileSync(join(distDir, 'robots.txt'), robotsTxt(siteUrl));
}
