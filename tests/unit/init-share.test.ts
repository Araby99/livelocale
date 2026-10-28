// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  CHECKOUT_ACTION,
  detectShareStack,
  planInitShare,
  renderWorkflow,
  validateShareArgs,
  writePlannedFiles,
  type PlannedFile,
} from '../../src/codemod/init-share.js';
import { readOwnVersion } from '../../src/server/module-dir.js';
import { fakeGit } from './helpers/fake-git.js';

const created: string[] = [];

/** A temp project with `src/locales/en.json` and `src/locales/ar.json`, plus `files`. */
function project(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-init-share-'));
  created.push(dir);
  const all: Record<string, string> = {
    'src/locales/en.json': '{"hello":"Hi"}',
    'src/locales/ar.json': '{"hello":"أهلا"}',
    ...files,
  };
  for (const [rel, content] of Object.entries(all)) {
    const file = path.join(dir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, 'utf-8');
  }
  return dir;
}

const pkg = (body: object) =>
  `${JSON.stringify({ name: 'app', private: true, ...body }, null, 2)}\n`;

const viteFiles = {
  'package.json': pkg({ devDependencies: { vite: '^5.0.0' } }),
  'vite.config.ts':
    "export default defineConfig({\n  plugins: [react(), liveLocaleVite({ localesPath: './src/locales' })],\n});\n",
};
const nextConfig = (body: string) => ({
  'package.json': pkg({ dependencies: { next: '^14.0.0' }, scripts: { build: 'next build' } }),
  'next.config.mjs': `export default { ${body} };\n`,
});

function gitWithOrigin(origin: string) {
  return fakeGit({
    'remote get-url origin': origin,
    'symbolic-ref --short refs/remotes/origin/HEAD': 'origin/main',
  });
}
const git = gitWithOrigin('https://github.com/acme/site.git');

function fileOf(plan: { files: PlannedFile[] }, rel: string): PlannedFile {
  const file = plan.files.find((f) => f.path === rel);
  if (!file) throw new Error(`no planned file ${rel}: ${plan.files.map((f) => f.path).join()}`);
  return file;
}

afterEach(() => {
  for (const dir of created.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('init --share', () => {
  it('detects the stack, plans the build change and the workflow', async () => {
    const viteProject = project(viteFiles);
    const craProject = project({
      'package.json': pkg({
        dependencies: { 'react-scripts': '5.0.1' },
        scripts: { build: 'react-scripts build' },
      }),
    });
    const webpackProject = project({
      'package.json': pkg({
        devDependencies: { webpack: '^5.0.0' },
        scripts: { build: 'webpack --mode production' },
      }),
    });
    const nextProject = project(nextConfig('reactStrictMode: true'));
    const nextExportProject = project(nextConfig("output: 'export'"));
    const nextExportWithPostRoute = project({
      ...nextConfig("output: 'export'"),
      'app/api/livelocale/route.ts': 'export async function POST() {}\n',
    });

    expect(detectShareStack(viteProject).stack).toBe('vite');
    expect(detectShareStack(nextExportProject).stack).toBe('next-export');
    expect(detectShareStack(nextProject).stack).toBe('next-server');
    expect(detectShareStack(craProject).stack).toBe('cra');
    expect(detectShareStack(webpackProject).stack).toBe('webpack');
    const vite = await planInitShare({ projectDir: viteProject, version: '0.10.0', git });
    expect(fileOf(vite, 'vite.config.ts').content).toContain(
      "liveLocaleVite({ share: true, localesPath: './src/locales' })"
    );
    expect(
      fileOf(
        await planInitShare({
          projectDir: viteProject,
          sourceLocale: 'ar',
          version: '0.10.0',
          git,
        }),
        'vite.config.ts'
      ).content
    ).toContain("share: true, sourceLocale: 'ar', ");
    expect(
      fileOf(
        await planInitShare({ projectDir: craProject, version: '0.10.0', git }),
        'package.json'
      ).content
    ).toContain(
      '"build": "react-scripts build && livelocale pack build --locales src/locales --source en"'
    );
    expect(
      fileOf(
        await planInitShare({ projectDir: webpackProject, version: '0.10.0', git }),
        'package.json'
      ).content
    ).toContain(
      '"build": "webpack --mode production && livelocale pack dist --locales src/locales --source en"'
    );
    expect(
      (
        await planInitShare({ projectDir: nextExportWithPostRoute, version: '0.10.0', git })
      ).notes.join('\n')
    ).toMatch(/static export rejects POST routes/);
    expect(
      fileOf(await planInitShare({ projectDir: nextProject, version: '0.10.0', git }), '.gitignore')
        .content
    ).toContain('public/livelocale/');
    expect(
      fileOf(
        await planInitShare({ projectDir: nextExportProject, version: '0.10.0', git }),
        '.gitignore'
      ).content
    ).toContain('public/livelocale/');
    expect(
      (
        await planInitShare({
          projectDir: viteProject,
          branches: ['main', 'staging'],
          version: '0.10.0',
          git,
        })
      ).notes
    ).toContain(
      'Also merge .github/workflows/livelocale.yml into `staging`; pull requests into it run workflows from that branch, so LiveLocale cannot close their issues otherwise.'
    );
    expect(
      (await planInitShare({ projectDir: viteProject, version: '0.10.0', git })).notes.join('\n')
    ).not.toContain('Also merge');
    const wf = renderWorkflow({
      version: '0.10.0',
      localesPath: 'src/locales',
      sourceLocale: 'en',
      branches: ['main', 'staging'],
    });
    expect(wf).toContain(
      '      - run: npx --yes livelocale@0.10.0 apply --github-event --locales src/locales --source en --branches main,staging\n'
    );
    expect(wf).toContain(
      "concurrency: { group: 'livelocale-${{ github.event.issue.number || github.run_id }}', queue: max }"
    );
    expect(wf).toContain('permissions: { contents: write, pull-requests: write, issues: write }');
    expect(wf).toContain(
      "  workflow_dispatch: { inputs: { link: { description: 'LiveLocale change link', required: true } } }\n"
    );
    expect(wf).toMatch(/actions\/checkout@[0-9a-f]{40} # v4\.2\.2/);
    expect(wf).not.toContain('pull_request_target');
    for (const line of wf.split('\n').filter((l) => /\brun:/.test(l)))
      expect(line).not.toContain('${{');
    expect(() =>
      validateShareArgs({ localesPath: 'x; rm -rf ~', sourceLocale: 'en', branches: ['main'] })
    ).toThrow(/may only contain/);
    expect(() =>
      validateShareArgs({ localesPath: 'locales', sourceLocale: 'en', branches: ['$(id)'] })
    ).toThrow();
    const gl = await planInitShare({
      projectDir: viteProject,
      version: '0.10.0',
      git: gitWithOrigin('git@gitlab.com:a/b.git'),
    });
    expect(gl.files.some((f) => f.path.endsWith('livelocale.yml'))).toBe(false);
    expect(gl.notes.join()).toContain('apply "<link>" --pr');
    expect(readOwnVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('renders the exact workflow, with --dir only when the app is below the repository root', () => {
    const wf = renderWorkflow({
      version: '0.10.0',
      localesPath: 'apps/web/locales',
      sourceLocale: 'en',
      branches: ['main'],
      dir: 'apps/web',
    });
    expect(wf).toBe(
      [
        '# Written by `npx livelocale init --share`. Turns LiveLocale change links into pull requests.',
        '# livelocale reads the link from the event file; it never reaches a shell command.',
        'name: LiveLocale',
        'on:',
        '  issues: { types: [opened] }',
        '  issue_comment: { types: [created] }',
        '  pull_request: { types: [closed] }',
        "  workflow_dispatch: { inputs: { link: { description: 'LiveLocale change link', required: true } } }",
        'permissions: { contents: write, pull-requests: write, issues: write }',
        "concurrency: { group: 'livelocale-${{ github.event.issue.number || github.run_id }}', queue: max }",
        'jobs:',
        '  apply:',
        '    if: >-',
        "      github.event_name == 'workflow_dispatch' ||",
        "      (github.event_name == 'issues' && contains(github.event.issue.body, '```livelocale')) ||",
        "      (github.event_name == 'issue_comment' && !github.event.issue.pull_request &&",
        "       startsWith(github.event.comment.body, '/livelocale')) ||",
        "      (github.event_name == 'pull_request' && startsWith(github.event.pull_request.head.ref, 'livelocale/issue-') &&",
        '       github.event.pull_request.base.ref != github.event.repository.default_branch)',
        '    runs-on: ubuntu-latest',
        '    steps:',
        `      - uses: ${CHECKOUT_ACTION}`,
        '        with: { persist-credentials: false }',
        '      - run: npx --yes livelocale@0.10.0 apply --github-event --locales apps/web/locales --source en --branches main --dir apps/web',
        "        env: { GITHUB_TOKEN: '${{ github.token }}' }",
        '',
      ].join('\n')
    );
  });

  it('rejects unsafe arguments', () => {
    const ok = { localesPath: 'locales', sourceLocale: 'en', branches: ['main'] };
    expect(() => validateShareArgs(ok)).not.toThrow();
    expect(() => validateShareArgs({ ...ok, localesPath: '../locales' })).toThrow(
      '`--locales` may only contain letters, digits, ".", "_", "-" and "/".'
    );
    expect(() => validateShareArgs({ ...ok, localesPath: '/etc' })).toThrow(/may only contain/);
    expect(() => validateShareArgs({ ...ok, dir: 'a/../b' })).toThrow(/`--dir` may only contain/);
    expect(() => validateShareArgs({ ...ok, sourceLocale: 'en; id' })).toThrow(/--source/);
    expect(() =>
      validateShareArgs({ ...ok, branches: Array.from({ length: 11 }, (_, i) => `b${i}`) })
    ).toThrow(/at most 10/);
  });

  it('leaves a vite config that already shares unchanged and skips one without the plugin', async () => {
    const shared = project({
      ...viteFiles,
      'vite.config.ts': 'export default { plugins: [liveLocaleVite({ share: true })] };\n',
    });
    expect(
      fileOf(await planInitShare({ projectDir: shared, version: '0.10.0', git }), 'vite.config.ts')
        .action
    ).toBe('unchanged');
    const bare = project({ ...viteFiles, 'vite.config.ts': 'export default { plugins: [] };\n' });
    const plan = await planInitShare({ projectDir: bare, version: '0.10.0', git });
    expect(fileOf(plan, 'vite.config.ts').action).toBe('skipped');
    expect(plan.notes).toContain(
      "Add liveLocaleVite({ localesPath: 'src/locales', share: true }) to the plugins array in vite.config."
    );
  });

  it('keeps a build script that already packs and an ignored public/livelocale/', async () => {
    const cra = project({
      'package.json': pkg({
        dependencies: { 'react-scripts': '5.0.1' },
        scripts: { build: 'react-scripts build && livelocale pack build' },
      }),
    });
    expect(
      fileOf(await planInitShare({ projectDir: cra, version: '0.10.0', git }), 'package.json')
        .action
    ).toBe('unchanged');
    const next = project({ ...nextConfig(''), '.gitignore': 'node_modules\npublic/livelocale\n' });
    const plan = await planInitShare({ projectDir: next, version: '0.10.0', git });
    expect(fileOf(plan, '.gitignore').action).toBe('unchanged');
    expect(JSON.parse(fileOf(plan, 'package.json').content!).scripts['build:preview']).toBe(
      'livelocale build --preview --locales src/locales --source en -- next build'
    );
    expect(plan.notes).toContain(
      'Use "npm run build:preview" as the build command of your preview deployments.'
    );
  });

  it('gives the custom CI recipe for an unknown stack', async () => {
    const other = project({ 'package.json': pkg({}) });
    const plan = await planInitShare({ projectDir: other, version: '0.10.0', git });
    expect(plan.stack).toBe('unknown');
    expect(plan.files.map((f) => f.path)).toEqual(['.github/workflows/livelocale.yml']);
    expect(plan.notes.join('\n')).toContain('LIVELOCALE=preview');
    expect(plan.notes.join('\n')).toContain('npx livelocale pack <outDir>');
  });

  it('needs --locales when no locales folder is found', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-init-share-'));
    created.push(empty);
    await expect(planInitShare({ projectDir: empty, version: '0.10.0', git })).rejects.toThrow(
      'Pass --locales <path>.'
    );
  });

  it('skips a different workflow unless overwrite is set, and writes the planned files', async () => {
    const dir = project({
      ...viteFiles,
      '.github/workflows/livelocale.yml': 'name: Mine\n',
    });
    const skipped = await planInitShare({ projectDir: dir, version: '0.10.0', git });
    expect(fileOf(skipped, '.github/workflows/livelocale.yml').action).toBe('skipped');
    const plan = await planInitShare({ projectDir: dir, version: '0.10.0', git, overwrite: true });
    expect(fileOf(plan, '.github/workflows/livelocale.yml').action).toBe('update');
    writePlannedFiles(dir, plan.files);
    expect(fs.readFileSync(path.join(dir, '.github/workflows/livelocale.yml'), 'utf-8')).toContain(
      'livelocale@0.10.0 apply --github-event --locales src/locales --source en --branches main\n'
    );
    expect(fs.readFileSync(path.join(dir, 'vite.config.ts'), 'utf-8')).toContain(
      'liveLocaleVite({ share: true, '
    );
    const again = await planInitShare({ projectDir: dir, version: '0.10.0', git });
    expect(fileOf(again, '.github/workflows/livelocale.yml').action).toBe('unchanged');
    expect(fileOf(again, 'vite.config.ts').action).toBe('unchanged');
  });

  it('puts the workflow at the repository root and passes --dir for a nested app', async () => {
    const root = project({});
    const app = path.join(root, 'apps', 'web');
    fs.mkdirSync(path.join(app, 'locales'), { recursive: true });
    fs.writeFileSync(path.join(app, 'locales', 'en.json'), '{}');
    fs.writeFileSync(path.join(app, 'package.json'), pkg({}));
    const nested = fakeGit({
      'remote get-url origin': 'git@github.com:acme/site.git',
      'rev-parse --show-toplevel': root,
      'rev-parse --abbrev-ref HEAD': 'develop',
    });
    const plan = await planInitShare({ projectDir: app, version: '0.10.0', git: nested });
    const wf = fileOf(plan, '../../.github/workflows/livelocale.yml');
    expect(wf.content).toContain(
      '--locales apps/web/locales --source en --branches develop --dir apps/web\n'
    );
  });
});
