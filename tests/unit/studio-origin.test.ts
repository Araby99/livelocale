// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveStudioOrigin,
  DEFAULT_STUDIO_ORIGIN,
  STUDIO_ORIGIN_STORAGE_KEY,
} from '../../src/client/iframe-bridge.js';

describe('resolveStudioOrigin', () => {
  beforeEach(() => sessionStorage.clear());

  it('uses the livelocale-origin query parameter and remembers it for the tab', () => {
    const origin = resolveStudioOrigin(
      '?livelocale-origin=http%3A%2F%2Flocalhost%3A3011',
      sessionStorage
    );
    expect(origin).toBe('http://localhost:3011');
    expect(sessionStorage.getItem(STUDIO_ORIGIN_STORAGE_KEY)).toBe('http://localhost:3011');
  });

  it('keeps the remembered origin after in-app navigation drops the parameter', () => {
    resolveStudioOrigin('?livelocale-origin=https%3A%2F%2Fstudio.example.com', sessionStorage);
    expect(resolveStudioOrigin('?locale=ar', sessionStorage)).toBe('https://studio.example.com');
  });

  it('falls back to the default Studio origin with nothing passed or remembered', () => {
    expect(resolveStudioOrigin('', sessionStorage)).toBe(DEFAULT_STUDIO_ORIGIN);
    expect(DEFAULT_STUDIO_ORIGIN).toBe('http://localhost:3010');
  });

  it('ignores values that are not an http(s) origin', () => {
    for (const bad of ['javascript%3Aalert(1)', '*', 'not a url', 'ftp%3A%2F%2Fx.example']) {
      sessionStorage.clear();
      expect(resolveStudioOrigin(`?livelocale-origin=${bad}`, sessionStorage)).toBe(
        DEFAULT_STUDIO_ORIGIN
      );
    }
    sessionStorage.setItem(STUDIO_ORIGIN_STORAGE_KEY, '*');
    expect(resolveStudioOrigin('', sessionStorage)).toBe(DEFAULT_STUDIO_ORIGIN);
  });

  it('normalises a full URL to its origin', () => {
    expect(
      resolveStudioOrigin(
        '?livelocale-origin=https%3A%2F%2Fstudio.example.com%2Fpath%3Fx%3D1',
        null
      )
    ).toBe('https://studio.example.com');
  });

  it('works when storage is unavailable', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    expect(resolveStudioOrigin('?livelocale-origin=http%3A%2F%2Flocalhost%3A3011', throwing)).toBe(
      'http://localhost:3011'
    );
    expect(resolveStudioOrigin('', throwing)).toBe(DEFAULT_STUDIO_ORIGIN);
  });
});
