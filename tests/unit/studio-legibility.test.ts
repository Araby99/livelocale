// @vitest-environment node
import { readFileSync } from 'node:fs';
import * as ts from 'typescript';
import { it, expect } from 'vitest';
import { studioFiles } from './helpers/studio-files';
import { cssDecls } from './helpers/studio-tokens.js';
import { contrastRatio } from './helpers/contrast.js';

const TSX = studioFiles('src/studio', /\.tsx$/);

// The Studio is used by translators and marketers, not only developers: 12px is the floor for
// anything they read, and the values and text they edit are larger still.
it('sets no text below 12px anywhere in the Studio', () => {
  const tiny = /(?<![\w-])(?:[\w-]+:)*text-\[(?:[0-9]|1[01])(?:\.\d+)?px\]/g;
  const found = TSX.flatMap((file) =>
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .flatMap((line, i) => [...line.matchAll(tiny)].map((m) => `${file}:${i + 1}: ${m[0]}`))
  );
  expect(found).toEqual([]);
});

/** Every string literal under `node`, following identifiers to their declaration in `sf`. */
function literals(node: ts.Node, sf: ts.SourceFile, seen = new Set<string>()): string[] {
  const out: string[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isStringLiteralLike(n) || ts.isTemplateLiteralToken(n)) out.push(n.text);
    else if (ts.isIdentifier(n) && !seen.has(n.text)) {
      seen.add(n.text);
      const find = (d: ts.Node): void => {
        if (ts.isVariableDeclaration(d) && d.name.getText(sf) === n.text && d.initializer) {
          out.push(...literals(d.initializer, sf, seen));
        } else ts.forEachChild(d, find);
      };
      find(sf);
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return out;
}

/** Text fields and menus whose border is the only thing that marks where to type. */
function fieldsWithoutStrongBorder(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      ['input', 'textarea', 'select'].includes(node.tagName.getText(sf))
    ) {
      const attr = (name: string) =>
        node.attributes.properties.find(
          (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText(sf) === name
        );
      const type = attr('type')?.initializer;
      const typeText = type && ts.isStringLiteral(type) ? type.text : 'text';
      const className = attr('className')?.initializer;
      const classes = className ? literals(className, sf).join(' ') : '';
      const exempt =
        ['checkbox', 'radio', 'file', 'hidden'].includes(typeText) ||
        /(?<![\w-])sr-only(?![\w-])/.test(classes);
      if (!exempt && !/(?<![\w:-])border-line-strong(?![\w-])/.test(classes)) {
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        found.push(`${file}:${line}: <${node.tagName.getText(sf)}>`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

// WCAG 1.4.11: the edge of a field needs 3:1 against what it sits on. The plain line token is
// about 1.2:1, so a field drawn with it at rest is barely there.
it('draws every text field and menu with the strong line at rest', () => {
  expect(TSX.flatMap(fieldsWithoutStrongBorder)).toEqual([]);
});

it('keeps the strong line at 3:1 or more on every surface a field sits on, in both themes', () => {
  const css = readFileSync('src/studio/index.css', 'utf8');
  for (const selector of [':root', '.dark']) {
    const decls = cssDecls(css, selector);
    const strong = decls.get('--lc-line-strong')!;
    for (const surface of ['surface', 'raised', 'accent-soft']) {
      expect(
        contrastRatio(strong, decls.get(`--lc-${surface}`)!),
        `${selector} ${surface}`
      ).toBeGreaterThanOrEqual(3);
    }
  }
});

it('turns Studio animations and transitions off when the system asks for reduced motion', () => {
  const css = readFileSync('src/studio/index.css', 'utf8');
  const block = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/.exec(css);
  expect(block).not.toBeNull();
  expect(block![1]).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
  expect(block![1]).toMatch(/animation-iteration-count:\s*1\s*!important/);
  expect(block![1]).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
  expect(block![1]).toMatch(/scroll-behavior:\s*auto\s*!important/);
});

// The text people read and edit most is a step above the floor: the key list's values and the
// editor's field are 14px (text-sm), so an Arabic value is never squeezed below 13px.
it('sets the key list values and the editor field at 14px or more', () => {
  const at = (file: string, anchor: string) => {
    const source = readFileSync(file, 'utf8');
    const start = source.indexOf(anchor);
    expect(start, anchor).toBeGreaterThan(-1);
    return /className=[{`"][^\n]*/.exec(source.slice(start))![0];
  };
  const components = 'src/studio/features/dashboard/components';
  expect(at(`${components}/KeysDirectory.tsx`, 'data-testid="key-row-value"')).toMatch(
    /(?<![\w-])text-(?:sm|base)(?![\w-])/
  );
  expect(at(`${components}/TranslationEditor.tsx`, 'id={TRANSLATION_INPUT_ID}')).toMatch(
    /(?<![\w-])text-(?:sm|base)(?![\w-])/
  );
});
