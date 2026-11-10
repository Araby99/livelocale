// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  KeyOccupiedError,
  lookupKey,
  parseJsonText,
  setNestedProperty,
  stringifyLike,
} from '../../src/core/json-path.js';

describe('lookupKey', () => {
  const dict = { a: { b: 'text', n: 5, nul: null, arr: ['x'], obj: {} }, s: 'top' };

  it('returns the string at a nested key', () =>
    expect(lookupKey(dict, 'a.b')).toEqual({ state: 'string', value: 'text' }));

  it.each(['a.c', 'x.y.z'])('reports %s as missing', (k) =>
    expect(lookupKey(dict, k)).toEqual({ state: 'missing' })
  );

  // null is how some export tools mark a text nobody translated: no data to lose.
  it.each(['a.nul', 'a.nul.deeper'])('reports %s, at or under a null, as missing', (k) =>
    expect(lookupKey(dict, k)).toEqual({ state: 'missing' })
  );

  it.each(['a', 'a.n', 'a.arr', 'a.obj', 's.deeper', 'a.arr.0'])(
    'reports %s as occupied (a write would replace data)',
    (k) => expect(lookupKey(dict, k)).toEqual({ state: 'occupied' })
  );

  it('reads own properties only', () => {
    expect(lookupKey(dict, 'constructor')).toEqual({ state: 'missing' });
    expect(lookupKey({}, 'toString')).toEqual({ state: 'missing' });
    expect(lookupKey(dict, 'a.__proto__')).toEqual({ state: 'missing' });
  });

  it('refuses a literal dotted key instead of walking past it', () => {
    // Review Focus 4
    expect(lookupKey({ 'dotted.key': 'literal' }, 'dotted.key')).toEqual({ state: 'occupied' });
    expect(lookupKey({ a: { 'b.c': 'x' } }, 'a.b.c')).toEqual({ state: 'occupied' });
  });

  it('treats a non-object dictionary as empty', () => {
    expect(lookupKey(undefined, 'a')).toEqual({ state: 'missing' });
    expect(lookupKey(['x'], '0')).toEqual({ state: 'missing' });
  });
});

describe('setNestedProperty', () => {
  it('writes nested keys, creating missing steps', () => {
    const obj: Record<string, any> = { a: { keep: 'k' } };
    setNestedProperty(obj, 'a.b.c', 'v');
    setNestedProperty(obj, 'toString.x', 'w');
    expect(obj).toEqual({ a: { keep: 'k', b: { c: 'v' } }, toString: { x: 'w' } });
  });

  it('replaces an existing string', () => {
    const obj: Record<string, any> = { a: { b: 'old' } };
    setNestedProperty(obj, 'a.b', 'new');
    expect(obj).toEqual({ a: { b: 'new' } });
  });

  it('writes over a null text and through a null step', () => {
    const obj: Record<string, any> = { a: null, b: null };
    setNestedProperty(obj, 'a', 'v');
    setNestedProperty(obj, 'b.c', 'w');
    expect(obj).toEqual({ a: 'v', b: { c: 'w' } });
  });

  it.each([
    ['an array item', { features: ['Fast', 'Free'] }, 'features.1'],
    ['a string step', { a: 'x' }, 'a.b.c'],
    ['a group of translations', { home: { title: 'x' } }, 'home'],
    ['a literal dotted key', { 'home.title': 'Hola' }, 'home.title'],
    ['a number', { count: 5 }, 'count'],
  ])('refuses to replace %s and leaves the object as it was', (_, dict, keyPath) => {
    const before = structuredClone(dict);
    let thrown: unknown;
    try {
      setNestedProperty(dict as Record<string, any>, keyPath, 'v');
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(KeyOccupiedError);
    expect(thrown).toMatchObject({ code: 'KEY_NOT_A_STRING', key: keyPath });
    expect(dict).toEqual(before);
  });

  it.each([
    '__proto__.polluted',
    'a.__proto__.polluted',
    'constructor.prototype.polluted',
    'prototype',
  ])('refuses %s without touching Object.prototype', (keyPath) => {
    expect(() => setNestedProperty({}, keyPath, 'yes')).toThrow(/Forbidden key segment/);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });
});

describe('parseJsonText', () => {
  it('reads a document that starts with a byte-order mark', () => {
    expect(parseJsonText('\uFEFF{"a":"1"}')).toEqual({ a: '1' });
  });

  it('reads a document without one', () => {
    expect(parseJsonText('{"a":"1"}')).toEqual({ a: '1' });
  });
});

describe('stringifyLike', () => {
  it('keeps Windows line endings', () => {
    expect(stringifyLike({ a: 'x\ny' }, '{\r\n  "a": "1"\r\n}\r\n')).toBe(
      '{\r\n  "a": "x\\ny"\r\n}\r\n'
    );
  });

  it('keeps a leading byte-order mark', () => {
    expect(stringifyLike({ a: '2' }, '\uFEFF{\n\t"a": "1"\n}')).toBe('\uFEFF{\n\t"a": "2"\n}');
  });

  it('keeps Unix line endings and no mark for an ordinary file', () => {
    expect(stringifyLike({ a: '2' }, '{\n  "a": "1"\n}\n')).toBe('{\n  "a": "2"\n}\n');
  });

  it('writes a new document with two spaces, LF and a trailing newline', () => {
    expect(stringifyLike({ a: '2' }, null)).toBe('{\n  "a": "2"\n}\n');
  });
});
