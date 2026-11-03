// @vitest-environment node
import { readFileSync } from 'node:fs';
import * as ts from 'typescript';
import { it, expect } from 'vitest';
import { classLiterals } from './helpers/class-literals';
import { studioFiles } from './helpers/studio-files';

const FAINT_TEXT = /(?<![\w-])((?:[\w-]+:)*)(?:text|placeholder)-fg-faint(?:\/\d+)?(?![\w-])/g;
const FADED_TEXT = /(?<![\w-])(?:[\w-]+:)*(?:text|placeholder)-[a-z][\w-]*\/\d+(?![\w-])/g;

const hasAriaHidden = (element: ts.JsxOpeningLikeElement): boolean =>
  element.attributes.properties.some(
    (p) => ts.isJsxAttribute(p) && p.name.getText() === 'aria-hidden'
  );

/** `fg-faint` text or placeholder classes on an element that is neither disabled nor aria-hidden. */
function faintMisuses(source: string, file: string): string[] {
  return classLiterals(ts, source, file).flatMap((l) => {
    if (!l.element || hasAriaHidden(l.element)) return [];
    return [...l.text.matchAll(FAINT_TEXT)]
      .filter((m) => !m[1]!.includes('disabled:'))
      .map((m) => `${file}:${l.line}: ${m[0]}`);
  });
}

/** Text or placeholder colour classes with an opacity suffix, with their line. */
function fadedText(source: string, file: string): string[] {
  return source
    .split(/\r?\n/)
    .flatMap((text, i) => [...text.matchAll(FADED_TEXT)].map((m) => `${file}:${i + 1}: ${m[0]}`));
}

// fg-faint stays below 4.5:1 on purpose; WCAG exempts only disabled controls and decoration.
it('uses fg-faint only for disabled states and aria-hidden decoration', () => {
  expect(faintMisuses('<p className="text-fg-faint">Hint</p>', 'x.tsx')).toEqual([
    'x.tsx:1: text-fg-faint',
  ]);
  expect(faintMisuses('<input className="placeholder-fg-faint" />', 'x.tsx')).toEqual([
    'x.tsx:1: placeholder-fg-faint',
  ]);
  expect(
    faintMisuses(
      '<button className="disabled:text-fg-faint" /><span aria-hidden="true" className="text-fg-faint">→</span>',
      'x.tsx'
    )
  ).toEqual([]);
  const found = studioFiles('src/studio', /\.tsx$/).flatMap((f) =>
    faintMisuses(readFileSync(f, 'utf8'), f)
  );
  expect(found).toEqual([]);
});

// An opacity suffix on a text token lowers the contrast Task 10 measured.
it('never fades a text colour token', () => {
  expect(fadedText('<p className="text-fg-muted/80 bg-surface/90">', 'x.tsx')).toEqual([
    'x.tsx:1: text-fg-muted/80',
  ]);
  const found = studioFiles('src/studio', /\.tsx$/).flatMap((f) =>
    fadedText(readFileSync(f, 'utf8'), f)
  );
  expect(found).toEqual([]);
});
