import type * as TS from 'typescript';

type Ts = typeof TS;

export interface ClassLiteral {
  line: number;
  text: string;
  element?: TS.JsxOpeningLikeElement;
}

const CLASS_NAME = /class/i;
const JSX_CLASS_ATTRIBUTE = new Set(['className', 'class']);

/** The literal texts an expression can produce as class names, following the ways class strings are built. */
function collect(ts: Ts, node: TS.Node, out: TS.Node[]): void {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    out.push(node);
  } else if (ts.isTemplateExpression(node)) {
    out.push(node.head);
    for (const span of node.templateSpans) {
      collect(ts, span.expression, out);
      out.push(span.literal);
    }
  } else if (ts.isConditionalExpression(node)) {
    collect(ts, node.whenTrue, out);
    collect(ts, node.whenFalse, out);
  } else if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) collect(ts, node.right, out);
    else if (
      op === ts.SyntaxKind.BarBarToken ||
      op === ts.SyntaxKind.QuestionQuestionToken ||
      op === ts.SyntaxKind.PlusToken
    ) {
      collect(ts, node.left, out);
      collect(ts, node.right, out);
    }
  } else if (ts.isCallExpression(node)) {
    for (const arg of node.arguments) collect(ts, arg, out);
  } else if (ts.isArrayLiteralExpression(node)) {
    for (const element of node.elements) collect(ts, element, out);
  } else if (ts.isObjectLiteralExpression(node)) {
    for (const property of node.properties) {
      if (ts.isPropertyAssignment(property)) collect(ts, property.initializer, out);
    }
  } else if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    if (ts.isBlock(node.body)) {
      const returns = (n: TS.Node): void => {
        if (ts.isReturnStatement(n) && n.expression) collect(ts, n.expression, out);
        else if (!ts.isFunctionLike(n)) ts.forEachChild(n, returns);
      };
      ts.forEachChild(node.body, returns);
    } else collect(ts, node.body, out);
  } else if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isJsxExpression(node)
  ) {
    if (node.expression) collect(ts, node.expression, out);
  }
}

/** Text of a collected literal node, without quotes or template delimiters. */
function literalText(ts: Ts, node: TS.Node): string {
  if (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateHead(node) ||
    ts.isTemplateMiddle(node) ||
    ts.isTemplateTail(node)
  ) {
    return node.text;
  }
  return '';
}

/** Text of every string literal and template-literal head/span text inside a JSX `className`/`class` initializer
 *  (through ternaries, `&&`, calls and arrays), plus every literal initializing a variable or property whose name
 *  matches /class/i. Parsed with ScriptKind.TSX; `line` is 1-based. */
export function classLiterals(
  ts: Ts,
  source: string,
  file: string
): { line: number; text: string; element?: TS.JsxOpeningLikeElement }[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: ClassLiteral[] = [];
  const add = (initializer: TS.Node, element?: TS.JsxOpeningLikeElement): void => {
    const nodes: TS.Node[] = [];
    collect(ts, initializer, nodes);
    for (const node of nodes) {
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      found.push(
        element
          ? { line, text: literalText(ts, node), element }
          : { line, text: literalText(ts, node) }
      );
    }
  };
  const named = (name: TS.Node): boolean =>
    (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isPrivateIdentifier(name)) &&
    CLASS_NAME.test(name.text);

  const visit = (node: TS.Node): void => {
    if (
      ts.isJsxAttribute(node) &&
      node.initializer &&
      JSX_CLASS_ATTRIBUTE.has(node.name.getText(sf))
    ) {
      add(node.initializer, node.parent.parent);
    } else if (
      (ts.isVariableDeclaration(node) ||
        ts.isPropertyAssignment(node) ||
        ts.isPropertyDeclaration(node)) &&
      node.initializer &&
      named(node.name)
    ) {
      add(node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}
