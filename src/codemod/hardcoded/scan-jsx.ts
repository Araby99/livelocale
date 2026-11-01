import type * as TS from 'typescript';
import type { AllowList } from './allow-list.js';
import { isUserText, normalizeText, shortenText } from './text-filters.js';

/** The user's own `typescript` module, passed in so this file never loads it itself. */
export type TypeScriptModule = typeof import('typescript');

export interface HardcodedFinding {
  /** 1-based. */
  line: number;
  /** 1-based. */
  column: number;
  /** Normalised and shortened source text. */
  text: string;
}

/** JSX attributes whose value a user reads or hears. */
export const TEXT_ATTRIBUTES: ReadonlySet<string> = new Set(
  (
    'alt title placeholder aria-label label aria-description aria-placeholder ' +
    'aria-roledescription aria-valuetext'
  ).split(' ')
);

/** Elements whose contents are never reported (already translated, or code). */
export const SKIPPED_ELEMENTS: ReadonlySet<string> = new Set(
  'Trans code pre kbd samp script style'.split(' ')
);

export interface ScanOptions {
  /** Also report template literals with substitutions (Studio copy sweep only). */
  templates?: boolean;
}

const IGNORE_NEXT_LINE = /(?:\/\/|\/\*)\s*livelocale-ignore-next-line\b/;
const IGNORE_FILE = /livelocale-ignore-file\b/;

interface Candidate {
  /** Offset of the first character to report. */
  pos: number;
  raw: string;
  /** Element whose start line an ignore comment may sit above. */
  owner: TS.Node;
}

function scriptKind(ts: TypeScriptModule, fileName: string): TS.ScriptKind {
  const ext = /\.[^./\\]+$/.exec(fileName)?.[0].toLowerCase() ?? '';
  if (ext === '.tsx') return ts.ScriptKind.TSX;
  if (ext === '.jsx' || ext === '.js' || ext === '.mjs' || ext === '.cjs') return ts.ScriptKind.JSX;
  return ts.ScriptKind.TS;
}

function isIgnoredFile(ts: TypeScriptModule, sf: TS.SourceFile, sourceText: string): boolean {
  const first = sf.statements.find(
    (s) => !(ts.isExpressionStatement(s) && ts.isStringLiteral(s.expression))
  );
  const head = first ? sourceText.slice(0, first.getStart(sf)) : sourceText;
  return IGNORE_FILE.test(head);
}

function tagName(ts: TypeScriptModule, tag: TS.JsxTagNameExpression, sf: TS.SourceFile): string {
  return ts.isPropertyAccessExpression(tag) ? tag.name.text : tag.getText(sf);
}

/** Literal strings an expression can evaluate to, as candidates. */
function staticStrings(
  ts: TypeScriptModule,
  expr: TS.Expression,
  owner: TS.Node,
  sf: TS.SourceFile,
  options: ScanOptions,
  out: Candidate[]
): void {
  if (ts.isParenthesizedExpression(expr)) {
    staticStrings(ts, expr.expression, owner, sf, options, out);
  } else if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    out.push({ pos: expr.getStart(sf) + 1, raw: expr.text, owner });
  } else if (ts.isConditionalExpression(expr)) {
    staticStrings(ts, expr.whenTrue, owner, sf, options, out);
    staticStrings(ts, expr.whenFalse, owner, sf, options, out);
  } else if (ts.isBinaryExpression(expr)) {
    const op = expr.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) {
      staticStrings(ts, expr.right, owner, sf, options, out);
    } else if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
      staticStrings(ts, expr.left, owner, sf, options, out);
      staticStrings(ts, expr.right, owner, sf, options, out);
    }
  } else if (options.templates && ts.isTemplateExpression(expr)) {
    const parts = [expr.head.text, ...expr.templateSpans.map((span) => span.literal.text)];
    out.push({ pos: expr.head.getStart(sf) + 1, raw: parts.join(' '), owner });
  }
}

function collectCandidates(
  ts: TypeScriptModule,
  sf: TS.SourceFile,
  options: ScanOptions
): Candidate[] {
  const out: Candidate[] = [];
  const visit = (node: TS.Node): void => {
    if (ts.isJsxElement(node)) {
      if (SKIPPED_ELEMENTS.has(tagName(ts, node.openingElement.tagName, sf))) return;
    } else if (ts.isJsxText(node)) {
      const raw = node.getFullText(sf);
      const lead = raw.search(/\S/);
      if (lead >= 0) out.push({ pos: node.pos + lead, raw, owner: node.parent });
    } else if (ts.isJsxAttribute(node)) {
      const init = node.initializer;
      if (init && TEXT_ATTRIBUTES.has(node.name.getText(sf))) {
        const owner = node.parent.parent;
        if (ts.isStringLiteral(init)) {
          staticStrings(ts, init, owner, sf, options, out);
        } else if (ts.isJsxExpression(init) && init.expression) {
          staticStrings(ts, init.expression, owner, sf, options, out);
        }
      }
    } else if (
      ts.isJsxExpression(node) &&
      node.expression &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
    ) {
      staticStrings(ts, node.expression, node.parent, sf, options, out);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** Finds user-visible text in one JSX/TSX source file that never went through translation. */
export function findHardcodedText(
  ts: TypeScriptModule,
  sourceText: string,
  fileName: string,
  allow: AllowList,
  options: ScanOptions = {}
): HardcodedFinding[] {
  // Drop a BOM so first-line columns match the editor.
  const text = sourceText.startsWith('\uFEFF') ? sourceText.slice(1) : sourceText;
  const sf = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(ts, fileName)
  );
  if (isIgnoredFile(ts, sf, text)) return [];

  const lines = text.split(/\r?\n/);
  const ignoredAbove = (line0: number) => line0 > 0 && IGNORE_NEXT_LINE.test(lines[line0 - 1]!);

  const findings: HardcodedFinding[] = [];
  for (const candidate of collectCandidates(ts, sf, options)) {
    const normalized = normalizeText(candidate.raw);
    if (!isUserText(normalized, allow)) continue;
    const { line, character } = sf.getLineAndCharacterOfPosition(candidate.pos);
    const ownerLine = sf.getLineAndCharacterOfPosition(candidate.owner.getStart(sf)).line;
    if (ignoredAbove(line) || ignoredAbove(ownerLine)) continue;
    findings.push({ line: line + 1, column: character + 1, text: shortenText(normalized) });
  }
  return findings.sort((a, b) => a.line - b.line || a.column - b.column);
}
