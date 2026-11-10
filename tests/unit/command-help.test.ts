// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { commandHelpText, helpText } from '../../src/codemod/help.js';

const COMMANDS = ['migrate', 'init', 'studio', 'doctor', 'check', 'pack', 'build', 'apply'];

describe('commandHelpText', () => {
  it.each(COMMANDS)('prints only the %s usage, options and exit codes', (command) => {
    const text = commandHelpText(command)!;
    expect(text).toContain(`Usage:\n  npx livelocale ${command} [options]`);
    expect(text).toContain(`Options for ${command}:`);
    expect(text).toContain('Exit codes:');
    for (const other of COMMANDS.filter((c) => c !== command)) {
      expect(text).not.toContain(`Options for ${other}:`);
    }
    expect(text.split('\n').length).toBeLessThan(45);
  });

  it('keeps the option lines exactly as the global help prints them', () => {
    const block = commandHelpText('check')!;
    const options = block.slice(
      block.indexOf('Options for check:'),
      block.indexOf('\n\n', block.indexOf('Options for check:'))
    );
    expect(helpText()).toContain(options);
    expect(options).toContain('--hardcoded');
  });

  it('starts with what the command does', () => {
    expect(commandHelpText('apply')!.split('\n')[1]).toBe(
      'livelocale apply: Apply a LiveLocale change link to your locale files (--pr opens a pull request)'
    );
  });

  it('returns undefined for an unknown command', () => {
    expect(commandHelpText('nope')).toBeUndefined();
  });
});
