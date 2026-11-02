// Turns the slider sample's `check --hardcoded --json` report into the strings the slider outlines.

/** What the slider outlines: untranslated Arabic keys and text written straight into JSX. */
export interface SampleFindings {
  keys: string[];
  texts: string[];
  count: number;
}

interface SampleReport {
  issues: Array<{ kind: string; key?: string; text?: string; locale?: string }>;
  setupProblems?: string[];
}

/** Picks the findings out of the report; a report with none means the sample stopped working. */
export function readFindings(report: SampleReport): SampleFindings {
  const keys = report.issues
    .filter((i) => i.kind === 'untranslated' && i.locale === 'ar' && i.key)
    .map((i) => i.key as string);
  const texts = report.issues
    .filter((i) => i.kind === 'hardcoded' && i.text)
    .map((i) => i.text as string);
  const count = keys.length + texts.length;
  if (count === 0) throw new Error('No untranslated or hardcoded text in the sample report');
  return { keys, texts, count };
}

/** The line under the slider, worded like the CLI's own failure glyph. */
export function summaryLine(f: SampleFindings): string {
  return `✖ ${f.count} strings never translated: found by check --hardcoded`;
}
