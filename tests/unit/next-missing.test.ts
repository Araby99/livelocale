import { describe, it, expect } from 'vitest';
import { nextMissingKey } from '../../src/studio/features/dashboard/next-missing.js';

const valuesOf =
  (values: Record<string, string>) =>
  (key: string): boolean =>
    (values[key] ?? '') !== '';

describe('nextMissingKey', () => {
  const renderedKeys = ['nav.home', 'hero.title', 'hero.cta', 'footer.note'];

  it('walks rendered gaps in order and wraps', () => {
    const hasValue = valuesOf({ 'hero.title': 'Hi' });
    const input = { renderedKeys, allPageKeys: renderedKeys, hasValue };
    expect(nextMissingKey({ ...input, currentKey: null })).toEqual({
      kind: 'key',
      key: 'nav.home',
    });
    expect(nextMissingKey({ ...input, currentKey: 'nav.home' })).toEqual({
      kind: 'key',
      key: 'hero.cta',
    });
    expect(nextMissingKey({ ...input, currentKey: 'hero.cta' })).toEqual({
      kind: 'key',
      key: 'footer.note',
    });
    expect(nextMissingKey({ ...input, currentKey: 'footer.note' })).toEqual({
      kind: 'key',
      key: 'nav.home',
    });
    // A key no longer on the page starts the walk from the top.
    expect(nextMissingKey({ ...input, currentKey: 'gone.key' })).toEqual({
      kind: 'key',
      key: 'nav.home',
    });
  });

  it('skips keys that have a value', () => {
    const hasValue = valuesOf({ 'nav.home': 'Home', 'hero.title': 'Hi', 'hero.cta': 'Go' });
    expect(
      nextMissingKey({ renderedKeys, allPageKeys: renderedKeys, currentKey: null, hasValue })
    ).toEqual({ kind: 'key', key: 'footer.note' });
    // The current key still empty is offered again rather than claiming the page is done.
    expect(
      nextMissingKey({
        renderedKeys,
        allPageKeys: renderedKeys,
        currentKey: 'footer.note',
        hasValue,
      })
    ).toEqual({ kind: 'key', key: 'footer.note' });
  });

  it('done counts hidden gaps', () => {
    const hasValue = valuesOf({
      'nav.home': 'Home',
      'hero.title': 'Hi',
      'hero.cta': 'Go',
      'footer.note': 'Note',
      'menu.open': 'Open',
    });
    const allPageKeys = [
      ...renderedKeys,
      'menu.open',
      'menu.close',
      'slide.two',
      'slide.three',
      'slide.two',
    ];
    expect(nextMissingKey({ renderedKeys, allPageKeys, currentKey: 'hero.cta', hasValue })).toEqual(
      { kind: 'done', hiddenMissing: 3 }
    );
  });

  it('done with zero hidden', () => {
    const hasValue = () => true;
    expect(
      nextMissingKey({ renderedKeys, allPageKeys: renderedKeys, currentKey: null, hasValue })
    ).toEqual({ kind: 'done', hiddenMissing: 0 });
    expect(
      nextMissingKey({ renderedKeys: [], allPageKeys: [], currentKey: null, hasValue })
    ).toEqual({ kind: 'done', hiddenMissing: 0 });
  });
});
