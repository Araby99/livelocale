/**
 * A small, dependency-free `.gitignore` matcher covering the patterns that
 * matter for skipping generated code during key scanning: directory rules
 * (`build/`), anchored rules (`/dist`), globs (`*.log`, `**\/tmp`,
 * `docs/**\/*.snap`) and negation (`!keep.log`). Last matching rule wins, and a
 * path whose ancestor directory is ignored is ignored too.
 */

export interface GitignoreMatcher {
  /** `relPath` is relative to the directory holding the .gitignore, using `/` separators. */
  ignores(relPath: string, isDir: boolean): boolean;
}

interface Rule {
  regex: RegExp;
  negated: boolean;
  dirOnly: boolean;
}

function globToRegexSource(pattern: string): string {
  let out = '';
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i]!;
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        // `**/` → any number of directories (including none); `**` elsewhere → anything
        if (pattern[i + 2] === '/') {
          out += '(?:.*/)?';
          i += 3;
        } else {
          out += '.*';
          i += 2;
        }
      } else {
        out += '[^/]*';
        i += 1;
      }
    } else if (ch === '?') {
      out += '[^/]';
      i += 1;
    } else {
      out += /[.+^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
      i += 1;
    }
  }
  return out;
}

function compileRule(rawLine: string): Rule | null {
  let line = rawLine.replace(/\r$/, '');
  if (!line.trim() || line.trimStart().startsWith('#')) return null;
  // Trailing spaces are ignored unless escaped
  line = line.replace(/(?<!\\)\s+$/, '');

  let negated = false;
  if (line.startsWith('!')) {
    negated = true;
    line = line.slice(1);
  }

  let dirOnly = false;
  if (line.endsWith('/')) {
    dirOnly = true;
    line = line.slice(0, -1);
  }

  let anchored = false;
  if (line.startsWith('/')) {
    anchored = true;
    line = line.slice(1);
  } else if (line.includes('/')) {
    anchored = true;
  }

  if (!line) return null;

  const body = globToRegexSource(line);
  const regex = anchored ? new RegExp(`^${body}$`) : new RegExp(`(?:^|/)${body}$`);
  return { regex, negated, dirOnly };
}

export function parseGitignore(content: string): GitignoreMatcher {
  const rules: Rule[] = [];
  for (const line of content.split('\n')) {
    const rule = compileRule(line);
    if (rule) rules.push(rule);
  }

  const matchOne = (relPath: string, isDir: boolean): boolean => {
    let ignored = false;
    for (const rule of rules) {
      if (rule.dirOnly && !isDir) continue;
      if (rule.regex.test(relPath)) ignored = !rule.negated;
    }
    return ignored;
  };

  return {
    ignores(relPath: string, isDir: boolean): boolean {
      if (rules.length === 0) return false;
      const normalized = relPath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
      if (!normalized) return false;
      if (matchOne(normalized, isDir)) return true;

      // An ignored ancestor directory ignores everything beneath it.
      const segments = normalized.split('/');
      for (let i = 1; i < segments.length; i++) {
        if (matchOne(segments.slice(0, i).join('/'), true)) return true;
      }
      return false;
    },
  };
}
