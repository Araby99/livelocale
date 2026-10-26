/**
 * The apply planner shared by the Studio's Review mode and `livelocale apply`.
 *
 * It decides, for every edit of a change link, what applying it to the
 * target's locale files would do. Every edit is re-validated against the
 * target's own source locale, and a per-key 3-way check compares the link's
 * `from` with the current value. Nothing is written here and nothing is
 * normalized: text is compared by exact code units.
 */

import { containsWatermark } from '../client/watermark.js';
import type { ChangeEdit } from './change-link.js';
import { lookupKey } from './json-path.js';
import {
  detectRiskFlags,
  RISK_FLAG_MESSAGES,
  sourceReference,
  validateEdit,
  type ContentRiskFlag,
  type SourceContext,
  type WriteRuleCode,
} from './save-rules.js';

export type EditStatus = 'apply' | 'already' | 'conflict' | 'invalid' | 'needs-force';

export type RiskFlag = ContentRiskFlag | 'new-key' | 'forced';

/** The one copy for every flag, shared by Review rows and the PR/issue tables. */
export const FLAG_MESSAGES: Record<RiskFlag, string> = {
  ...RISK_FLAG_MESSAGES,
  forced: 'Saved with “Save anyway”.',
  'new-key': 'Adds a key the source locale does not have.',
};

export type PlanCode =
  | WriteRuleCode
  | 'UNKNOWN_LOCALE'
  | 'UNKNOWN_NAMESPACE'
  | 'CONTAINS_WATERMARK'
  | 'CHANGED_ON_TARGET'
  | 'REMOVED_ON_TARGET';

export interface PlannedEdit extends ChangeEdit {
  status: EditStatus;
  code?: PlanCode;
  message?: string;
  current?: string;
  flags: RiskFlag[];
}

export interface ApplyPlan {
  edits: PlannedEdit[];
  counts: Record<EditStatus, number>;
}

/** One locale's file on the target; null when that locale has no file. */
export type LocaleTarget = {
  layout: 'flat' | 'namespaced';
  dict: Record<string, unknown>;
} | null;

export interface PlanInput {
  edits: readonly ChangeEdit[];
  sourceLocale: string;
  targets: ReadonlyMap<string, LocaleTarget>;
  /** A maintainer allowed force: `--force` locally, `/livelocale apply --force` on GitHub. */
  allowForce: boolean;
}

type Outcome = Pick<PlannedEdit, 'status' | 'code' | 'message' | 'current'>;

/** True when the key's first segment is already a namespace object in `dict`. */
function inExistingNamespace(dict: Record<string, unknown>, key: string): boolean {
  const dot = key.indexOf('.');
  if (dot === -1) return false;

  const namespace = key.slice(0, dot);
  if (!Object.prototype.hasOwnProperty.call(dict, namespace)) return false;

  const value = dict[namespace];
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function planEdit(
  edit: ChangeEdit,
  input: PlanInput,
  source: Record<string, unknown>
): PlannedEdit {
  const { locale, key, from, to, force } = edit;
  const base = { locale, key, from, to, force };
  const invalid = (code: PlanCode, message: string): PlannedEdit => ({
    ...base,
    status: 'invalid',
    code,
    message,
    flags: [],
  });

  // 1. Locale.
  const target = input.targets.get(locale);
  if (!target) return invalid('UNKNOWN_LOCALE', `No "${locale}" locale file on the target.`);

  // 2. Namespace.
  if (target.layout === 'namespaced' && !inExistingNamespace(target.dict, key)) {
    return invalid(
      'UNKNOWN_NAMESPACE',
      `"${key}" is not in an existing namespace file of ${locale}.`
    );
  }

  // 3. Watermark.
  if (containsWatermark(to)) {
    return invalid('CONTAINS_WATERMARK', 'The new text contains LiveLocale watermark characters.');
  }

  const ctx: SourceContext = { sourceLocale: input.sourceLocale, source, target: target.dict };
  const reference = sourceReference(key, ctx);
  const flags: RiskFlag[] = [];
  // 7. Risk flags, for every edit that is not invalid.
  const planned = (outcome: Outcome): PlannedEdit => ({
    ...base,
    ...outcome,
    flags: [...flags, ...detectRiskFlags(reference ?? from ?? undefined, to)],
  });

  // 4. Already done.
  const found = lookupKey(target.dict, key);
  if (found.state === 'string' && found.value === to) {
    return planned({ status: 'already', current: found.value });
  }

  // 5. Validation. The client's force only counts when a maintainer allows it,
  // and it never overrides a 400 or 409.
  const verdict = validateEdit({ locale, key, value: to }, ctx, { force: false });
  if (!verdict.ok) {
    if (verdict.status !== 422 || !force) return invalid(verdict.code, verdict.error);
    if (!input.allowForce) {
      return planned({ status: 'needs-force', code: verdict.code, message: verdict.error });
    }
    flags.push('forced');
  }

  // 6. Three-way check. validateEdit refused an occupied key, so the key is
  // either missing or holds a string here.
  const current = found.state === 'string' ? found.value : undefined;
  if (current === undefined) {
    if (from !== null) {
      return planned({
        status: 'conflict',
        code: 'REMOVED_ON_TARGET',
        message: 'Removed on the target since the link was made.',
      });
    }
    if (reference === null) flags.push('new-key');
    return planned({ status: 'apply' });
  }
  if (current === from) return planned({ status: 'apply' });
  return planned({
    status: 'conflict',
    code: 'CHANGED_ON_TARGET',
    message: 'Changed on the target since the link was made.',
    current,
  });
}

/**
 * Plans every edit against the target's locale files, in order: locale,
 * namespace, watermark, already done, validation, 3-way check, risk flags.
 * Throws Error(`Source locale "${s}" has no locale file on the target.`) when
 * targets.get(sourceLocale) is missing or null.
 */
export function planApply(input: PlanInput): ApplyPlan {
  const source = input.targets.get(input.sourceLocale);
  if (!source) {
    throw new Error(`Source locale "${input.sourceLocale}" has no locale file on the target.`);
  }

  const edits = input.edits.map((edit) => planEdit(edit, input, source.dict));
  const counts: Record<EditStatus, number> = {
    apply: 0,
    already: 0,
    conflict: 0,
    invalid: 0,
    'needs-force': 0,
  };
  for (const edit of edits) counts[edit.status] += 1;

  return { edits, counts };
}
