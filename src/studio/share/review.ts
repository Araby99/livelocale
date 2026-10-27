/**
 * Review rows for a change link: the shared apply planner's verdict for every
 * edit, in link order, with the checks a reviewer reads next to it.
 */

import {
  FLAG_MESSAGES,
  planApply,
  type EditStatus,
  type LocaleTarget,
  type PlannedEdit,
} from '../../core/apply-plan.js';
import type { ChangeSet } from '../../core/change-link.js';

export const REVIEW_STATUS_LABELS: Record<EditStatus, string> = {
  apply: 'Ready',
  already: 'Already applied',
  conflict: 'Changed since',
  invalid: 'Invalid',
  'needs-force': 'Saved with “Save anyway”',
};

export interface ReviewCheck {
  level: 'error' | 'warning';
  message: string;
}

export interface ReviewRow extends PlannedEdit {
  /** `locale + '\u0000' + key`. */
  id: string;
  checks: ReviewCheck[];
}

function checksFor(edit: PlannedEdit): ReviewCheck[] {
  const checks: ReviewCheck[] = [];
  if (edit.status === 'invalid' && edit.message) {
    checks.push({ level: 'error', message: edit.message });
  }
  if (edit.status === 'needs-force' && edit.message) {
    checks.push({ level: 'warning', message: `${edit.message} Saved with “Save anyway”.` });
  }
  for (const flag of edit.flags) {
    checks.push({ level: 'warning', message: FLAG_MESSAGES[flag] });
  }
  return checks;
}

/** Plans every edit of `set` against the targets and attaches its checks. */
export function buildReviewRows(input: {
  set: ChangeSet;
  sourceLocale: string;
  targets: ReadonlyMap<string, LocaleTarget>;
  allowForce?: boolean;
}): ReviewRow[] {
  const { edits } = planApply({
    edits: input.set.edits,
    sourceLocale: input.sourceLocale,
    targets: input.targets,
    allowForce: input.allowForce === true,
  });
  return edits.map((edit) => ({
    ...edit,
    id: `${edit.locale}\u0000${edit.key}`,
    checks: checksFor(edit),
  }));
}

export function reviewSummary(rows: readonly ReviewRow[]): Record<EditStatus, number> {
  const counts: Record<EditStatus, number> = {
    apply: 0,
    already: 0,
    conflict: 0,
    invalid: 0,
    'needs-force': 0,
  };
  for (const row of rows) counts[row.status] += 1;
  return counts;
}
