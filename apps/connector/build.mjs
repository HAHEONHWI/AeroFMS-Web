import { build } from 'esbuild'

// Single-file Node bundle. ws/bonjour are CommonJS, so expose a real `require` for their builtin imports.
await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/aerofms-connector.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external: ['bufferutil', 'utf-8-validate'],
  banner: { js: "#!/usr/bin/env node\nimport { createRequire as __aerofmsCreateRequire } from 'node:module';\nconst require = __aerofmsCreateRequire(import.meta.url);" },
  legalComments: 'linked',
  logLevel: 'info',
})
