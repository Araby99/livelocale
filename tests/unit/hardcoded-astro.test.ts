// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { EMPTY_ALLOW, parseAllowFile } from '../../src/codemod/hardcoded/allow-list.js';
import { findAstroHardcodedText } from '../../src/codemod/hardcoded/scan-astro.js';

const scan = (code: string, allow = EMPTY_ALLOW) =>
  findAstroHardcodedText(code, allow).map((f) => `${f.text}@${f.line}:${f.column}`);

const FRONTMATTER = [
  '---',
  "import Layout from '../layouts/Layout.astro';",
  "const t = createTranslations('en');",
  "const note = 'Not on the page by itself';",
  '---',
];

describe('findAstroHardcodedText', () => {
  it('flags template text and skips the frontmatter', () =>
    expect(
      scan([...FRONTMATTER, '<Layout>', '  <h1>Welcome home</h1>', '</Layout>'].join('\n'))
    ).toEqual(['Welcome home@7:7']));

  it('flags user-facing attributes only', () =>
    expect(
      scan(
        '<img alt="Team photo" src="/a.png" class="hero image" />\n' +
          "<input placeholder='Search docs' name=\"query\" aria-label={'Search'} title={label} />"
      )
    ).toEqual(['Team photo@1:11', 'Search docs@2:21', 'Search@2:60']));

  it('flags a string literal that is a whole expression child', () =>
    expect(scan('<p>{"Saved"}{t.home.title}{\'Not saved\'}</p>')).toEqual([
      'Saved@1:6',
      'Not saved@1:29',
    ]));

  it('ignores translated text, code, scripts, styles and comments', () =>
    expect(
      scan(
        [
          '<!doctype html>',
          '<main>',
          '  <h1>{t.home.title}</h1>',
          '  <code>npm install</code><pre>run it\nnow</pre>',
          '  <!-- A note for developers -->',
          '  <script>const label = "Click me"; if (a < b) {}</script>',
          '  <style>.hero::after { content: "Read more"; }</style>',
          '  <span>42</span><span>&times;</span><span>&nbsp;</span>',
          '  <a href="https://x.dev" class="nav-link">{url}</a>',
          '</main>',
        ].join('\n')
      )
    ).toEqual([]));

  it('does not report text inside JSX nested in an expression, even with quotes', () =>
    expect(
      scan("<ul>{items.map((item) => <li>Don't {item.name}</li>)}</ul>\n<p>After the list</p>")
    ).toEqual(['After the list@2:4']));

  it('reads attribute values with > and braces in them', () =>
    expect(
      scan('<a data-x="a > b" onclick={() => { go(); }} title="Go home">Home page</a>')
    ).toEqual(['Go home@1:52', 'Home page@1:61']));

  it('keeps void elements out of the element stack', () =>
    expect(scan('<p>First line<br>Second line</p>\n<meta charset="utf-8">')).toEqual([
      'First line@1:4',
      'Second line@1:18',
    ]));

  it('honours livelocale-ignore-next-line above the text or its element', () =>
    expect(
      scan(
        [
          '<!-- livelocale-ignore-next-line -->',
          '<p>Brand slogan</p>',
          '{/* livelocale-ignore-next-line */}',
          '<p>',
          '  Another slogan',
          '</p>',
          '<p>Reported</p>',
        ].join('\n')
      )
    ).toEqual(['Reported@7:4']));

  it('skips the whole file with livelocale-ignore-file in the frontmatter', () =>
    expect(
      scan(['---', '// livelocale-ignore-file', '---', '<p>Demo copy</p>'].join('\n'))
    ).toEqual([]));

  it('applies the allow list', () =>
    expect(scan('<b>GitHub</b><b>Contact us</b>', parseAllowFile('GitHub\n'))).toEqual([
      'Contact us@1:17',
    ]));

  it('counts columns after a byte-order mark as the editor does', () =>
    expect(scan('\uFEFF<p>Hello there</p>')).toEqual(['Hello there@1:4']));

  it('treats a lone < in text as text', () =>
    expect(scan('<p>Pay less < 5 dollars</p>')).toEqual(['Pay less < 5 dollars@1:4']));
});
