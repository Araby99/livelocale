// @vitest-environment node
import { injectSliderFallback } from '../../../site/scripts/slider-fallback.mjs';
const html =
  '<div data-island="slider"><div data-lang="ar"><p data-key="plans.upgrade">Upgrade anytime.</p>' +
  '<p data-key="plans.start">ابدأ مجانًا.</p><button>Start free trial</button></div><!-- slider:check-output --></div>';
const data = {
  findings: { keys: ['plans.upgrade'], texts: ['Start free trial'], count: 2 },
  output: 'App.tsx <b>\n  Start free trial',
};

it('outlines the reported strings and writes the real check output', () => {
  const out = injectSliderFallback(html, data);
  expect(out.match(/class="is-untranslated"/g)).toHaveLength(2);
  expect(out).not.toMatch(/data-key="plans\.start" class="is-untranslated"/);
  expect(out).toContain('✖ 2 strings never translated: found by check --hardcoded');
  expect(out).toContain('<pre>App.tsx &lt;b&gt;\n  Start free trial</pre>');
});
it('fails the build when the marker is missing', () =>
  expect(() => injectSliderFallback('<div></div>', data)).toThrow(
    'slider fallback marker missing'
  ));
