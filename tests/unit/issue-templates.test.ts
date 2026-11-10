// @vitest-environment node
import fs from 'node:fs';
import { expect, it } from 'vitest';

const DIR = '.github/ISSUE_TEMPLATE';

it('offers a place to ask a question, not only bugs and feature requests', () => {
  // Blank issues are off, so without this template a question had to pose as a bug.
  expect(fs.readFileSync(`${DIR}/config.yml`, 'utf8')).toContain('blank_issues_enabled: false');
  const question = fs.readFileSync(`${DIR}/question.yml`, 'utf8');
  expect(question).toMatch(/^name: Question$/m);
  expect(question).toMatch(/^labels: \[question\]$/m);
  expect(question).toMatch(/^ {6}required: true$/m);
});

it('states in CONTRIBUTING.md what is planned and what is not, without dates', () => {
  const md = fs.readFileSync('CONTRIBUTING.md', 'utf8');
  const roadmap = md.split(/^## Roadmap\r?$/m)[1]?.split(/^## /m)[0] ?? '';
  expect(roadmap, 'no Roadmap section').not.toBe('');
  expect(roadmap).toMatch(/not planned/i);
  expect(roadmap).toContain('issues/new?template=question.yml');
  expect(roadmap).toContain('label%3Aenhancement');
  expect(roadmap).not.toMatch(/\b20\d\d\b|\bQ[1-4]\b/);
});
