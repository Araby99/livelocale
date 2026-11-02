import React, { useState } from 'react';
import { normalizeRepoSlug } from '../../../share/github-issue.js';

interface RepoPromptProps {
  /** Prefills the field (for example the repo inside a link); it is used only once saved. */
  initial?: string;
  onSave(slug: string): void;
}

const QUESTION = 'Which GitHub repository should get the pull request?';
const MALFORMED = 'Enter it as owner/repo, for example acme/website.';

/** Asks the developer which `owner/repo` gets the pull request; accepts a slug or a GitHub URL. */
export const RepoPrompt = ({ initial = '', onSave }: RepoPromptProps) => {
  const [value, setValue] = useState(initial);
  const [invalid, setInvalid] = useState(false);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const slug = normalizeRepoSlug(value);
    setInvalid(slug === null);
    if (slug !== null) onSave(slug);
  };

  return (
    <form onSubmit={save} className="space-y-2">
      <label className="block space-y-1">
        <span className="text-[11px] font-semibold text-fg-muted">{QUESTION}</span>
        <input
          type="text"
          dir="ltr"
          placeholder="owner/repo"
          spellCheck={false}
          autoComplete="off"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setInvalid(false);
          }}
          aria-invalid={invalid || undefined}
          className="w-full h-9 px-3 rounded-xl bg-surface border border-line text-xs font-mono text-fg focus:outline-none focus:border-focus"
        />
      </label>
      {invalid && <p className="text-[11px] text-danger-fg">{MALFORMED}</p>}
      <button
        type="submit"
        className="h-8 px-3 rounded-xl text-[11px] font-semibold border transition duration-150 text-on-accent bg-accent hover:bg-accent-hover border-accent-line"
      >
        Save
      </button>
    </form>
  );
};
