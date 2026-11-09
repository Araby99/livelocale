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
import type { ConnectionDiagnosis } from '../../src/core/app-probe.js';

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

describe('IframeViewer connection diagnosis', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const renderDiagnosed = (
    diagnose: () => Promise<ConnectionDiagnosis | null>,
    connectionStatus: 'connecting' | 'connected' = 'connecting'
  ) =>
    render(
      <IframeViewer
        iframeRef={React.createRef<HTMLIFrameElement>()}
        appOrigin="http://localhost:3000"
        appUrl="http://localhost:3000"
        connectionStatus={connectionStatus}
        navigation={navigationStub()}
        diagnose={diagnose}
      />
    );

  const becomeSlow = async () => {
    await act(async () => {
      vi.advanceTimersByTime(SLOW_CONNECTION_MS);
    });
  };

  it('asks the app only once the connection is slow, then says what it answered', async () => {
    vi.useFakeTimers();
    const diagnose = vi.fn(async (): Promise<ConnectionDiagnosis> => ({
      kind: 'page-status',
      status: 500,
      path: '/en',
    }));
    renderDiagnosed(diagnose);
    expect(diagnose).not.toHaveBeenCalled();
    await becomeSlow();
    expect(diagnose).toHaveBeenCalledTimes(1);
    const note = screen.getByTestId('connection-diagnosis');
    expect(note.getAttribute('data-kind')).toBe('page-status');
    expect(note.textContent).toContain('The app answered 500 at /en.');
    expect(note.textContent).toContain(englishText('viewer.diag_server_error'));
    // The usual causes stay, below the finding.
    const help = screen.getByTestId('slow-connection-help');
    expect(help.textContent).toContain(englishText('viewer.slow_title_more'));
    expect(help.textContent).toContain('frame-ancestors');
  });

  it.each<[ConnectionDiagnosis, string]>([
    [
      { kind: 'unreachable', origin: 'http://localhost:3000' },
      'Nothing is answering at http://localhost:3000.',
    ],
    [{ kind: 'api-status', status: 404 }, 'The page loaded, but /api/livelocale answered 404.'],
    [{ kind: 'framing', header: 'X-Frame-Options: DENY' }, 'it sends X-Frame-Options: DENY.'],
    [{ kind: 'login-redirect', host: 'vercel.com' }, 'The app redirects to vercel.com'],
    [{ kind: 'client-missing' }, englishText('viewer.diag_client_missing')],
    [{ kind: 'status-unknown', origin: 'http://localhost:3000' }, 'cannot read its status'],
  ])('describes %o', async (diagnosis, text) => {
    vi.useFakeTimers();
    renderDiagnosed(async () => diagnosis);
    await becomeSlow();
    expect(screen.getByTestId('connection-diagnosis').textContent).toContain(text);
  });

  it('checks again on request and shows the new answer', async () => {
    vi.useFakeTimers();
    const answers: ConnectionDiagnosis[] = [
      { kind: 'unreachable', origin: 'http://localhost:3000' },
      { kind: 'page-status', status: 502, path: '/' },
    ];
    const diagnose = vi.fn(async () => answers.shift()!);
    renderDiagnosed(diagnose);
    await becomeSlow();
    expect(screen.getByTestId('connection-diagnosis').getAttribute('data-kind')).toBe(
      'unreachable'
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('connection-check-again'));
    });
    expect(diagnose).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('connection-diagnosis').textContent).toContain(
      'The app answered 502 at /.'
    );
  });

  it('shows only the usual causes when the check finds nothing or fails', async () => {
    vi.useFakeTimers();
    renderDiagnosed(async () => {
      throw new Error('offline');
    });
    await becomeSlow();
    expect(screen.queryByTestId('connection-diagnosis')).toBeNull();
    expect(screen.getByTestId('slow-connection-help').textContent).toContain(
      englishText('viewer.slow_title')
    );
  });

  it('says it is checking while the probe runs', async () => {
    vi.useFakeTimers();
    renderDiagnosed(() => new Promise(() => {}));
    await becomeSlow();
    const note = screen.getByTestId('connection-diagnosis');
    expect(note.getAttribute('data-kind')).toBe('checking');
    expect(note.textContent).toContain(englishText('viewer.diag_checking'));
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
