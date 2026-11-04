// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { watchLocation } from '../../src/client/location-watch.js';

describe('watchLocation', () => {
  const originalPush = history.pushState;
  const originalReplace = history.replaceState;
  const queue: (() => void)[] = [];
  const schedule = (cb: () => void) => {
    queue.push(cb);
  };
  const flush = () => queue.splice(0).forEach((cb) => cb());
  const cleanups: (() => void)[] = [];
  const watch = (report: (url: string) => void, watcher = watchLocation) => {
    const stop = watcher(window, report, schedule);
    cleanups.push(stop);
    return stop;
  };

  beforeEach(() => {
    History.prototype.replaceState.call(history, {}, '', '/');
  });

  afterEach(() => {
    cleanups.splice(0).forEach((stop) => stop());
    queue.length = 0;
    history.pushState = originalPush;
    history.replaceState = originalReplace;
    History.prototype.replaceState.call(history, {}, '', '/');
  });

  it('reports pushState, replaceState, popstate and hashchange', () => {
    const report = vi.fn();
    watch(report);

    history.pushState({}, '', '/a?x=1');
    flush();
    expect(report).toHaveBeenLastCalledWith('/a?x=1');

    history.replaceState({}, '', '/b');
    flush();
    expect(report).toHaveBeenLastCalledWith('/b');

    location.hash = '#h';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    flush();
    expect(report).toHaveBeenLastCalledWith('/b#h');

    History.prototype.replaceState.call(history, {}, '', '/c');
    window.dispatchEvent(new PopStateEvent('popstate'));
    flush();
    expect(report).toHaveBeenLastCalledWith('/c');
    expect(report).toHaveBeenCalledTimes(4);
  });

  it('coalesces a burst into one report and skips unchanged URLs', () => {
    const report = vi.fn();
    watch(report);
    for (let i = 1; i <= 10; i++) history.pushState({}, '', `/${i}`);
    expect(report).not.toHaveBeenCalled();
    expect(queue).toHaveLength(1);
    flush();
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith('/10');

    history.replaceState({}, '', '/10');
    flush();
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('passes this, arguments and the return value through', () => {
    const seenThis: unknown[] = [];
    const fake = vi.fn(function (this: unknown, ..._args: unknown[]) {
      seenThis.push(this);
      return 'r';
    });
    history.pushState = fake as unknown as History['pushState'];
    watch(vi.fn());
    expect(history.pushState).not.toBe(fake);

    expect((history.pushState as (...args: unknown[]) => unknown)(1, '', '/x')).toBe('r');
    expect(seenThis[0]).toBe(history);
    expect(fake.mock.calls[0]).toEqual([1, '', '/x']);
    queue.length = 0;

    fake.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(() => history.pushState({}, '', '/y')).toThrow('boom');
    expect(queue).toHaveLength(0);
  });

  it('wraps history once and restores it on cleanup', () => {
    const original = vi.fn(function (this: History, ...args: Parameters<History['pushState']>) {
      return originalPush.apply(this, args);
    });
    history.pushState = original as unknown as History['pushState'];
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = watch(first);
    const wrapper = history.pushState;
    const stopSecond = watch(second);
    expect(history.pushState).toBe(wrapper);

    history.pushState({}, '', '/one');
    flush();
    expect(original).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    stopFirst();
    expect(history.pushState).toBe(wrapper);
    stopSecond();
    expect(history.pushState).toBe(original);
    expect(history.replaceState).toBe(originalReplace);

    watch(vi.fn());
    const other = vi.fn();
    history.pushState = other as unknown as History['pushState'];
    cleanups.splice(0).forEach((stop) => stop());
    expect(history.pushState).toBe(other);
  });

  it('shares one wrapper across module copies', async () => {
    const original = vi.fn(function (this: History, ...args: Parameters<History['pushState']>) {
      return originalPush.apply(this, args);
    });
    history.pushState = original as unknown as History['pushState'];
    const first = vi.fn();
    const second = vi.fn();
    watch(first);
    const wrapper = history.pushState;
    vi.resetModules();
    const fresh = await import('../../src/client/location-watch.js');
    expect(fresh.watchLocation).not.toBe(watchLocation);
    watch(second, fresh.watchLocation);
    expect(history.pushState).toBe(wrapper);

    history.pushState({}, '', '/shared');
    flush();
    expect(original).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledWith('/shared');
    expect(second).toHaveBeenCalledWith('/shared');
  });

  it('a throwing report does not break navigation', () => {
    const report = vi.fn(() => {
      throw new Error('report failed');
    });
    watch(report);
    expect(() => history.pushState({}, '', '/z')).not.toThrow();
    expect(() => flush()).not.toThrow();
    expect(report).toHaveBeenCalledWith('/z');
  });
});
