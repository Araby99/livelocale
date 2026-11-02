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
    plugins: [react(), fontLicenses()],
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
