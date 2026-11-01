import * as fs from 'fs';
import { createRequire } from 'module';
import * as path from 'path';

const require = createRequire(import.meta.url);

function writePackage(projectDir: string, packageJson: object, indexJs: string): void {
  const dir = path.join(projectDir, 'node_modules', 'typescript');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(packageJson), 'utf-8');
  fs.writeFileSync(path.join(dir, 'index.js'), indexJs, 'utf-8');
}

/** Makes this repository's `typescript` resolvable from `projectDir`, like a project dev dependency. */
export function linkTypeScript(projectDir: string): void {
  writePackage(
    projectDir,
    { name: 'typescript', main: 'index.js' },
    `module.exports = require(${JSON.stringify(require.resolve('typescript'))});\n`
  );
}

/** Installs a `typescript` package in `projectDir` that has a version but no compiler API. */
export function linkFakeTypeScript(projectDir: string, version: string): void {
  writePackage(
    projectDir,
    { name: 'typescript', version, main: 'index.js' },
    `module.exports = { version: ${JSON.stringify(version)} };\n`
  );
}
