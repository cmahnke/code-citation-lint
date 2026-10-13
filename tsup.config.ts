import tsup from 'tsup'

export default tsup.defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'node20',
    splitting: false,
    outExtension: () => ({js: '.js'})
  },
  {
    // CLI runtime only: package bin uses dist/cli.js (ESM), and the shebang
    // from src/cli.ts is preserved by esbuild; dts disabled to avoid the
    // broken shebang-only dist/cli.d.ts. No CJS CLI is emitted because the
    // CLI reads package.json through import.meta.
    entry: ['src/cli.ts'],
    format: ['esm'],
    dts: false,
    sourcemap: true,
    clean: false,
    target: 'node20',
    splitting: false,
    outExtension: () => ({js: '.js'})
  },
  {
    entry: ['src/browser.ts'],
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: false,
    target: 'es2020',
    splitting: false,
    outExtension: () => ({js: '.js'})
  },
  {
    entry: ['src/browser.ts'],
    format: ['iife'],
    globalName: 'CodeCitationLint',
    outDir: 'dist',
    outExtension: () => ({js: '.browser.js'}),
    sourcemap: true,
    clean: false,
    dts: false,
    target: 'es2020',
    minify: true
  }
])
