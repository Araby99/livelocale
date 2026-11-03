import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

const SERIOUS = new Set(['serious', 'critical']);

/** Serious and critical WCAG 2.1 A/AA violations on the page (the app preview iframe excluded),
 *  one `<rule>: <selector>` entry per failing node, sorted. Finite CSS transitions and animations
 *  finish first, so colours are measured as they settle, not halfway through a fade. */
export async function seriousViolations(page: Page): Promise<string[]> {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
        .map((a) => a.finished.catch(() => undefined))
    )
  );
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('#app-preview-iframe')
    .analyze();
  return results.violations
    .filter((v) => SERIOUS.has(v.impact ?? ''))
    .flatMap((v) => v.nodes.map((node) => `${v.id}: ${node.target.join(' ')}`))
    .sort();
}
