import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
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
    plugins: [react()],
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
