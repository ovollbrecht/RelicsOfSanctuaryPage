import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
await build({
  entryPoints: [resolve(here, 'src/index.ts')],
  bundle: true, format: 'esm', platform: 'browser', target: 'es2020',
  outfile: resolve(here, '../../src/vendor/d2s.js'),
  alias: {
    '__i18n__': resolve(here, 'shims/shared/i18n.ts'),
    'bridge/third-party/d2s/d2/types.d': resolve(here, 'shims/bridge/third-party/d2s/d2/types.d.ts'),
  },
  define: { 'process.env.NODE_ENV': '"production"', 'process.env.DEBUG_D2S': 'undefined' },
  // the fork reads process.env in one debug switch; the browser has no process
  banner: { js: '/* d2s save parser - D2RMM fork of dschu012/d2s, MIT. Built by scripts/vendor-d2s/build.mjs; do not edit. */\nvar process = globalThis.process ?? { env: {} };' },
  logLevel: 'warning',
});
console.log('src/vendor/d2s.js written');
