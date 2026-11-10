// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ApplyPlan, EditStatus, PlannedEdit } from '../../src/core/apply-plan.js';
import { encodeChangeLink, type ChangeSet } from '../../src/core/change-link.js';
import { renderTerminalSummary } from '../../src/codemod/apply/report.js';
import { runLocalApply } from '../../src/codemod/apply/local.js';
import { FileMutator } from '../../src/server/file-mutator.js';

function makePlan(edits: PlannedEdit[]): ApplyPlan {
  const counts: Record<EditStatus, number> = {
    apply: 0,
    already: 0,
    conflict: 0,
    invalid: 0,
    'needs-force': 0,
  };
  for (const edit of edits) counts[edit.status] += 1;
  return { edits, counts };
}

const edit = (over: Partial<PlannedEdit> = {}): PlannedEdit => ({
  locale: 'ar',
  key: 'home.title',
  from: 'أهلا',
  to: 'مرحبا',
  force: false,
  status: 'apply',
  flags: [],
  ...over,
});

describe('renderTerminalSummary — reasons and flags', () => {
  const plan = makePlan([
    edit({ key: 'pay.url', locale: 'en', from: 'x', to: 'y', flags: ['new-url'] }),
    edit({ key: 'home.a' }),
    edit({
      key: 'home.d',
      status: 'conflict',
      code: 'CHANGED_ON_TARGET',
      message: 'Changed on the target since the link was made.',
      current: 'حالي',
    }),
    edit({
      key: 'home.e',
      status: 'invalid',
      code: 'PLACEHOLDER_MISMATCH',
      message: 'Placeholders differ from the reference: missing {name}.',
    }),
    edit({
      key: 'home.f',
      status: 'needs-force',
      code: 'PLACEHOLDER_MISMATCH',
      message: 'Placeholders differ from the reference: missing {name}.',
    }),
  ]);

  it('gives the reason for every edit it did not apply, and the flags of applied ones', () => {
    expect(renderTerminalSummary(plan, { localesPath: 'locales' }).split('\n')).toEqual([
      'Applied 2 · already done 0 · conflicts 1 · needs --force 1 · rejected 1',
      'applied en pay.url  ⚠ Adds a web address that the source text does not have.',
      'applied ar home.a',
      'conflict ar home.d — Changed on the target since the link was made.',
      'rejected ar home.e — Placeholders differ from the reference: missing {name}.',
      'needs --force ar home.f — Placeholders differ from the reference: missing {name}. Pass --force to apply it.',
      '⚠ 1 applied edit has a warning. Review it with: git diff -- locales',
    ]);
  });

  it('marks a dry run and says nothing was written', () => {
    const lines = renderTerminalSummary(plan, { dryRun: true, localesPath: 'locales' }).split('\n');
    expect(lines[0]).toBe('Dry run: nothing was written.');
    expect(lines[1]).toBe(
      'Would apply 2 · already done 0 · conflicts 1 · needs --force 1 · rejected 1'
    );
    expect(lines[2]).toBe(
      'would apply en pay.url  ⚠ Adds a web address that the source text does not have.'
    );
    expect(lines).not.toContain(
      '⚠ 1 applied edit has a warning. Review it with: git diff -- locales'
    );
  });

  it('lists edits whose file could not be written', () => {
    const failing = plan.edits[1]!;
    const lines = renderTerminalSummary(plan, {
      localesPath: 'locales',
      failed: new Map([[failing, 'cannot write locales/ar.json: the file is read-only.']]),
    }).split('\n');
    expect(lines[0]).toBe(
      'Applied 1 · already done 0 · conflicts 1 · needs --force 1 · rejected 1 · failed 1'
    );
    expect(lines).toContain(
      'failed ar home.a — cannot write locales/ar.json: the file is read-only.'
    );
  });
});

describe('runLocalApply — output', () => {
  const dirs: string[] = [];
  afterEach(() => {
    vi.restoreAllMocks();
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  function project(files: Record<string, unknown>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-apply-out-'));
    dirs.push(dir);
    for (const [rel, content] of Object.entries(files)) {
      const file = path.join(dir, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(content), 'utf-8');
    }
    return dir;
  }

  const set = (edits: ChangeSet['edits'], src = 'en'): ChangeSet => ({
    branch: '',
    base: '',
    src,
    by: '',
    note: '',
    edits,
  });

  it('writes the other files, then lists the ones it could not write', async () => {
    const projectDir = project({
      'locales/en.json': { home: { title: 'Hello', b: 'B' } },
      'locales/es.json': { home: { title: 'Hola', b: 'B' } },
    });
    const real = FileMutator.prototype.updateLocaleKey;
    vi.spyOn(FileMutator.prototype, 'updateLocaleKey').mockImplementation(async function (
      this: FileMutator,
      ...args: Parameters<FileMutator['updateLocaleKey']>
    ) {
      if (args[1] === 'es') {
        throw new Error(
          `[livelocale] Failed to rename temp file to target at ${args[0]}. Operation: rename. Original error: EPERM: operation not permitted, rename 'a' -> 'b'`
        );
      }
      return real.apply(this, args);
    });
    const logs: string[] = [];
    const input = await encodeChangeLink(
      set([
        { locale: 'en', key: 'home.title', from: 'Hello', to: 'Hey', force: false },
        { locale: 'es', key: 'home.title', from: 'Hola', to: 'Buenas', force: false },
        { locale: 'es', key: 'home.b', from: 'B', to: 'Be', force: false },
      ])
    );
    const result = await runLocalApply({ projectDir, input, log: (l) => logs.push(l) });
    expect(result.exitCode).toBe(1);
    expect(result.written).toEqual(['locales/en.json']);
    expect(logs.join('\n').split('\n')).toEqual([
      'Applied 1 · already done 0 · conflicts 0 · needs --force 0 · rejected 0 · failed 2',
      'applied en home.title',
      'failed es home.title — cannot write locales/es.json: the file is read-only or in use.',
      'failed es home.b — cannot write locales/es.json: the file is read-only or in use.',
    ]);
    expect(JSON.parse(fs.readFileSync(path.join(projectDir, 'locales/en.json'), 'utf-8'))).toEqual({
      home: { title: 'Hey', b: 'B' },
    });
  });

  it('does not tell the user to pass --source when they did', async () => {
    const projectDir = project({
      'locales/en.json': { a: 'A' },
      'locales/es.json': { a: 'A' },
    });
    const input = await encodeChangeLink(
      set([{ locale: 'en', key: 'a', from: 'A', to: 'B', force: false }], 'en')
    );
    const logs: string[] = [];
    await runLocalApply({ projectDir, input, sourceLocale: 'es', log: (l) => logs.push(l) });
    expect(logs[0]).toBe('The link says the source locale is `en`; using `es` from --source.');
  });

  it('finds messages/ when --locales is not given', async () => {
    const projectDir = project({ 'messages/en.json': { a: 'A' } });
    const input = await encodeChangeLink(
      set([{ locale: 'en', key: 'a', from: 'A', to: 'B', force: false }])
    );
    const logs: string[] = [];
    const result = await runLocalApply({ projectDir, input, log: (l) => logs.push(l) });
    expect(result.written).toEqual(['messages/en.json']);
    expect(logs[0]).toBe('Locales folder: messages (found it; pass --locales to pick another)');
  });
});
