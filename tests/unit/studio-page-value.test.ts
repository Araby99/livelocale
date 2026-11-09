import { describe, it, expect } from 'vitest';
import { editorValueFor } from '../../src/studio/features/dashboard/page-value.js';

describe('editorValueFor', () => {
  it('keeps the stored value of the edited locale', () => {
    expect(editorValueFor('Hola', 'Hello', ['Hello'])).toBe('Hola');
  });

  it('uses a reference value with markup when it shows the page text', () => {
    expect(editorValueFor(undefined, 'Fast and safe', ['Fast <strong>and</strong> safe'])).toBe(
      'Fast <strong>and</strong> safe'
    );
  });

  it('removes tags until none are left, so a nested tag does not leave one behind', () => {
    // One pass over `<scr<b>ipt>` would leave `<script>`, and the text would not match.
    expect(editorValueFor(undefined, 'Go', ['Go<scr<b>ipt>'])).toBe('Go<scr<b>ipt>');
  });

  it('falls back to the page text when no value shows it', () => {
    expect(editorValueFor(undefined, 'Hello', ['Bye', undefined])).toBe('Hello');
  });
});
