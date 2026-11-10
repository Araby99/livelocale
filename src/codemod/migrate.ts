/** `livelocale migrate`: wraps react-i18next calls in every source file of a folder. */

import * as fs from 'fs';
import * as path from 'path';
import type { MigrateArgs } from './command-args.js';
import {
  loadProjectTypeScript,
  TYPESCRIPT_MISSING,
  TypeScriptUnusableError,
} from './hardcoded/load-typescript.js';

export type MigrateTransform = (
  code: string,
  file: string
) => Promise<{ modified: boolean; code: string }>;

const SOURCE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx'];

/**
 * Loads the codemod, which needs the optional `typescript` peer: the project's own copy first,
 * as `check --hardcoded` does, else the one next to livelocale (a global install, say).
 */
async function loadTransform(projectDir: string): Promise<MigrateTransform> {
  const transform = await import('./transform.js');
  const project = await loadProjectTypeScript(projectDir, 'migrate');
  if ('ts' in project) transform.useTypeScript(project.ts as any);
  else if (project.problem !== TYPESCRIPT_MISSING)
    throw new TypeScriptUnusableError(project.problem);
  else await transform.loadTypeScript();
  return transform.transformReactI18next;
}

/**
 * Converts every file it can and resolves with the exit code: 0 when every file converted (or
 * needed nothing), 1 when the folder is missing, TypeScript is missing, or any file failed, 2
 * when the installed TypeScript has no compiler API (TypeScript 7), so nothing could run.
 */
export async function runMigrate(
  { dir, excludes, dryRun }: MigrateArgs,
  transform?: MigrateTransform
): Promise<0 | 1 | 2> {
  const absoluteDir = path.resolve(dir);
  if (!fs.existsSync(absoluteDir)) {
    console.error(`Error: Directory "${dir}" does not exist.`);
    return 1;
  }

  let convert: MigrateTransform;
  try {
    convert = transform ?? (await loadTransform(absoluteDir));
  } catch (err: any) {
    console.error(`❌ ${err.message}`);
    return err instanceof TypeScriptUnusableError ? 2 : 1;
  }

  console.log(`\n🚀 Starting migration scanner...`);
  console.log(`📁 Target: ${absoluteDir}`);
  console.log(`🚫 Excluded: ${excludes.join(', ')}`);
  if (dryRun) {
    console.log(`🧪 Mode: DRY RUN (no files will be modified)`);
  }
  console.log('--------------------------------------------------');

  let scannedCount = 0;
  let migratedCount = 0;
  const failed: string[] = [];

  async function walk(currentDir: string) {
    const files = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const file of files) {
      const fullPath = path.join(currentDir, file.name);

      if (file.isDirectory()) {
        if (excludes.includes(file.name)) {
          continue;
        }
        await walk(fullPath);
      } else if (file.isFile() && SOURCE_EXTENSIONS.includes(path.extname(file.name))) {
        scannedCount++;
        const relativePath = path.relative(absoluteDir, fullPath);
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const result = await convert(content, fullPath);

          if (result.modified) {
            if (dryRun) {
              console.log(`[DRY RUN] Would migrate: ${relativePath}`);
            } else {
              fs.writeFileSync(fullPath, result.code, 'utf8');
              console.log(`✅ Migrated: ${relativePath}`);
            }
            migratedCount++;
          }
        } catch (err: any) {
          failed.push(relativePath);
          console.error(`❌ Error processing file ${fullPath}:`, err.message);
        }
      }
    }
  }

  let walkError: string | undefined;
  try {
    await walk(absoluteDir);
  } catch (err: any) {
    walkError = err.message;
    console.error(`❌ Walk error:`, err.message);
  }

  console.log('--------------------------------------------------');
  console.log(`📊 Summary:`);
  console.log(`   Scanned:  ${scannedCount} files`);
  if (dryRun) {
    console.log(`   Would migrate: ${migratedCount} files`);
  } else {
    console.log(`   Migrated: ${migratedCount} files`);
  }
  if (failed.length > 0 || walkError !== undefined) {
    if (failed.length > 0) {
      console.error(`   Failed:   ${failed.length} file(s)`);
      for (const file of failed) console.error(`     ${file}`);
    }
    if (walkError !== undefined) console.error(`   The scan stopped early: ${walkError}`);
    console.error(`\n❌ Not every file was converted. Fix the files above and run migrate again.`);
    return 1;
  }
  console.log(`\n🎉 Done!`);
  return 0;
}
