import React, { type ReactNode } from 'react';
import { APP_PROBE_TIMEOUT_MS, type ConnectionDiagnosis } from '../../../../core/app-probe.js';
import { useStudioText } from '../../../i18n/StudioLanguage.js';
import type { StudioText } from '../../../i18n/catalogue.js';

/**
 * A catalogue sentence with code in it: each `{name}` placeholder of `template` becomes the
 * matching node, so commands and origins keep their own left-to-right, monospace element.
 */
export function withCode(template: string, code: Readonly<Record<string, ReactNode>>): ReactNode[] {
  return template
    .split(/\{(\w+)\}/)
    .map((part, i) =>
      i % 2 === 0 ? part : <React.Fragment key={part}>{code[part] ?? `{${part}}`}</React.Fragment>
    );
}

export const Code = ({ children }: { children: ReactNode }) => (
  <code dir="ltr" className="font-mono">
    {children}
  </code>
);

/** The hint that follows an HTTP status: where to look next. */
function statusHint(t: StudioText, status: number, kind: 'page' | 'api'): string | null {
  if (status >= 500) return t('viewer.diag_server_error');
  if (status === 404) return t(kind === 'page' ? 'viewer.diag_page_404' : 'viewer.diag_api_404');
  if (kind === 'page' && (status === 401 || status === 403)) return t('viewer.diag_page_auth');
  return null;
}

/** The finding and its hint for one diagnosis. */
function describe(
  t: StudioText,
  diagnosis: ConnectionDiagnosis,
  appUrl: string
): { finding: ReactNode[]; hint: ReactNode[] | string | null } {
  switch (diagnosis.kind) {
    case 'unreachable':
      return {
        finding: withCode(t('viewer.diag_unreachable'), {
          origin: <Code>{diagnosis.origin}</Code>,
        }),
        hint: t('viewer.diag_unreachable_hint'),
      };
    case 'timeout':
      return {
        finding: withCode(
          t('viewer.diag_timeout', { seconds: Math.round(APP_PROBE_TIMEOUT_MS / 1000) }),
          { origin: <Code>{diagnosis.origin}</Code> }
        ),
        hint: null,
      };
    case 'page-status':
      return {
        finding: withCode(t('viewer.diag_page_status'), {
          status: <strong>{diagnosis.status}</strong>,
          path: <Code>{diagnosis.path}</Code>,
        }),
        hint: statusHint(t, diagnosis.status, 'page'),
      };
    case 'api-status': {
      const hint = statusHint(t, diagnosis.status, 'api');
      return {
        finding: withCode(t('viewer.diag_api_status'), {
          api: (
            <code dir="ltr" className="font-mono">
              /api/livelocale
            </code>
          ),
          status: <strong>{diagnosis.status}</strong>,
        }),
        hint:
          hint && diagnosis.status === 404
            ? withCode(hint, {
                command: (
                  <code dir="ltr" className="font-mono">
                    npx livelocale init
                  </code>
                ),
              })
            : hint,
      };
    }
    case 'login-redirect':
      return {
        finding: withCode(t('viewer.diag_login'), { host: <Code>{diagnosis.host}</Code> }),
        hint: t('viewer.diag_login_hint'),
      };
    case 'framing':
      return {
        finding: withCode(t('viewer.diag_framing'), { header: <Code>{diagnosis.header}</Code> }),
        hint: withCode(t('viewer.diag_framing_hint'), {
          studio: <Code>{window.location.origin}</Code>,
        }),
      };
    case 'client-missing':
      return {
        finding: [t('viewer.diag_client_missing')],
        hint: withCode(t('viewer.diag_client_hint'), {
          provider: (
            <code dir="ltr" className="font-mono">
              LiveLocaleProvider
            </code>
          ),
        }),
      };
    case 'status-unknown':
      return {
        finding: withCode(t('viewer.diag_unknown'), { origin: <Code>{diagnosis.origin}</Code> }),
        hint: withCode(t('viewer.diag_unknown_hint'), { url: <Code>{appUrl}</Code> }),
      };
  }
}

interface ConnectionDiagnosisNoteProps {
  /** null while checking or when the check found nothing. */
  diagnosis: ConnectionDiagnosis | null;
  checking: boolean;
  /** The URL the preview frame is loading, for the "open it in a tab" hint. */
  appUrl: string;
  onCheckAgain: () => void;
}

/** What the app answered when the Studio cannot connect, with a Check again button. */
export const ConnectionDiagnosisNote = ({
  diagnosis,
  checking,
  appUrl,
  onCheckAgain,
}: ConnectionDiagnosisNoteProps) => {
  const { t } = useStudioText();
  if (!checking && !diagnosis) return null;
  const text = diagnosis ? describe(t, diagnosis, appUrl) : null;
  return (
    <div
      data-testid="connection-diagnosis"
      data-kind={checking ? 'checking' : diagnosis?.kind}
      aria-live="polite"
      className="mb-3 pb-3 border-b border-line"
    >
      {checking || !text ? (
        <p className="text-fg-muted">{t('viewer.diag_checking')}</p>
      ) : (
        <>
          <p className="font-semibold text-fg">{text.finding}</p>
          {text.hint && <p className="mt-1 text-fg-muted">{text.hint}</p>}
        </>
      )}
      <button
        type="button"
        data-testid="connection-check-again"
        onClick={onCheckAgain}
        disabled={checking}
        className="mt-2 px-2.5 py-1 rounded-lg border border-line-strong text-fg hover:bg-raised-hover disabled:opacity-50 disabled:cursor-not-allowed transition duration-200"
      >
        {t('viewer.check_again')}
      </button>
    </div>
  );
};
