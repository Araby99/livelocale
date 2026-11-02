// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as ts from 'typescript';
import { EMPTY_ALLOW, parseAllowFile } from '../../src/codemod/hardcoded/allow-list.js';
import { findHardcodedText } from '../../src/codemod/hardcoded/scan-jsx.js';

const scan = (code: string, file = 'c.tsx', allow = EMPTY_ALLOW) =>
  findHardcodedText(ts, code, file, allow).map((f) => `${f.text}@${f.line}:${f.column}`);

describe('findHardcodedText', () => {
  it('flags visible JSX text', () =>
    expect(
      scan('const A = () => (\n  <div>\n    <button>Save changes</button>\n  </div>\n);\n')
    ).toEqual(['Save changes@3:13']));

  it('flags user-facing attributes only', () =>
    expect(
      scan(
        `const A = () => <><img alt="Team photo" src="/a.png" className="hero image" /><input placeholder={'Search docs'} aria-label={\`Search\`} name="query" title={\`Hi \${n}\`} /><Field label="Email" id="email-field" /></>;`
      )
    ).toEqual(['Team photo@1:29', 'Search docs@1:100', 'Search@1:127', 'Email@1:183']));
  // A literal's column is that of its first character inside the quotes.

  it('flags string literals that are direct JSX children', () =>
    expect(
      scan(
        "const A = () => <p>{'Yes'}{ok ? 'Saved' : 'Not saved'}{err && 'Something went wrong'}{name ?? 'Guest'}{' '}</p>;"
      ).map((s) => s.split('@')[0])
    ).toEqual(['Yes', 'Saved', 'Not saved', 'Something went wrong', 'Guest']));

  it('ignores translated text, code and data', () =>
    expect(
      scan(
        [
          'const A = () => <main>',
          "  {t('home.title')}{t('Save changes')}",
          '  <Trans>Hello <b>world</b></Trans>',
          '  <code>npm install</code><pre>run it</pre>',
          '  <a href="https://x.dev" id="main-link" data-test="hero" role="link">{url}</a>',
          '  <span>42</span><span>×</span><span>&nbsp;</span><i className="icon-save" />',
          "  {format('Not a child literal')}",
          '</main>;',
        ].join('\n')
      )
    ).toEqual([]));

  it('ignores named symbol entities such as &times; and &copy;', () =>
    expect(
      scan(
        [
          'const A = () => <main>',
          '  <button aria-label="&times;">&times;</button><a>&rarr;</a>',
          '  <span>&hellip;</span><span>&mdash;</span><footer>&copy; 2024</footer>',
          '</main>;',
        ].join('\n')
      )
    ).toEqual([]));

  it('still flags copy that sits next to a named entity', () =>
    expect(scan('const A = () => <a>Next &rarr;</a>;').map((s) => s.split('@')[0])).toEqual([
      'Next &rarr;',
    ]));

  it('ignores inline code in Next.js <Script> and <Style> children', () =>
    expect(
      scan(
        [
          'const A = () => <>',
          '  <Script id="ga">{`window.dataLayer = window.dataLayer || []; function gtag(){}`}</Script>',
          '  <Script>{\'console.log("hi there")\'}</Script>',
          "  <Style>{'body { color: red }'}</Style>",
          '</>;',
        ].join('\n')
      )
    ).toEqual([]));

  it('reports multi-line text once, at its first letter', () =>
    expect(scan('const A = () => (\n  <p>\n    Welcome back,\n    friend\n  </p>\n);\n')).toEqual([
      'Welcome back, friend@3:5',
    ]));

  it('shortens long text to 60 characters', () => {
    const [finding] = findHardcodedText(
      ts,
      `const A = () => <p>${'Lorem ipsum '.repeat(10)}</p>;`,
      'c.tsx',
      EMPTY_ALLOW
    );
    expect([...finding!.text].length).toBe(60);
    expect(finding!.text.endsWith('…')).toBe(true);
  });

  it('honours ignore-next-line comments in code and in JSX', () =>
    expect(
      scan(
        [
          'const A = () => (',
          '  <div>',
          '    {/* livelocale-ignore-next-line */}',
          '    <span>Acme Inc.</span>',
          '    <span>Contact us</span>',
          '  </div>',
          ');',
          '// livelocale-ignore-next-line',
          'const B = () => <b>Brand</b>;',
          'const C = () => <b>Shown</b>;',
        ].join('\n')
      )
    ).toEqual(['Contact us@5:11', 'Shown@10:20']));

  it('honours livelocale-ignore-file only at the top of the file', () => {
    expect(
      scan(
        "'use client';\n// livelocale-ignore-file\nimport x from 'x';\nconst A = () => <p>Hello there</p>;\n"
      )
    ).toEqual([]);
    expect(
      scan("import x from 'x';\n// livelocale-ignore-file\nconst A = () => <p>Hello there</p>;\n")
    ).toEqual(['Hello there@3:20']);
  });

  it('does not count allowed words', () => {
    const allow = parseAllowFile('GitHub\n');
    expect(
      scan(
        'const A = () => <><span>GitHub</span><span>Open on GitHub</span></>;',
        'c.tsx',
        allow
      ).map((s) => s.split('@')[0])
    ).toEqual(['Open on GitHub']);
  });

  it('parses JSX in .jsx and .js files', () => {
    expect(scan('const A = () => <p>Hello there</p>;', 'a.jsx')).toEqual(['Hello there@1:20']);
    expect(scan('const A = () => <p>Hello there</p>;', 'a.js')).toEqual(['Hello there@1:20']);
  });

  // Review Focus 1
  it('reports correct positions and honours ignore comments in CRLF files with a BOM', () =>
    expect(
      scan(
        '\uFEFFconst A = () => (\r\n  <div>\r\n    <button>Save changes</button>\r\n    {/* livelocale-ignore-next-line */}\r\n    <b>Brand</b>\r\n  </div>\r\n);\r\n'
      )
    ).toEqual(['Save changes@3:13']));

  // Review Focus 2
  it('honours an ignore comment above a multi-line element', () =>
    expect(
      scan(
        [
          'const A = () => (',
          '  <div>',
          '    {/* livelocale-ignore-next-line */}',
          '    <p>',
          '      Acme Inc.',
          '    </p>',
          '    {/* livelocale-ignore-next-line */}',
          '    <img',
          '      alt="Acme logo"',
          '    />',
          '    <p>',
          '      Contact us',
          '    </p>',
          '  </div>',
          ');',
        ].join('\n')
      )
    ).toEqual(['Contact us@12:7']));

  it('does not let an ignore comment above a parent hide its children', () =>
    expect(
      scan(
        [
          'const A = () => (',
          '  // livelocale-ignore-next-line',
          '  <div>',
          '    <p>Inner text</p>',
          '  </div>',
          ');',
        ].join('\n')
      )
    ).toEqual(['Inner text@4:8']));

  it('reports templates with substitutions only when asked', () => {
    const code = 'const A = () => <p title={`${n}% of keys translated`}>{`Hi ${name}`}</p>;';
    expect(scan(code)).toEqual([]);
    expect(
      findHardcodedText(ts, code, 'c.tsx', EMPTY_ALLOW, { templates: true }).map((f) => f.text)
    ).toEqual(['% of keys translated', 'Hi']);
  });
});
