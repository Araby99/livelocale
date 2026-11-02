import type { SampleFindings } from '../src/slider/report';

export function injectSliderFallback(
  html: string,
  data: { findings: SampleFindings; output: string }
): string;
