import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';

// Resolve the package version at build/dev time from env (set by npm)
// or by reading package.json directly as a fallback.
function resolvePackageVersion(): string {
  if (process.env['npm_package_version']) {
    return process.env['npm_package_version'];
  }
  try {
    const require = createRequire(import.meta.url);
    const pkg = require(path.resolve(__dirname, '../../package.json'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * The SIL OFL 1.1 requires bundled fonts to travel with their copyright notice and licence.
 * Every Fontsource family that ends up in the bundle gets its package's LICENSE copied,
 * verbatim, to `fonts-licenses/<family>.txt` next to the built Studio.
 */
function fontLicenses(): Plugin {
  return {
    name: 'livelocale-font-licenses',
    apply: 'build',
    generateBundle() {
      const families = new Set<string>();
      for (const id of this.getModuleIds()) {
        const match = /[\\/]@fontsource[\\/]([^\\/]+)[\\/]/.exec(id);
        if (match?.[1]) families.add(match[1]);
      }
      for (const family of [...families].sort()) {
        const license = path.resolve(
          __dirname,
          '../../node_modules/@fontsource',
          family,
          'LICENSE'
        );
        this.emitFile({
          type: 'asset',
          fileName: `fonts-licenses/${family}.txt`,
          source: fs.readFileSync(license),
        });
      }
    },
  };
}

/** The folder of the package a module file belongs to: the last `node_modules/<name>`. */
function packageDirOf(file: string): string | null {
  const parts = file.split(/[\\/]/);
  const at = parts.lastIndexOf('node_modules');
  if (at < 0 || !parts[at + 1]) return null;
  const depth = parts[at + 1]!.startsWith('@') ? 3 : 2;
  return parts.slice(0, at + depth).join(path.sep);
}

/**
 * MIT and the other licences of the libraries in the Studio ask that their copyright notice
 * travel with every copy. Minifying strips it from the bundle, and `pack` copies the bundle into
 * users' sites, so every package compiled into it gets its licence copied, verbatim, into
 * `THIRD-PARTY-NOTICES.txt` next to the built Studio. Fonts have their own folder (fontLicenses).
 */
export function thirdPartyNotices(
  nodeModules = path.resolve(__dirname, '../../node_modules')
): Plugin {
  return {
    name: 'livelocale-third-party-notices',
    apply: 'build',
    generateBundle() {
      const dirs = new Set<string>();
      for (const id of this.getModuleIds()) {
        // Vite's own virtual helpers start with \0 and are not packages.
        if (id.startsWith('\0')) continue;
        const file = id.split('?')[0]!;
        const dir = packageDirOf(file);
        if (dir) {
          dirs.add(dir);
        } else if (file.endsWith('.css') && fs.existsSync(file)) {
          // Tailwind and tw-animate-css are compiled into the CSS by PostCSS, so they are never
          // modules of their own: find them by the CSS file's bare @import lines.
          const css = fs.readFileSync(file, 'utf8');
          for (const match of css.matchAll(/@import\s+['"]([^'"./][^'"]*)['"]/g)) {
            const parts = match[1]!.split('/');
            const name = parts[0]!.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!;
            dirs.add(path.join(nodeModules, name));
          }
        }
      }

      const packages: { name: string; version: string; license: string; text: string }[] = [];
      for (const dir of dirs) {
        const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as {
          name: string;
          version: string;
          license?: string;
        };
        if (pkg.name.startsWith('@fontsource/')) continue;
        const file = fs.readdirSync(dir).find((f) => /^licen[cs]e(\.[a-z]+)?$/i.test(f));
        if (!file) {
          this.error(
            `${pkg.name} is bundled into the Studio but has no licence file to ship with it.`
          );
        }
        packages.push({
          name: pkg.name,
          version: pkg.version,
          license: pkg.license ?? 'see below',
          text: fs.readFileSync(path.join(dir, file), 'utf8').trim(),
        });
      }
      // Sorted by name, so the file only changes when the dependencies do.
      packages.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

      this.emitFile({
        type: 'asset',
        fileName: 'THIRD-PARTY-NOTICES.txt',
        source:
          'The livelocale Studio includes the open source packages below. Their licences ask that ' +
          'these notices travel with every copy.\n\n' +
          packages
            .map((p) => `${p.name}@${p.version} (${p.license})\n\n${p.text}\n`)
            .join('\n----------------------------------------\n\n'),
      });
    },
  };
}

export default defineConfig(({ command }) => {
  // Auto-close dev server when parent process closes (e.g. on Windows Ctrl+C or terminal close)
  if (command === 'serve') {
    process.stdin.resume();
    process.stdin.on('end', () => {
      process.exit(0);
    });
  }

  const studioVersion = resolvePackageVersion();

  return {
    plugins: [react(), fontLicenses(), thirdPartyNotices()],
    root: path.resolve(__dirname),
    // Relative asset URLs so the built Studio works from any folder on any static host.
    base: './',
    define: {
      // Inject the package version as a compile-time constant.
      // Use JSON.stringify to produce a valid JS string literal.
      __STUDIO_VERSION__: JSON.stringify(studioVersion),
    },
    server: {
      port: 3010,
      strictPort: true,
      headers: {
        // RULE SEC-002: ENFORCE CONTENT-SECURITY-POLICY HEADER
        'Content-Security-Policy': "frame-src 'self' http://localhost:* http://127.0.0.1:*",
      },
    },
    build: {
      outDir: path.resolve(__dirname, '../../dist/studio'),
      emptyOutDir: true,
    },
  };
});
