import React, { useEffect, useState, type ReactNode } from 'react';
import { ConnectionStatus } from '../types/index.js';
import { useStudioText } from '../../../i18n/StudioLanguage.js';
import type { PageNavigation } from '../hooks/usePageNavigation.js';
import { AddressBar } from './AddressBar.js';

/** How long the Studio waits for the app's bridge before suggesting causes. */
export const SLOW_CONNECTION_MS = 8000;

/**
 * A catalogue sentence with code in it: each `{name}` placeholder of `template` becomes the
 * matching node, so commands and origins keep their own left-to-right, monospace element.
 */
function withCode(template: string, code: Readonly<Record<string, ReactNode>>): ReactNode[] {
  return template
    .split(/\{(\w+)\}/)
    .map((part, i) =>
      i % 2 === 0 ? part : <React.Fragment key={part}>{code[part] ?? `{${part}}`}</React.Fragment>
    );
}

interface IframeViewerProps {
  iframeRef: React.RefObject<HTMLIFrameElement>;
  appOrigin: string;
  /** The URL the preview loads: the app origin, or the folder above a static Studio. */
  appUrl: string;
  connectionStatus: ConnectionStatus;
  /** The address field and Reload, wired to the preview by usePageNavigation. */
  navigation: PageNavigation;
  /** Shows the address and status bar above the frame; the phone moves it into its menu. */
  toolbar?: boolean;
}

export const IframeViewer = ({
  iframeRef,
  appOrigin,
  appUrl,
  connectionStatus,
  navigation,
  toolbar = true,
}: IframeViewerProps) => {
  const { t } = useStudioText();
  // The browser never tells the parent page why a frame stayed blank (a CSP
  // frame-ancestors block only reaches the console), so after a while list the usual causes.
  const [isSlow, setIsSlow] = useState(false);
  useEffect(() => {
    setIsSlow(false);
    if (connectionStatus !== 'connecting') return;
    const timer = setTimeout(() => setIsSlow(true), SLOW_CONNECTION_MS);
    return () => clearTimeout(timer);
  }, [connectionStatus]);

  return (
    <div
      className={`flex-1 flex flex-col h-full bg-raised overflow-hidden relative ${
        toolbar ? 'border border-line rounded-2xl' : ''
      }`}
    >
      {/* Top bar */}
      {toolbar && (
        <div className="h-14 bg-surface border-b border-line flex items-center justify-between gap-4 px-6 shrink-0">
          {/* The address field takes the room left by the status group (flex-1 min-w-0). */}
          <AddressBar
            path={navigation.path}
            pendingPath={navigation.pendingPath}
            recent={navigation.recent}
            sitePages={navigation.sitePages}
            onNavigate={navigation.onNavigate}
          />

          {/* Connection status and actions */}
          <div className="flex items-center gap-4 justify-end shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold tracking-wider text-fg-muted uppercase">
                {t('viewer.status')}
              </span>
              <span
                data-testid="connection-status"
                data-status={connectionStatus}
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  connectionStatus === 'connected'
                    ? 'glyph-done bg-success-bg text-success-fg border border-success-line'
                    : connectionStatus === 'connecting'
                      ? 'glyph-warn bg-warning-bg text-warning-fg border border-warning-line animate-pulse'
                      : 'bg-danger-bg text-danger-fg border border-dashed border-danger-line'
                }`}
              >
                {connectionStatus === 'connected'
                  ? t('viewer.status_connected')
                  : t('viewer.status_connecting')}
              </span>
            </div>

            <button
              type="button"
              data-testid="reload-frame"
              onClick={navigation.reload}
              disabled={navigation.isNavigating}
              className="p-1.5 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-raised-hover text-fg-muted hover:text-fg rounded-lg transition duration-200 border border-transparent hover:border-line-strong"
              aria-label={t('viewer.reload')}
              title={t('viewer.reload')}
            >
              <svg
                aria-hidden="true"
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                viewBox="0 0 24 24"
              >
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Frame Container */}
      <div className="flex-1 bg-raised relative">
        <iframe
          id="app-preview-iframe"
          ref={iframeRef}
          src={`${appUrl}?livelocale-origin=${encodeURIComponent(window.location.origin)}`}
          className="w-full h-full border-none bg-white"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
        />

        {connectionStatus === 'connecting' && (
          <div className="absolute inset-0 bg-surface flex flex-col items-center justify-center gap-4 transition duration-300">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 rounded-full border-2 border-accent-line"></div>
              <div className="absolute inset-0 rounded-full border-2 border-t-accent animate-spin"></div>
            </div>
            <div className="text-center">
              <h3 className="text-fg font-semibold tracking-wide font-heading">
                {t('viewer.connecting_title')}
              </h3>
              <p className="text-xs text-fg-muted mt-1 font-mono">{t('viewer.connecting_body')}</p>
            </div>
            {isSlow && (
              <div
                role="status"
                data-testid="slow-connection-help"
                className="max-w-md mx-6 mt-2 rounded-xl border border-line bg-raised p-4 text-start text-xs text-fg"
              >
                <p className="font-semibold text-fg">{t('viewer.slow_title')}</p>
                <ul className="mt-2 space-y-1.5 list-disc ps-4">
                  <li>
                    {withCode(t('viewer.cause_not_running'), {
                      origin: (
                        <code dir="ltr" className="font-mono">
                          {appOrigin}
                        </code>
                      ),
                    })}
                  </li>
                  <li>
                    {withCode(t('viewer.cause_framing'), {
                      csp: (
                        <code dir="ltr" className="font-mono">
                          frame-ancestors
                        </code>
                      ),
                      xfo: (
                        <code dir="ltr" className="font-mono">
                          X-Frame-Options
                        </code>
                      ),
                      studio: (
                        <code dir="ltr" className="font-mono">
                          {window.location.origin}
                        </code>
                      ),
                    })}
                  </li>
                  <li>
                    {withCode(t('viewer.cause_provider'), {
                      provider: (
                        <code dir="ltr" className="font-mono">
                          LiveLocaleProvider
                        </code>
                      ),
                      env: (
                        <code dir="ltr" className="font-mono">
                          NEXT_PUBLIC_LIVELOCALE=preview
                        </code>
                      ),
                    })}
                  </li>
                </ul>
                <p className="mt-3 text-fg-muted">
                  {withCode(t('viewer.run_doctor'), {
                    command: (
                      <code dir="ltr" className="font-mono text-fg select-all">
                        npx livelocale doctor --app {appOrigin}
                      </code>
                    ),
                  })}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
