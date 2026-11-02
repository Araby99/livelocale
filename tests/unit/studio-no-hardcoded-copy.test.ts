// @vitest-environment node
import { readFileSync } from 'node:fs';
import * as ts from 'typescript';
import { it, expect } from 'vitest';
import { parseAllowFile } from '../../src/codemod/hardcoded/allow-list';
import { isMostlyLatin } from '../../src/codemod/hardcoded/locale-script';
import { findHardcodedText, TEXT_ATTRIBUTES } from '../../src/codemod/hardcoded/scan-jsx';
import { isUserText, normalizeText } from '../../src/codemod/hardcoded/text-filters';
import { classLiterals } from './helpers/class-literals';
import { studioFiles } from './helpers/studio-files';

const allow = parseAllowFile('LiveLocale\nlivelocale\nEnglish\n');

/** Literals the literal sweep may keep in English: [file, text, reason]. */
const EXEMPT: ReadonlyArray<readonly [file: string, text: string, reason: string]> = [
  ['src/studio/api.ts', 'Bearer ', 'the HTTP Authorization scheme'],
  [
    'src/studio/config.ts',
    'This Studio was opened from a website, but livelocale/manifest.json is missing or is not a LiveLocale manifest. Rebuild with share: true (or run livelocale pack) and upload the whole livelocale/ folder.',
    'also read by the Node build checks, which cannot load the catalogue; the Studio shows setup.manifest_missing through studioMessage',
  ],
  [
    'src/studio/features/dashboard/components/ReviewPanel.tsx',
    'npx livelocale apply --clipboard --pr',
    'the livelocale apply command line, written for the developer',
  ],
  [
    'src/studio/features/dashboard/components/ReviewPanel.tsx',
    'Actions → LiveLocale → Run workflow',
    "GitHub's own menu path, which GitHub shows in English",
  ],
  ...[
    'IndexedDB request failed',
    'IndexedDB transaction failed',
    'IndexedDB transaction aborted',
    'IndexedDB did not open in time',
    'IndexedDB failed to open',
  ].map(
    (text) =>
      [
        'src/studio/transport/draft-store.ts',
        text,
        "stands in for the browser's own English IndexedDB error",
      ] as const
  ),
  ['src/studio/transport/drafts.ts', '+++ b/', 'a diff header, written for the repository'],
  ...['Cannot save "', '" in ', ': it would replace translations that are not a single text.'].map(
    (text) =>
      [
        'src/studio/transport/static.ts',
        text,
        'the shared validation message of src/core/save-rules.ts (spec §12.1)',
      ] as const
  ),
  [
    'src/studio/vite.config.ts',
    "frame-src 'self' http://localhost:* http://127.0.0.1:*",
    "the dev server's Content-Security-Policy header",
  ],
];

/** JSX attributes whose value is code, never copy. */
const CODE_ATTRIBUTES = new Set(['className', 'class', 'id', 'key', 'type', 'role', 'href', 'src']);
/** Calls whose arguments are catalogue keys, module names or code inside a catalogue sentence. */
const CODE_CALLS = new Set(['t', 'require', 'withCode']);
/** String methods that test text, never show it: `line.startsWith('new file')`. */
const TEST_METHODS = new Set(['startsWith', 'endsWith', 'includes', 'indexOf']);
/** Declarations written for the developer or the repository (Arabic shared rules). */
const DEVELOPER_TEXT = new Set([
  'issueTitle',
  'PASTE_HERE_BODY',
  'applyCommandFor',
  'changeFileName',
]);
const EQUALITY = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
]);

type Literal =
  | ts.StringLiteral
  | ts.NoSubstitutionTemplateLiteral
  | ts.TemplateHead
  | ts.TemplateMiddle
  | ts.TemplateTail;

/** True when a call's arguments are never copy: `t(…)`, `textFor(…)(…)`, `require(…)`, `console.*(…)`,
 *  `withCode(…)` and the string tests in TEST_METHODS. */
function isCodeCall(call: ts.CallExpression): boolean {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return CODE_CALLS.has(callee.text);
  if (ts.isPropertyAccessExpression(callee))
    return (
      (ts.isIdentifier(callee.expression) && callee.expression.text === 'console') ||
      TEST_METHODS.has(callee.name.text)
    );
  return (
    ts.isCallExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === 'textFor'
  );
}

/** True for a JSX attribute whose value is code: a code attribute, a `data-*` attribute, or any
 *  attribute of a DOM element (`dir`, `d`, `rel`, `strokeLinecap`, …) that a user neither reads nor hears. */
function isCodeAttribute(attribute: ts.JsxAttribute): boolean {
  const name = attribute.name.getText();
  if (CODE_ATTRIBUTES.has(name) || name.startsWith('data-')) return true;
  const tag = attribute.parent.parent.tagName.getText();
  return /^[a-z]/.test(tag) && !TEXT_ATTRIBUTES.has(name);
}

/** True when the literal sits where its text is code, never copy. */
function isCodePlace(literal: Literal): boolean {
  // A template head or span text stands for its whole template expression.
  let node: ts.Node =
    ts.isStringLiteral(literal) || ts.isNoSubstitutionTemplateLiteral(literal)
      ? literal
      : literal.parent;
  if (ts.isTemplateSpan(node)) node = node.parent;
  const parent = node.parent;
  // Module specifiers.
  if (
    ts.isImportDeclaration(parent) ||
    ts.isExportDeclaration(parent) ||
    ts.isExternalModuleReference(parent) ||
    ts.isLiteralTypeNode(parent)
  )
    return true;
  // Property names, including computed ones (`obj['x']`).
  if (
    (ts.isPropertyAssignment(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isMethodDeclaration(parent)) &&
    parent.name === node
  )
    return true;
  if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) return true;
  // Compared, never shown: `mode === 'static'`, `case 'Escape':`.
  if (ts.isBinaryExpression(parent) && EQUALITY.has(parent.operatorToken.kind)) return true;
  if (ts.isCaseClause(parent) && parent.expression === node) return true;
  for (let n: ts.Node = node; n.parent; n = n.parent) {
    const up = n.parent;
    if (ts.isJsxAttribute(up) && isCodeAttribute(up)) return true;
    if (ts.isCallExpression(up) && up.arguments.includes(n as ts.Expression) && isCodeCall(up))
      return true;
    if (
      (ts.isVariableDeclaration(up) || ts.isFunctionDeclaration(up)) &&
      up.name &&
      ts.isIdentifier(up.name) &&
      DEVELOPER_TEXT.has(up.name.text)
    )
      return true;
  }
  return false;
}

/** A single word with no space is copy only when written as one (`Cancel`), never as an identifier
 *  (`static`, `connected`, `POST`, `ValidationError`, `-1000px`). */
function readsAsCopy(text: string): boolean {
  const normalized = normalizeText(text);
  return /\s/.test(normalized) || /^[A-Z][a-z]+[.!?:…]?$/.test(normalized);
}

/** A CSS class list or media query (`h-9 px-3 border`, `(min-width: 1280px)`): lowercase CSS tokens,
 *  at least half of them with a `-` or `:`, kept in a constant whose name does not say "class". */
function isCssText(text: string): boolean {
  const tokens = normalizeText(text).split(' ');
  return (
    tokens.every((token) => /^[a-z\d!:[\]().,%/#_-]+$/.test(token)) &&
    tokens.filter((token) => /[-:]/.test(token)).length * 2 >= tokens.length
  );
}

/** Every English string literal and template text in one Studio file that a user could read. */
function copyLiterals(
  tsModule: typeof ts,
  source: string,
  file: string
): { line: number; text: string }[] {
  const sf = tsModule.createSourceFile(
    file,
    source,
    tsModule.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? tsModule.ScriptKind.TSX : tsModule.ScriptKind.TS
  );
  const classes = new Set(classLiterals(tsModule, source, file).map((c) => `${c.line}:${c.text}`));
  const found: { line: number; text: string }[] = [];
  const visit = (node: ts.Node): void => {
    if (
      tsModule.isStringLiteral(node) ||
      tsModule.isNoSubstitutionTemplateLiteral(node) ||
      tsModule.isTemplateHead(node) ||
      tsModule.isTemplateMiddle(node) ||
      tsModule.isTemplateTail(node)
    ) {
      const text = node.text;
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      if (
        isUserText(normalizeText(text), allow) &&
        isMostlyLatin(text, allow) &&
        readsAsCopy(text) &&
        !isCssText(text) &&
        !classes.has(`${line}:${text}`) &&
        !isCodePlace(node)
      )
        found.push({ line, text });
    }
    tsModule.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

it('keeps every user-visible JSX string in the catalogue', () => {
  const ICU = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);
  const found = studioFiles('src/studio', /\.tsx$/).flatMap((file) =>
    findHardcodedText(ts, readFileSync(file, 'utf8'), file, allow, { templates: true })
      .filter((f) => !(file.endsWith('/PluralEditor.tsx') && ICU.has(f.text)))
      .map((f) => `${file}:${f.line}: ${f.text}`)
  );
  expect(found).toEqual([]);
});

it('finds copy in constants and skips code, class strings and developer text', () => {
  const source = [
    `const NO_LINK = 'Paste a change link first.';`,
    'const issueTitle = (n: number) => `LiveLocale: ${n} translation changes`;',
    `<p className="text-fg px-2" data-testid="x-y">{t('tips.title')}</p>;`,
    `console.warn('Something odd happened');`,
  ].join('\n');
  expect(copyLiterals(ts, source, 'x.tsx').map((l) => l.text)).toEqual([
    'Paste a change link first.',
  ]);
});

it('skips comparisons, DOM attributes, identifiers and CSS text', () => {
  const source = [
    `if (mode === 'static' && line.startsWith('new file')) setState('connected');`,
    `const WIDE = '(min-width: 1280px)';`,
    `const STYLES = { sent: 'h-9 px-3 rounded-xl border bg-raised' };`,
    `<path strokeLinecap="round" d="M5 13l4 4L19 7" />;`,
    `<Button label="Keep this one" />;`,
  ].join('\n');
  expect(copyLiterals(ts, source, 'x.tsx').map((l) => l.text)).toEqual(['Keep this one']);
});

it('keeps every user-visible string literal in the catalogue', () => {
  const exempt = new Set(EXEMPT.map(([f, text]) => `${f}: ${text}`));
  const hits = studioFiles('src/studio')
    .filter((f) => !f.startsWith('src/studio/i18n/'))
    .flatMap((file) =>
      copyLiterals(ts, readFileSync(file, 'utf8'), file).map((l) => `${file}: ${l.text}`)
    );
  expect(hits.filter((hit) => !exempt.has(hit))).toEqual([]);
  // An exemption whose literal is gone is stale.
  expect([...exempt].filter((entry) => !hits.includes(entry))).toEqual([]);
});
