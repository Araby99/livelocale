// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { pluralExamples } from '../../src/studio/features/dashboard/plural-examples.js';
import { PluralEditor } from '../../src/studio/features/dashboard/components/PluralEditor.jsx';

afterEach(cleanup);

describe('pluralExamples', () => {
  it('shows an Arabic translator which numbers each form is for', () => {
    expect(pluralExamples('ar', 'plural')).toEqual({
      zero: '0',
      one: '1',
      two: '2',
      few: '3–10, 103–110, 203–210, …',
      many: '11–99, 111–199, 211–299, …',
      other: '100–102, 200–202, 300–302, …, 1.5',
    });
  });

  it('runs an open-ended range out with an ellipsis', () => {
    expect(pluralExamples('en', 'plural')).toEqual({ one: '1', other: '0, 2, 3, 4, …, 1.5' });
  });

  it('uses the ordinal rules for selectordinal', () => {
    expect(pluralExamples('en', 'selectordinal').two).toBe('2, 22, 32, …');
  });

  it('gives no examples for select, which is not about numbers', () => {
    expect(pluralExamples('ar', 'select')).toEqual({});
  });

  it('gives no examples for a locale the browser cannot read', () => {
    expect(pluralExamples('not a locale!', 'plural')).toEqual({});
  });
});

describe('PluralEditor hints', () => {
  it('puts the numbers for the edited language next to each form', () => {
    render(
      <PluralEditor
        locale="ar"
        value="{count, plural, one {# كتاب} other {# كتب}}"
        onChange={vi.fn()}
      />
    );
    const few = screen.getByTestId('plural-hint-few');
    expect(few.textContent).toBe('for 3–10, 103–110, 203–210, …');
    expect(screen.getByTestId('plural-hint-other').textContent).toBe(
      'for 100–102, 200–202, 300–302, …, 1.5'
    );
    expect(document.body.textContent).not.toMatch(/small numbers|large numbers|default, required/);
  });
});
