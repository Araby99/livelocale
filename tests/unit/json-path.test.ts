// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { lookupKey, setNestedProperty } from '../../src/core/json-path.js';

describe('lookupKey', () => {
  const dict = { a: { b: 'text', n: 5, nul: null, arr: ['x'], obj: {} }, s: 'top' };

  it('returns the string at a nested key', () =>
    expect(lookupKey(dict, 'a.b')).toEqual({ state: 'string', value: 'text' }));

  it.each(['a.c', 'x.y.z'])('reports %s as missing', (k) =>
    expect(lookupKey(dict, k)).toEqual({ state: 'missing' })
  );

  it.each(['a', 'a.n', 'a.nul', 'a.arr', 'a.obj', 's.deeper', 'a.arr.0'])(
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
  it('writes nested keys and replaces non-object steps', () => {
    const obj: Record<string, any> = { a: 'x' };
    setNestedProperty(obj, 'a.b.c', 'v');
    setNestedProperty(obj, 'toString.x', 'w');
    expect(obj).toEqual({ a: { b: { c: 'v' } }, toString: { x: 'w' } });
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
