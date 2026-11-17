#!/usr/bin/env node
// Load test for the browse and checkout paths (docs/operations.md). No dependencies (Node 22+ fetch).
//
//   node scripts/load/load-test.mjs --base http://localhost:3000 --scenario browse --concurrency 20 --seconds 30
//   node scripts/load/load-test.mjs --base https://staging.yourshop.com.bd --scenario checkout
//
// Scenarios:
//   browse   home, category, product, search, search suggestions, product list API
//   checkout cart read and checkout quote (no orders are placed: that would create real orders)
//
// Each virtual user sends a different X-Forwarded-For so per-IP rate limits behave as with many
// shoppers. That only works where the app trusts that header (local, staging behind no Cloudflare);
// in production the client IP comes from Cloudflare and the limits apply as designed.

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc),
      [],
    ),
);
const BASE = (args.base ?? 'http://localhost:3000').replace(/\/+$/, '');
const SCENARIO = args.scenario ?? 'browse';
const CONCURRENCY = Number(args.concurrency ?? 20);
const SECONDS = Number(args.seconds ?? 30);
// --rotate-ip yes: a new simulated visitor per request, to measure work behind per-IP limits.
const ROTATE_IP = args['rotate-ip'] === 'yes';

async function json(path) {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()).data;
}

// Discover real slugs and a variant from the running shop.
const products = await json('/api/v1/products?pageSize=24');
const categories = await json('/api/v1/categories');
if (!products.length) throw new Error('No products: seed the catalog first (pnpm db:seed-demo)');
const productSlugs = products.map((p) => p.slug);
const categorySlugs = categories.filter((c) => c.productCount > 0).map((c) => c.slug);
const detail = await json(`/api/v1/products/${productSlugs[0]}`);
const variantId = detail.variants.find((v) => v.inStock)?.id ?? detail.variants[0].id;
const pick = (list) => list[Math.floor(Math.random() * list.length)];

const scenarios = {
  browse: [
    { name: 'GET / (home page)', req: () => ({ path: '/' }) },
    { name: 'GET /category/:slug', req: () => ({ path: `/category/${pick(categorySlugs)}` }) },
    { name: 'GET /product/:slug', req: () => ({ path: `/product/${pick(productSlugs)}` }) },
    {
      name: 'GET /search?q=',
      req: () => ({ path: `/search?q=${pick(['honey', 'tea', 'oil', 'dates'])}` }),
    },
    {
      name: 'GET api /search/suggest',
      req: () => ({ path: `/api/v1/search/suggest?q=${pick(['ho', 'te', 'co', 'da'])}` }),
    },
    {
      name: 'GET api /products',
      req: () => ({ path: `/api/v1/products?category=${pick(categorySlugs)}&sort=price_asc` }),
    },
  ],
  checkout: [
    { name: 'GET api /cart', req: () => ({ path: '/api/v1/cart' }) },
    {
      name: 'POST api /checkout/quote',
      req: () => ({
        path: '/api/v1/checkout/quote',
        method: 'POST',
        body: {
          items: [{ variantId, quantity: 1 + Math.floor(Math.random() * 3) }],
          district: pick(['Dhaka', 'Bogura', 'Sylhet']),
        },
      }),
    },
  ],
};
const routes = scenarios[SCENARIO];
if (!routes) throw new Error(`Unknown scenario ${SCENARIO}`);

const stats = new Map(routes.map((r) => [r.name, { times: [], errors: 0, statuses: {} }]));
const deadline = Date.now() + SECONDS * 1000;

async function user(n) {
  let ip = `10.99.${Math.floor(n / 250)}.${(n % 250) + 1}`;
  let seq = 0;
  while (Date.now() < deadline) {
    if (ROTATE_IP) ip = `10.${100 + (n % 100)}.${Math.floor(seq / 250) % 250}.${(seq++ % 250) + 1}`;
    const route = pick(routes);
    const { path, method = 'GET', body } = route.req();
    const s = stats.get(route.name);
    const t0 = performance.now();
    try {
      const res = await fetch(BASE + path, {
        method,
        headers: {
          'X-Forwarded-For': ip,
          'X-Requested-With': 'XMLHttpRequest',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      await res.arrayBuffer();
      s.times.push(performance.now() - t0);
      s.statuses[res.status] = (s.statuses[res.status] ?? 0) + 1;
      if (res.status >= 400) s.errors += 1;
    } catch {
      s.errors += 1;
    }
  }
}

const pct = (sorted, p) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0;
console.log(`Load test: ${SCENARIO}, ${CONCURRENCY} users, ${SECONDS}s against ${BASE}`);
await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => user(i)));

let total = 0;
console.log(
  '\nroute                            requests   req/s    p50     p95     p99   errors  statuses',
);
for (const [name, s] of stats) {
  const sorted = [...s.times].sort((a, b) => a - b);
  total += s.times.length;
  const ms = (v) => `${Math.round(v)}ms`.padStart(7);
  console.log(
    `${name.padEnd(32)} ${String(s.times.length).padStart(8)} ${(s.times.length / SECONDS).toFixed(1).padStart(7)} ${ms(pct(sorted, 50))} ${ms(pct(sorted, 95))} ${ms(pct(sorted, 99))} ${String(s.errors).padStart(7)}  ${JSON.stringify(s.statuses)}`,
  );
}
console.log(`\ntotal ${total} requests, ${(total / SECONDS).toFixed(1)} req/s`);
