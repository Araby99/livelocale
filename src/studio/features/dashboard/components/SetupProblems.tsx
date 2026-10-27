interface SetupProblemsProps {
  /** Problems reported by the server's `?action=info`, e.g. a token without write access. */
  problems: string[];
  /** The banner heading; defaults to the server-setup heading. */
  title?: string;
}

const DEFAULT_TITLE = 'Saving will fail until the server setup is fixed:';

/** Banner for server setup problems that would make every save fail. */
export const SetupProblems = ({ problems, title = DEFAULT_TITLE }: SetupProblemsProps) => {
  if (problems.length === 0) return null;
  return (
    <div
      role="alert"
      data-testid="setup-problems"
      className="mx-6 mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-200 select-text"
    >
      <p className="font-semibold text-rose-100">{title}</p>
      <ul className="mt-1.5 space-y-1 list-disc pl-4">
        {problems.map((problem) => (
          <li key={problem}>{problem}</li>
        ))}
      </ul>
    </div>
  );
};
