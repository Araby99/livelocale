// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, act, cleanup, fireEvent } from '@testing-library/react';
import {
  IframeViewer,
  SLOW_CONNECTION_MS,
} from '../../src/studio/features/dashboard/components/IframeViewer.js';
import { SetupProblems } from '../../src/studio/features/dashboard/components/SetupProblems.js';
import { englishText } from '../../src/studio/i18n/catalogue.js';
import { STATIC_MANIFEST_MISSING } from '../../src/studio/config.js';
import type { PageNavigation } from '../../src/studio/features/dashboard/hooks/usePageNavigation.js';

const navigationStub = (overrides: Partial<PageNavigation> = {}): PageNavigation => ({
  path: '/',
  pendingPath: null,
  recent: [],
  sitePages: [],
  onNavigate: vi.fn(() => 'ok' as const),
  isNavigating: false,
  reload: vi.fn(),
  showLocale: vi.fn(),
  ...overrides,
});

const renderViewer = (
  connectionStatus: 'connecting' | 'connected',
  navigation: PageNavigation = navigationStub()
) =>
  render(
    <IframeViewer
      iframeRef={React.createRef<HTMLIFrameElement>()}
      appOrigin="https://preview.example.com"
      appUrl="https://preview.example.com"
      connectionStatus={connectionStatus}
      navigation={navigation}
    />
  );

describe('IframeViewer slow-connection help', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('lists the usual causes when the bridge does not answer in time', () => {
    vi.useFakeTimers();
    renderViewer('connecting');
    expect(screen.queryByTestId('slow-connection-help')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(SLOW_CONNECTION_MS);
    });
    const help = screen.getByTestId('slow-connection-help');
    expect(help.textContent).toContain('https://preview.example.com');
    expect(help.textContent).toContain('frame-ancestors');
    expect(help.textContent).toContain('npx livelocale doctor --app https://preview.example.com');
  });

  it('shows nothing once connected', () => {
    vi.useFakeTimers();
    const { rerender } = renderViewer('connecting');
    rerender(
      <IframeViewer
        iframeRef={React.createRef<HTMLIFrameElement>()}
        appOrigin="https://preview.example.com"
        appUrl="https://preview.example.com"
        connectionStatus="connected"
        navigation={navigationStub()}
      />
    );
    act(() => {
      vi.advanceTimersByTime(SLOW_CONNECTION_MS * 2);
    });
    expect(screen.queryByTestId('slow-connection-help')).toBeNull();
  });

  it('marks the connection status for tests', () => {
    renderViewer('connected');
    const status = screen.getByTestId('connection-status');
    expect(status.getAttribute('data-status')).toBe('connected');
    expect(status.textContent).toBe(englishText('viewer.status_connected'));
  });

  it('reload is disabled while navigating', () => {
    renderViewer('connected', navigationStub({ isNavigating: true }));
    const reload = screen.getByRole('button', { name: 'Reload Frame' }) as HTMLButtonElement;
    expect(reload.disabled).toBe(true);
    expect(reload.getAttribute('data-testid')).toBe('reload-frame');
  });

  it('reload calls navigation.reload', () => {
    const navigation = navigationStub();
    renderViewer('connected', navigation);
    fireEvent.click(screen.getByRole('button', { name: 'Reload Frame' }));
    expect(navigation.reload).toHaveBeenCalledTimes(1);
  });

  it('keeps the English status words', () => {
    renderViewer('connecting');
    expect(screen.getByTestId('connection-status').textContent).toBe('CONNECTING');
  });
});

describe('SetupProblems', () => {
  afterEach(cleanup);

  it('renders nothing without problems and lists each problem otherwise', () => {
    const { rerender } = render(<SetupProblems problems={[]} />);
    expect(screen.queryByTestId('setup-problems')).toBeNull();
    rerender(<SetupProblems problems={['The token cannot write.', 'No pull requests.']} />);
    const banner = screen.getByRole('alert');
    expect(banner.querySelectorAll('li')).toHaveLength(2);
    expect(banner.textContent).toContain('The token cannot write.');
  });

  it('SetupProblems uses a custom title', () => {
    const { rerender } = render(
      <SetupProblems title="This change link cannot be opened:" problems={['Damaged.']} />
    );
    expect(screen.getByRole('alert').textContent).toContain('This change link cannot be opened:');
    rerender(<SetupProblems problems={['Damaged.']} />);
    const banner = screen.getByRole('alert');
    expect(banner.textContent).toContain('Saving will fail until the server setup is fixed:');
    expect(banner.textContent).not.toContain('This change link cannot be opened:');
  });
});

describe('SetupProblems messages', () => {
  afterEach(cleanup);

  it('shows the missing-manifest problem and a server problem as given', () => {
    render(
      <SetupProblems problems={[STATIC_MANIFEST_MISSING, 'Server: locales folder missing']} />
    );
    expect(screen.getByText(englishText('setup.manifest_missing'))).toBeTruthy();
    expect(screen.getByText('Server: locales folder missing')).toBeTruthy();
  });
});
