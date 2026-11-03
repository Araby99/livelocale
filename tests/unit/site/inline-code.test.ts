// @vitest-environment node
import { inlineCodeVPre } from '../../../site/docs/.vitepress/inline-code';

type Attrs = [string, string][];
type Token = { content: string; attrs: Attrs | null; attrSet(name: string, value: string): void };
type Rule = (tokens: Token[], idx: number, ...rest: unknown[]) => string;

/** A stand-in for markdown-it with its default code_inline rule, which renders the token's attrs. */
function fakeMd(): { renderer: { rules: { code_inline: Rule } } } {
  return {
    renderer: {
      rules: {
        code_inline: (tokens, idx) => {
          const token = tokens[idx]!;
          const attrs = (token.attrs ?? []).map(([k, v]) => ` ${k}="${v}"`).join('');
          return `<code${attrs}>${token.content}</code>`;
        },
      },
    },
  };
}

function token(content: string): Token {
  return {
    content,
    attrs: null,
    attrSet(name, value) {
      this.attrs = [...(this.attrs ?? []).filter(([k]) => k !== name), [name, value]];
    },
  };
}

it('marks inline code v-pre so Vue leaves {{...}} alone', () => {
  const md = fakeMd();
  inlineCodeVPre(md as never);
  expect(md.renderer.rules.code_inline([token('{{name}}')], 0, {}, {}, md.renderer)).toBe(
    '<code v-pre="">{{name}}</code>'
  );
});
