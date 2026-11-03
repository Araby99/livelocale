// Reads `livelocale --help` into commands and their flags, so a test can hold the CLI reference
// pages to what the CLI really prints.

const FLAG = /^ {2}(--[a-z][\w-]*)/;

/**
 * Command name → its flags in help order. Commands come from the `Commands:` list, in that order;
 * flags from that command's `Options for <command>:` block (the first token of each line that
 * starts with a long flag). Synopsis lines (`  pack <outDir>`), indented continuation lines and
 * the `Global Options` block are not flags of any command.
 */
export function parseHelp(text) {
  /** @type {Record<string, string[]>} */
  const commands = {};
  /** @type {string[] | null} */
  let block = null;
  let inCommands = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\S/.test(line)) {
      inCommands = line === 'Commands:';
      const options = /^Options for (\S+):$/.exec(line);
      block = options ? (commands[options[1]] ?? null) : null;
      continue;
    }
    if (inCommands) {
      const command = /^ {2}([a-z][\w-]*)\s/.exec(line);
      if (command) commands[command[1]] = [];
      continue;
    }
    const flag = block && FLAG.exec(line);
    if (flag && !block.includes(flag[1])) block.push(flag[1]);
  }
  return commands;
}
