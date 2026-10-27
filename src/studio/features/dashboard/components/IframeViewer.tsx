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
    <div className="flex-1 flex flex-col h-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl relative">
      {/* Top bar */}
      <div className="h-14 bg-slate-950 border-b border-slate-800 flex items-center justify-between px-6 select-none shrink-0">
        <div className="flex items-center gap-3 w-1/3">
          {/* Decorative Window Controls */}
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-rose-500/80"></span>
            <span className="w-3 h-3 rounded-full bg-amber-500/80"></span>
            <span className="w-3 h-3 rounded-full bg-emerald-500/80"></span>
          </div>
        </div>

        {/* Connection status and actions */}
        <div className="flex items-center gap-4 w-1/3 justify-end">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
              Status
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                connectionStatus === 'connected'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : connectionStatus === 'connecting'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse'
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
              }`}
            >
              {connectionStatus === 'connected' ? 'ACTIVE' : 'CONNECTING'}
            </span>
          </div>

          <button
            onClick={reloadIframe}
            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg transition duration-200 border border-transparent hover:border-slate-700"
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
      <div className="flex-1 bg-slate-900 relative">
        <iframe
          id="app-preview-iframe"
          ref={iframeRef}
          src={`${appUrl}?livelocale-origin=${encodeURIComponent(window.location.origin)}`}
          className="w-full h-full border-none bg-white"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
        />

        {connectionStatus === 'connecting' && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4 transition duration-300">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20"></div>
              <div className="absolute inset-0 rounded-full border-2 border-t-indigo-500 animate-spin"></div>
            </div>
            <div className="text-center">
              <h3 className="text-slate-200 font-semibold tracking-wide font-outfit">
                Connecting to Project
              </h3>
              <p className="text-xs text-slate-500 mt-1 font-mono">
                Waiting for client bridge initialization...
              </p>
            </div>
            {isSlow && (
              <div
                role="status"
                data-testid="slow-connection-help"
                className="max-w-md mx-6 mt-2 rounded-xl border border-slate-800 bg-slate-900/90 p-4 text-left text-xs text-slate-300"
              >
                <p className="font-semibold text-slate-100">Still connecting? Usual causes:</p>
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
                <p className="mt-3 text-slate-400">
                  Run{' '}
                  <span className="font-mono text-slate-200 select-all">
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
