import React, { useEffect, useState } from 'react';
import { ConnectionStatus } from '../types/index.js';

/** How long the Studio waits for the app's bridge before suggesting causes. */
export const SLOW_CONNECTION_MS = 8000;

interface IframeViewerProps {
  iframeRef: React.RefObject<HTMLIFrameElement>;
  appOrigin: string;
  /** The URL the preview loads: the app origin, or the folder above a static Studio. */
  appUrl: string;
  connectionStatus: ConnectionStatus;
  currentPath: string;
}

export const IframeViewer = ({
  iframeRef,
  appOrigin,
  appUrl,
  connectionStatus,
}: IframeViewerProps) => {
  // The browser never tells the parent page why a frame stayed blank (a CSP
  // frame-ancestors block only reaches the console), so after a while list the usual causes.
  const [isSlow, setIsSlow] = useState(false);
  useEffect(() => {
    setIsSlow(false);
    if (connectionStatus !== 'connecting') return;
    const timer = setTimeout(() => setIsSlow(true), SLOW_CONNECTION_MS);
    return () => clearTimeout(timer);
  }, [connectionStatus]);

  const reloadIframe = () => {
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-raised border border-line rounded-2xl overflow-hidden shadow-2xl relative">
      {/* Top bar */}
      <div className="h-14 bg-surface border-b border-line flex items-center justify-between px-6 select-none shrink-0">
        <div className="flex items-center gap-3 w-1/3">
          {/* Decorative Window Controls */}
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-danger-fg"></span>
            <span className="w-3 h-3 rounded-full bg-warning-fg"></span>
            <span className="w-3 h-3 rounded-full bg-success-fg"></span>
          </div>
        </div>

        {/* Connection status and actions */}
        <div className="flex items-center gap-4 w-1/3 justify-end">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold tracking-wider text-fg-muted uppercase">
              Status
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                connectionStatus === 'connected'
                  ? 'bg-success-bg text-success-fg border border-success-line'
                  : connectionStatus === 'connecting'
                    ? 'bg-warning-bg text-warning-fg border border-warning-line animate-pulse'
                    : 'bg-danger-bg text-danger-fg border border-danger-line'
              }`}
            >
              {connectionStatus === 'connected' ? 'ACTIVE' : 'CONNECTING'}
            </span>
          </div>

          <button
            onClick={reloadIframe}
            className="p-1.5 hover:bg-raised-hover text-fg-muted hover:text-fg rounded-lg transition duration-200 border border-transparent hover:border-line-strong"
            title="Reload Frame"
          >
            <svg
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
          <div className="absolute inset-0 bg-surface backdrop-blur-sm flex flex-col items-center justify-center gap-4 transition duration-300">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 rounded-full border-2 border-accent-line"></div>
              <div className="absolute inset-0 rounded-full border-2 border-t-accent animate-spin"></div>
            </div>
            <div className="text-center">
              <h3 className="text-fg font-semibold tracking-wide font-heading">
                Connecting to Project
              </h3>
              <p className="text-xs text-fg-muted mt-1 font-mono">
                Waiting for client bridge initialization...
              </p>
            </div>
            {isSlow && (
              <div
                role="status"
                data-testid="slow-connection-help"
                className="max-w-md mx-6 mt-2 rounded-xl border border-line bg-raised p-4 text-left text-xs text-fg"
              >
                <p className="font-semibold text-fg">Still connecting? Usual causes:</p>
                <ul className="mt-2 space-y-1.5 list-disc pl-4">
                  <li>
                    The app is not running at <span className="font-mono">{appOrigin}</span>.
                  </li>
                  <li>
                    The app blocks framing: its <span className="font-mono">frame-ancestors</span>{' '}
                    or <span className="font-mono">X-Frame-Options</span> header must allow{' '}
                    <span className="font-mono">{window.location.origin}</span>.
                  </li>
                  <li>
                    <span className="font-mono">LiveLocaleProvider</span> is not mounted, or
                    LiveLocale is off in the app (preview builds need{' '}
                    <span className="font-mono">NEXT_PUBLIC_LIVELOCALE=preview</span>).
                  </li>
                </ul>
                <p className="mt-3 text-fg-muted">
                  Run{' '}
                  <span className="font-mono text-fg select-all">
                    npx livelocale doctor --app {appOrigin}
                  </span>{' '}
                  to check.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
