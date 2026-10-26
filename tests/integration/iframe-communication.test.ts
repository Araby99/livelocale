// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { IframeBridge } from '../../src/client/iframe-bridge.js';

describe('IframeBridge', () => {
  const ALLOWED_ORIGIN = 'http://localhost:3010';
  let bridge: IframeBridge;

  beforeEach(() => {
    bridge = new IframeBridge(ALLOWED_ORIGIN);
    // In JSDOM, window.parent is window by default.
    // To mock window.parent.postMessage, we can spy on window.postMessage if parent === window.
    // Or we can mock window.parent dynamically.
    Object.defineProperty(window, 'parent', {
      value: {
        postMessage: vi.fn(),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should post a message to the parent window with correct envelope', () => {
    bridge.sendToParent('ELEMENT_SELECTED', {
      key: 'home.title',
      fallbackValue: 'Hello',
      currentValue: 'Hello',
    });

    expect(window.parent.postMessage).toHaveBeenCalledWith(
      {
        source: 'livelocale-client',
        type: 'ELEMENT_SELECTED',
        payload: {
          key: 'home.title',
          fallbackValue: 'Hello',
          currentValue: 'Hello',
        },
      },
      ALLOWED_ORIGIN
    );
  });

  it('should drop ELEMENT_SELECTED message if key contains invalid characters', () => {
    // Key has invalid characters (e.g. spaces or symbols)
    bridge.sendToParent('ELEMENT_SELECTED', {
      key: 'invalid key!',
      fallbackValue: 'Hello',
      currentValue: 'Hello',
    });

    expect(window.parent.postMessage).not.toHaveBeenCalled();
  });

  it('should drop ELEMENT_SELECTED message if key is empty', () => {
    bridge.sendToParent('ELEMENT_SELECTED', {
      key: '   ',
      fallbackValue: 'Hello',
      currentValue: 'Hello',
    });

    expect(window.parent.postMessage).not.toHaveBeenCalled();
  });

  it('should invoke callback when a valid message arrives from the parent', () => {
    const callback = vi.fn();
    const cleanup = bridge.listenToParent(callback);

    const event = new MessageEvent('message', {
      data: { source: 'livelocale-studio', type: 'APPLY_PREVIEW', payload: { value: 'Hi' } },
      origin: ALLOWED_ORIGIN,
    });
    window.dispatchEvent(event);

    expect(callback).toHaveBeenCalledWith('APPLY_PREVIEW', { value: 'Hi' });
    cleanup();
  });

  it('should drop messages from an unexpected origin', () => {
    const callback = vi.fn();
    const cleanup = bridge.listenToParent(callback);

    const event = new MessageEvent('message', {
      data: { source: 'livelocale-studio', type: 'APPLY_PREVIEW', payload: {} },
      origin: 'http://evil.example.com',
    });
    window.dispatchEvent(event);

    expect(callback).not.toHaveBeenCalled();
    cleanup();
  });

  it('should drop messages with incorrect source identifier', () => {
    const callback = vi.fn();
    const cleanup = bridge.listenToParent(callback);

    const event = new MessageEvent('message', {
      data: { source: 'not-livelocale-studio', type: 'APPLY_PREVIEW', payload: {} },
      origin: ALLOWED_ORIGIN,
    });
    window.dispatchEvent(event);

    expect(callback).not.toHaveBeenCalled();
    cleanup();
  });
});
