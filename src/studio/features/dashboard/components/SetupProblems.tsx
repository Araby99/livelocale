import { STATIC_MANIFEST_MISSING } from '../../../config.js';
import { useStudioText } from '../../../i18n/StudioLanguage.js';

interface SetupProblemsProps {
  /** Problems reported by the server's `?action=info`, e.g. a token without write access. */
  problems: string[];
  /** The banner heading; defaults to the server-setup heading. */
  title?: string;
}

/**
 * Banner for server setup problems that would make every save fail. The Studio's own
 * missing-manifest problem shows in the Studio language; server problems stay as given.
 */
export const SetupProblems = ({ problems, title }: SetupProblemsProps) => {
  const { t } = useStudioText();
  if (problems.length === 0) return null;
  return (
    <div
      role="alert"
      data-testid="setup-problems"
      className="mx-6 mt-4 rounded-xl border border-danger-line bg-danger-bg px-4 py-3 text-xs text-danger-fg select-text"
    >
      <p className="font-semibold text-danger-fg">{title ?? t('setup.title')}</p>
      <ul className="mt-1.5 space-y-1 list-disc ps-4">
        {problems.map((problem) => (
          <li key={problem}>
            {problem === STATIC_MANIFEST_MISSING ? t('setup.manifest_missing') : problem}
          </li>
        ))}
      </ul>
    </div>
  );
};
