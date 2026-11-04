// @vitest-environment node
import { it, expect } from 'vitest';
import { readablePath } from '../../src/core/page-path.js';

it('decodes percent-encoded non-ASCII characters', () =>
  expect(readablePath('/%D9%85%D8%AF%D9%88%D9%86%D8%A9/')).toBe('/مدونة/'));

it('keeps ASCII escapes encoded', () =>
  expect(readablePath('/50%25/a%20b%23c')).toBe('/50%25/a%20b%23c'));

it.each(['/%E0%A4%A/', '/%FF/'])('leaves %s, which is not valid UTF-8, as given', (path) =>
  expect(readablePath(path)).toBe(path)
);

it('decodes the query and hash too', () =>
  expect(readablePath('/caf%C3%A9?q=%C3%A9#%C3%A9')).toBe('/café?q=é#é'));
