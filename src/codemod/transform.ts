// Type-only import: the runtime module is loaded lazily by `loadTypeScript()`.
import type * as ts from 'typescript';

type TypeScriptModule = typeof ts;

/**
 * `typescript` is an optional peer: it is only needed by `migrate`. Loading it
 * lazily keeps `init` and `studio` working in JavaScript-only projects.
 */
export async function loadTypeScript(): Promise<TypeScriptModule> {
  try {
    const mod: any = await import('typescript');
    return (mod.default ?? mod) as TypeScriptModule;
  } catch {
    throw new Error(
      "The 'typescript' package is required for the migrate command. Install it with: npm install -D typescript"
    );
  }
}

export interface TransformResult {
  code: string;
  modified: boolean;
}

/**
 * Transforms a source file by wrapping react-i18next useTranslation hook calls
 * with wrapTranslationEngine.
 */
export async function transformReactI18next(
  sourceText: string,
  filename: string
): Promise<TransformResult> {
  const ts = await loadTypeScript();
  const sourceFile = ts.createSourceFile(filename, sourceText, ts.ScriptTarget.Latest, true);

  let hasUseTranslationImport = false;
  let alreadyHasWrapImport = false;
  let useTranslationImportNode: ts.Node | null = null;
  let localUseTranslationName = 'useTranslation';

  // Step 1: Find imports
  function findImports(node: ts.Node) {
    if (ts.isImportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier;
      if (ts.isStringLiteral(moduleSpecifier)) {
        if (moduleSpecifier.text === 'react-i18next') {
          const importClause = node.importClause;
          if (
            importClause &&
            importClause.namedBindings &&
            ts.isNamedImports(importClause.namedBindings)
          ) {
            for (const specifier of importClause.namedBindings.elements) {
              const importedName = specifier.propertyName
                ? specifier.propertyName.text
                : specifier.name.text;
              if (importedName === 'useTranslation') {
                hasUseTranslationImport = true;
                localUseTranslationName = specifier.name.text;
                useTranslationImportNode = node;
              }
            }
          }
        }
        if (
          moduleSpecifier.text === 'livelocale/client' ||
          moduleSpecifier.text === 'livelocale/server'
        ) {
          alreadyHasWrapImport = true;
        }
      }
    }
    ts.forEachChild(node, findImports);
  }

  findImports(sourceFile);

  if (!hasUseTranslationImport) {
    return { code: sourceText, modified: false };
  }

  interface Edit {
    start: number;
    end: number;
    text: string;
    index: number; // for stable sorting
  }
  const edits: Edit[] = [];
  let editCount = 0;

  // Step 2: Find useTranslation calls and their statement structures
  function findHookCalls(node: ts.Node) {
    if (ts.isVariableStatement(node)) {
      const declList = node.declarationList;
      for (const decl of declList.declarations) {
        if (decl.initializer && ts.isCallExpression(decl.initializer)) {
          const expr = decl.initializer.expression;
          if (ts.isIdentifier(expr) && expr.text === localUseTranslationName) {
            processHookCall(decl, node);
          }
        }
      }
    }
    ts.forEachChild(node, findHookCalls);
  }

  function isAlreadyWrapped(
    tLocalName: string,
    originalName: string,
    parentNode: ts.Node
  ): boolean {
    let found = false;
    function visit(node: ts.Node) {
      if (ts.isVariableDeclaration(node)) {
        if (ts.isIdentifier(node.name) && node.name.text === originalName) {
          if (node.initializer) {
            if (ts.isCallExpression(node.initializer)) {
              const expr = node.initializer.expression;
              if (ts.isIdentifier(expr) && expr.text === 'wrapTranslationEngine') {
                if (node.initializer.arguments.length > 0) {
                  const arg = node.initializer.arguments[0];
                  if (arg && ts.isIdentifier(arg) && arg.text === tLocalName) {
                    found = true;
                  }
                }
              }
            } else if (ts.isObjectLiteralExpression(node.initializer)) {
              let hasSpread = false;
              let hasWrap = false;
              for (const prop of node.initializer.properties) {
                if (ts.isSpreadAssignment(prop)) {
                  if (ts.isIdentifier(prop.expression) && prop.expression.text === tLocalName) {
                    hasSpread = true;
                  }
                } else if (ts.isPropertyAssignment(prop)) {
                  if (ts.isIdentifier(prop.name) && prop.name.text === 't') {
                    if (ts.isCallExpression(prop.initializer)) {
                      const expr = prop.initializer.expression;
                      if (ts.isIdentifier(expr) && expr.text === 'wrapTranslationEngine') {
                        hasWrap = true;
                      }
                    }
                  }
                }
              }
              if (hasSpread && hasWrap) {
                found = true;
              }
            }
          }
        }
      }
      if (!found) {
        ts.forEachChild(node, visit);
      }
    }
    visit(parentNode);
    return found;
  }

  function processHookCall(
    declaration: ts.VariableDeclaration,
    variableStatement: ts.VariableStatement
  ) {
    const callNode = declaration.initializer as ts.CallExpression;

    // Extract keyPrefix expression if present
    let keyPrefixExpr: string | undefined = undefined;
    if (callNode.arguments.length > 0) {
      const firstArg = callNode.arguments[0]!;
      if (ts.isStringLiteral(firstArg)) {
        keyPrefixExpr = `'${firstArg.text}'`;
      } else if (ts.isArrayLiteralExpression(firstArg)) {
        if (firstArg.elements.length > 0) {
          const firstElem = firstArg.elements[0]!;
          keyPrefixExpr = firstElem.getText(sourceFile);
        }
      } else {
        keyPrefixExpr = firstArg.getText(sourceFile);
      }
    }

    // Determine indentation of the statement
    const statementStart = variableStatement.getStart(sourceFile);
    let lineStart = statementStart;
    while (
      lineStart > 0 &&
      sourceText[lineStart - 1] !== '\n' &&
      sourceText[lineStart - 1] !== '\r'
    ) {
      lineStart--;
    }
    const indentation = sourceText.slice(lineStart, statementStart).match(/^\s*/)?.[0] || '';
    const wrapOptions = keyPrefixExpr ? `, { keyPrefix: ${keyPrefixExpr} }` : '';

    const nameNode = declaration.name;

    // Pattern A: Object Destructuring: const { t } = useTranslation()
    if (ts.isObjectBindingPattern(nameNode)) {
      let tElement: ts.BindingElement | null = null;
      for (const element of nameNode.elements) {
        if (ts.isIdentifier(element.name)) {
          const propName = element.propertyName
            ? ts.isIdentifier(element.propertyName)
              ? element.propertyName.text
              : element.propertyName.getText(sourceFile)
            : (element.name as ts.Identifier).text;
          if (propName === 't') {
            tElement = element;
            break;
          }
        }
      }

      if (tElement && ts.isIdentifier(tElement.name)) {
        const tLocalName = tElement.name.text;

        // Determine original/desired name of the translation variable (e.g. 't' or a custom rename)
        let desiredName = tLocalName;
        if (tLocalName.startsWith('raw') && tLocalName.length > 3) {
          const base = tLocalName.slice(3);
          desiredName = base.charAt(0).toLowerCase() + base.slice(1);
        } else if (tElement.propertyName && ts.isIdentifier(tElement.propertyName)) {
          desiredName = tLocalName;
        } else {
          desiredName = 't';
        }

        if (
          variableStatement.parent &&
          isAlreadyWrapped(tLocalName, desiredName, variableStatement.parent)
        ) {
          return;
        }

        const rawLocalName = `raw${desiredName.charAt(0).toUpperCase()}${desiredName.slice(1)}`;

        // Replace "t" or "t: customName" with "t: rawName"
        edits.push({
          start: tElement.getStart(sourceFile),
          end: tElement.getEnd(),
          text: `t: ${rawLocalName}`,
          index: editCount++,
        });

        // Insert wrap translation statement right after the variable statement
        edits.push({
          start: variableStatement.getEnd(),
          end: variableStatement.getEnd(),
          text: `\n${indentation}const ${desiredName} = wrapTranslationEngine(${rawLocalName}${wrapOptions});`,
          index: editCount++,
        });
      }
    }
    // Pattern B: Array Destructuring: const [ t ] = useTranslation()
    else if (ts.isArrayBindingPattern(nameNode)) {
      if (nameNode.elements.length > 0) {
        const firstElement = nameNode.elements[0]!;
        if (ts.isBindingElement(firstElement) && ts.isIdentifier(firstElement.name)) {
          const tLocalName = firstElement.name.text;

          let desiredName = tLocalName;
          if (tLocalName.startsWith('raw') && tLocalName.length > 3) {
            const base = tLocalName.slice(3);
            desiredName = base.charAt(0).toLowerCase() + base.slice(1);
          }

          if (
            variableStatement.parent &&
            isAlreadyWrapped(tLocalName, desiredName, variableStatement.parent)
          ) {
            return;
          }

          const rawLocalName = `raw${desiredName.charAt(0).toUpperCase()}${desiredName.slice(1)}`;

          // Replace first element with rawName
          edits.push({
            start: firstElement.getStart(sourceFile),
            end: firstElement.getEnd(),
            text: rawLocalName,
            index: editCount++,
          });

          // Insert wrap translation statement right after the variable statement
          edits.push({
            start: variableStatement.getEnd(),
            end: variableStatement.getEnd(),
            text: `\n${indentation}const ${desiredName} = wrapTranslationEngine(${rawLocalName}${wrapOptions});`,
            index: editCount++,
          });
        }
      }
    }
    // Pattern C: Simple Assignment: const translation = useTranslation()
    else if (ts.isIdentifier(nameNode)) {
      const tLocalName = nameNode.text;

      let desiredName = tLocalName;
      if (tLocalName.startsWith('raw') && tLocalName.length > 3) {
        const base = tLocalName.slice(3);
        desiredName = base.charAt(0).toLowerCase() + base.slice(1);
      }

      if (
        variableStatement.parent &&
        isAlreadyWrapped(tLocalName, desiredName, variableStatement.parent)
      ) {
        return;
      }

      const rawLocalName = `raw${desiredName.charAt(0).toUpperCase()}${desiredName.slice(1)}`;

      // Replace name with rawName
      edits.push({
        start: nameNode.getStart(sourceFile),
        end: nameNode.getEnd(),
        text: rawLocalName,
        index: editCount++,
      });

      // Insert wrapper structure right after the variable statement
      edits.push({
        start: variableStatement.getEnd(),
        end: variableStatement.getEnd(),
        text: `\n${indentation}const ${desiredName} = { ...${rawLocalName}, t: wrapTranslationEngine(${rawLocalName}.t${wrapOptions}) };`,
        index: editCount++,
      });
    }
  }

  findHookCalls(sourceFile);

  if (edits.length === 0) {
    return { code: sourceText, modified: false };
  }

  // Step 3: Insert wrap import if not already present
  if (!alreadyHasWrapImport) {
    if (useTranslationImportNode) {
      const insertPos = (useTranslationImportNode as ts.Node).getEnd();
      edits.push({
        start: insertPos,
        end: insertPos,
        text: `\nimport { wrapTranslationEngine } from 'livelocale/client';`,
        index: editCount++,
      });
    } else {
      let insertPos = 0;
      const useClientMatch = sourceText.match(/^['"]use client['"];?\s*/);
      if (useClientMatch) {
        insertPos = useClientMatch[0].length;
      }
      edits.push({
        start: insertPos,
        end: insertPos,
        text: `import { wrapTranslationEngine } from 'livelocale/client';\n`,
        index: editCount++,
      });
    }
  }

  // Step 4: Apply edits in reverse order
  edits.sort((a, b) => {
    if (b.start !== a.start) {
      return b.start - a.start;
    }
    // If same start index, preserve original relative order descending (so insertions don't scramble)
    return b.index - a.index;
  });

  let newText = sourceText;
  for (const edit of edits) {
    newText = newText.slice(0, edit.start) + edit.text + newText.slice(edit.end);
  }

  return { code: newText, modified: true };
}
