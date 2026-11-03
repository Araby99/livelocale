// Inline code: VitePress compiles each page as a Vue template and marks only fenced blocks v-pre,
// so an inline `{{name}}` (i18next's placeholder syntax, or a release note in CHANGELOG.md) would
// be read as an interpolation and render empty. v-pre keeps every inline code chip literal.
import type { MarkdownRenderer as MarkdownIt } from 'vitepress';

/** Gives every inline code element `v-pre`; it renders as before otherwise. */
export function inlineCodeVPre(md: MarkdownIt): void {
  const codeInline = md.renderer.rules.code_inline!;
  md.renderer.rules.code_inline = (tokens, idx, options, env, self) => {
    tokens[idx]!.attrSet('v-pre', '');
    return codeInline(tokens, idx, options, env, self);
  };
}
