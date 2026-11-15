// Bundles the API, the worker and the seed into dist/. @shop/shared ships as TypeScript source, so it is
// bundled in; every other dependency stays external and comes from node_modules at runtime.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const external = Object.keys({ ...pkg.dependencies }).filter((d) => d !== '@shop/shared');

await build({
  entryPoints: { server: 'src/server.ts', worker: 'src/worker.ts', seed: '../../prisma/seed.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  external,
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
console.log('API built');
