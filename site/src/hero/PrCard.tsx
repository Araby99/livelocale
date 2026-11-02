// The pull-request card beside the hero: one removed/added pair per edit, how many of the three
// mistakes are fixed, and Send, which shows the change link the developer would receive.
import type { Ref } from 'react';
import { wordDiff, type HeroEdit } from './model';

interface PrCardProps {
  edits: readonly HeroEdit[];
  fixed: number;
  total: number;
  onSend: () => void;
  sendRef: Ref<HTMLButtonElement>;
}

export function PrCard({ edits, fixed, total, onSend, sendRef }: PrCardProps) {
  return (
    <aside className="pr-card" data-testid="pr-card" aria-label="Your pull request">
      <p className="pr-card-title">Your pull request</p>
      {edits.length > 0 && (
        <ul className="pr-pairs">
          {edits.map((edit) => {
            const { removed, added } = wordDiff(edit.from, edit.to);
            return (
              <li key={edit.key}>
                <del>- &quot;{removed}&quot;</del>
                <ins>+ &quot;{added}&quot;</ins>
              </li>
            );
          })}
        </ul>
      )}
      <p className="pr-progress" aria-live="polite">
        {fixed} of {total} fixed
      </p>
      <button
        ref={sendRef}
        type="button"
        className="button pr-send"
        disabled={edits.length === 0}
        onClick={onSend}
      >
        Send
      </button>
    </aside>
  );
}
