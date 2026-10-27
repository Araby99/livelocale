// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import {
  IframeViewer,
  SLOW_CONNECTION_MS,
} from '../../src/studio/features/dashboard/components/IframeViewer.js';
import { SetupProblems } from '../../src/studio/features/dashboard/components/SetupProblems.js';

const renderViewer = (connectionStatus: 'connecting' | 'connected') =>
  render(
    <IframeViewer
      iframeRef={React.createRef<HTMLIFrameElement>()}
      appOrigin="https://preview.example.com"
      appUrl="https://preview.example.com"
      connectionStatus={connectionStatus}
      currentPath="/"
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
        currentPath="/"
      />
    );
    act(() => {
      vi.advanceTimersByTime(SLOW_CONNECTION_MS * 2);
    });
    expect(screen.queryByTestId('slow-connection-help')).toBeNull();
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
