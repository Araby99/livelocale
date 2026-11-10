// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IframeBridge } from '../../src/client/iframe-bridge.js';

const postMessage = vi.fn();
const realParent = window.parent;

function sent(type: Parameters<IframeBridge['sendToParent']>[0], payload: unknown): unknown {
  Object.defineProperty(window, 'parent', { value: { postMessage }, configurable: true });
  postMessage.mockClear();
  new IframeBridge('http://localhost:3010').sendToParent(type, payload);
  return postMessage.mock.calls[0]?.[0]?.payload;
}

afterEach(() => {
  Object.defineProperty(window, 'parent', { value: realParent, configurable: true });
});

describe('IframeBridge key check', () => {
  it('passes keys the save API accepts: accents, other scripts and spaces', () => {
    for (const key of ['home.título', 'الرئيسية.عنوان', 'Hello world', 'nav.sign-in_2']) {
      const payload = { key, fallbackValue: 'x', currentValue: 'x' };
      expect(sent('ELEMENT_SELECTED', payload)).toEqual(payload);
    }
    expect(sent('VISIBLE_KEYS_CHANGED', ['home.título', 'Hello world'])).toEqual([
      'home.título',
      'Hello world',
    ]);
  });

  it('still drops keys the save API refuses', () => {
    for (const key of ['', 'a..b', 'a/b', 'ns:key', ' lead', 'x'.repeat(201)]) {
      expect(sent('ELEMENT_SELECTED', { key, fallbackValue: 'x', currentValue: 'x' })).toBe(
        undefined
      );
    }
    expect(sent('VISIBLE_KEYS_CHANGED', ['ok.key', 'a/b', 7])).toEqual(['ok.key']);
  });
});
