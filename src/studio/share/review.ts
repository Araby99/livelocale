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
import { englishText, type StringKey, type StudioText } from '../i18n/catalogue.js';

/** The catalogue key of each status's label. */
export const REVIEW_STATUS_KEYS: Readonly<Record<EditStatus, StringKey>> = {
  apply: 'review.status_apply',
  already: 'review.status_already',
  conflict: 'review.status_conflict',
  invalid: 'review.status_invalid',
  'needs-force': 'review.status_needs_force',
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

/** The core's own messages stay English; only the Save anyway note is translated. */
function checksFor(edit: PlannedEdit, t: StudioText): ReviewCheck[] {
  const checks: ReviewCheck[] = [];
  if (edit.status === 'invalid' && edit.message) {
    checks.push({ level: 'error', message: edit.message });
  }
  if (edit.status === 'needs-force' && edit.message) {
    checks.push({ level: 'warning', message: `${edit.message} ${t('review.saved_anyway')}` });
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
  t?: StudioText;
}): ReviewRow[] {
  const t = input.t ?? englishText;
  const { edits } = planApply({
    edits: input.set.edits,
    sourceLocale: input.sourceLocale,
    targets: input.targets,
    allowForce: input.allowForce === true,
  });
  return edits.map((edit) => ({
    ...edit,
    id: `${edit.locale}\u0000${edit.key}`,
    checks: checksFor(edit, t),
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
