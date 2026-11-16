/**
 * Development only: a small demo catalog so the storefront has something to show before the real
 * products are entered. Goes through the normal services (validation, media pipeline, stock
 * movements, audit log). Safe to re-run: anything whose slug or SKU already exists is skipped.
 *
 *   pnpm db:seed-demo
 *
 * Brand names are invented; placeholder images are generated, not photos.
 */
import type { CreateVariantInput } from '@shop/shared';
import sharp from 'sharp';
import { loadEnv } from '../config/env';
import { createDeps } from '../deps';
import { addAttributeValue, createAttribute } from '../services/attribute.service';
import type { Actor } from '../services/audit.service';
import { createBrand, createTag } from '../services/brand.service';
import { createCategory } from '../services/category.service';
import { uploadMedia } from '../services/media.service';
import { createProduct, setProductImages } from '../services/product.service';

const env = loadEnv();
if (env.NODE_ENV === 'production') {
  console.error('seed-demo is for development only.');
  process.exit(1);
}
const deps = createDeps(env);
const { prisma } = deps;

type CategorySpec = { slug: string; name: string; parent?: string; color: string };
const CATEGORIES: CategorySpec[] = [
  { slug: 'honey-spreads', name: 'Honey and Spreads', color: '#d97706' },
  { slug: 'beverages', name: 'Beverages', color: '#7c2d12' },
  { slug: 'health-drinks', name: 'Health Drinks', parent: 'beverages', color: '#92400e' },
  { slug: 'tea-coffee', name: 'Tea and Coffee', parent: 'beverages', color: '#065f46' },
  { slug: 'canned-food', name: 'Canned Food', color: '#1e40af' },
  { slug: 'canned-fish', name: 'Canned Fish', parent: 'canned-food', color: '#1d4ed8' },
  { slug: 'canned-fruits', name: 'Canned Fruits', parent: 'canned-food', color: '#be185d' },
  { slug: 'dry-fruits-nuts', name: 'Dry Fruits and Nuts', color: '#78350f' },
  { slug: 'cooking-essentials', name: 'Cooking Essentials', color: '#a16207' },
  { slug: 'breakfast', name: 'Breakfast and Cereals', color: '#b45309' },
];

const BRANDS = [
  'Golden Hive',
  'Sundar Farms',
  'Ocean Pearl',
  'Morning Malt',
  'Green Valley',
  'Desert Gold',
];
const TAGS = ['Organic', 'Halal', 'Imported', 'Sugar free', 'Gift idea'];
const ATTRIBUTES: Record<string, string[]> = {
  Flavor: ['Plain', 'Classic Malt', 'Chocolate'],
  Type: ['Regular', 'Organic'],
};

type V = Omit<CreateVariantInput, 'attributeValueIds'> & { attrs?: string[] };
type ProductSpec = {
  slug: string;
  name: string;
  category: string;
  brand: string;
  tags?: string[];
  short: string;
  description: string;
  ingredients?: string;
  facts?: { name: string; amount: string }[];
  shelfLife?: string;
  origin?: string;
  flags?: { isFeatured?: boolean; isNewArrival?: boolean; isBestSeller?: boolean };
  status?: 'ACTIVE' | 'DRAFT';
  variants: V[];
};

const PRODUCTS: ProductSpec[] = [
  {
    slug: 'sundarbans-wild-honey',
    name: 'Sundarbans Wild Honey',
    category: 'honey-spreads',
    brand: 'Golden Hive',
    tags: ['organic', 'halal'],
    short: 'Raw wild honey collected from the Sundarbans mangrove forest.',
    description:
      'Thick, dark and full of flavour, collected by local honey hunters during the spring season.\n\n- Raw and unfiltered\n- No added sugar\n- Packed in glass jars',
    ingredients: '100% wild honey',
    facts: [
      { name: 'Energy', amount: '304 kcal per 100 g' },
      { name: 'Carbohydrates', amount: '82 g' },
    ],
    shelfLife: '24 months',
    origin: 'Bangladesh',
    flags: { isFeatured: true, isBestSeller: true },
    variants: [
      {
        sku: 'GH-HONEY-250',
        unit: 'G',
        unitValue: '250',
        price: '380',
        initialStock: 40,
        weightGrams: 420,
      },
      {
        sku: 'GH-HONEY-500',
        unit: 'G',
        unitValue: '500',
        price: '650',
        salePrice: '599',
        initialStock: 60,
        weightGrams: 720,
      },
      {
        sku: 'GH-HONEY-1KG',
        unit: 'KG',
        unitValue: '1',
        price: '1200',
        initialStock: 25,
        weightGrams: 1350,
      },
    ],
  },
  {
    slug: 'mustard-flower-honey',
    name: 'Mustard Flower Honey',
    category: 'honey-spreads',
    brand: 'Sundar Farms',
    tags: ['halal'],
    short: 'Light, creamy honey from mustard fields; it crystallises naturally in winter.',
    description:
      'Mild and sweet. Crystallisation is natural; warm the jar gently to make it liquid again.',
    ingredients: '100% mustard flower honey',
    shelfLife: '24 months',
    origin: 'Bangladesh',
    flags: { isNewArrival: true },
    variants: [
      {
        sku: 'SF-MUSTARD-500',
        unit: 'G',
        unitValue: '500',
        price: '480',
        initialStock: 35,
        weightGrams: 700,
      },
    ],
  },
  {
    slug: 'chocolate-hazelnut-spread',
    name: 'Chocolate Hazelnut Spread',
    category: 'honey-spreads',
    brand: 'Green Valley',
    tags: ['imported'],
    short: 'Smooth cocoa and hazelnut spread for bread and pancakes.',
    description:
      'A family favourite for breakfast. Store in a cool, dry place; no need to refrigerate.',
    ingredients: 'Sugar, palm oil, hazelnuts (13%), cocoa, skimmed milk powder',
    shelfLife: '12 months',
    origin: 'Turkey',
    variants: [
      {
        sku: 'GV-CHOC-350',
        unit: 'G',
        unitValue: '350',
        price: '520',
        initialStock: 30,
        weightGrams: 480,
      },
      {
        sku: 'GV-CHOC-750',
        unit: 'G',
        unitValue: '750',
        price: '980',
        initialStock: 4,
        lowStockThreshold: 5,
        weightGrams: 950,
      },
    ],
  },
  {
    slug: 'malted-health-drink',
    name: 'Malted Health Drink',
    category: 'health-drinks',
    brand: 'Morning Malt',
    tags: ['halal'],
    short: 'Malted drink powder with vitamins and minerals, for children and adults.',
    description:
      'Mix 3 spoons in a glass of warm milk.\n\n- With vitamins A, C and D\n- Two flavours',
    ingredients: 'Malted barley, wheat flour, milk solids, sugar, vitamins and minerals',
    facts: [
      { name: 'Energy', amount: '377 kcal per 100 g' },
      { name: 'Protein', amount: '11 g' },
    ],
    shelfLife: '12 months',
    origin: 'India',
    flags: { isFeatured: true, isBestSeller: true },
    variants: [
      {
        sku: 'MM-MALT-500-CL',
        unit: 'G',
        unitValue: '500',
        price: '520',
        initialStock: 50,
        attrs: ['Flavor=Classic Malt'],
        weightGrams: 600,
      },
      {
        sku: 'MM-MALT-500-CH',
        unit: 'G',
        unitValue: '500',
        price: '540',
        initialStock: 30,
        attrs: ['Flavor=Chocolate'],
        weightGrams: 600,
      },
      {
        sku: 'MM-MALT-1KG-CL',
        unit: 'KG',
        unitValue: '1',
        price: '980',
        salePrice: '920',
        initialStock: 20,
        attrs: ['Flavor=Classic Malt'],
        weightGrams: 1150,
      },
    ],
  },
  {
    slug: 'premium-black-tea',
    name: 'Premium Black Tea',
    category: 'tea-coffee',
    brand: 'Sundar Farms',
    tags: ['halal'],
    short: 'Strong, bright CTC tea from the gardens of Sylhet.',
    description: 'Brew for 3 to 4 minutes. Great with milk and sugar.',
    shelfLife: '24 months',
    origin: 'Bangladesh',
    variants: [
      {
        sku: 'SF-TEA-400',
        unit: 'G',
        unitValue: '400',
        price: '290',
        initialStock: 80,
        weightGrams: 450,
      },
      {
        sku: 'SF-TEA-1KG',
        unit: 'KG',
        unitValue: '1',
        price: '690',
        initialStock: 30,
        weightGrams: 1080,
      },
    ],
  },
  {
    slug: 'green-tea-bags',
    name: 'Green Tea Bags',
    category: 'tea-coffee',
    brand: 'Green Valley',
    tags: ['organic', 'sugar-free'],
    short: 'Light green tea in 50 individually wrapped bags.',
    description: 'Steep one bag for 2 minutes in water just off the boil.',
    shelfLife: '18 months',
    origin: 'Bangladesh',
    flags: { isNewArrival: true },
    variants: [
      {
        sku: 'GV-GREENTEA-50',
        unit: 'PCS',
        unitValue: '50',
        price: '250',
        initialStock: 45,
        attrs: ['Type=Organic'],
        weightGrams: 150,
      },
    ],
  },
  {
    slug: 'instant-coffee',
    name: 'Classic Instant Coffee',
    category: 'tea-coffee',
    brand: 'Desert Gold',
    tags: ['imported'],
    short: 'Rich instant coffee granules in a resealable jar.',
    description: 'One spoon per cup. Add hot water, milk and sugar to taste.',
    shelfLife: '24 months',
    origin: 'Malaysia',
    variants: [
      {
        sku: 'DG-COFFEE-50',
        unit: 'G',
        unitValue: '50',
        price: '320',
        initialStock: 25,
        weightGrams: 220,
      },
      {
        sku: 'DG-COFFEE-200',
        unit: 'G',
        unitValue: '200',
        price: '980',
        initialStock: 12,
        weightGrams: 450,
      },
    ],
  },
  {
    slug: 'tuna-chunks-in-oil',
    name: 'Tuna Chunks in Sunflower Oil',
    category: 'canned-fish',
    brand: 'Ocean Pearl',
    tags: ['imported', 'halal'],
    short: 'Tender tuna chunks, ready for salads and sandwiches.',
    description: 'Drain the oil before use. Once opened, keep in the fridge and use within 2 days.',
    ingredients: 'Tuna (70%), sunflower oil, salt',
    facts: [
      { name: 'Protein', amount: '25 g per 100 g' },
      { name: 'Fat', amount: '9 g' },
    ],
    shelfLife: '36 months',
    origin: 'Thailand',
    flags: { isBestSeller: true },
    variants: [
      {
        sku: 'OP-TUNA-185',
        unit: 'G',
        unitValue: '185',
        price: '260',
        salePrice: '240',
        initialStock: 120,
        weightGrams: 230,
      },
    ],
  },
  {
    slug: 'sardines-in-tomato-sauce',
    name: 'Sardines in Tomato Sauce',
    category: 'canned-fish',
    brand: 'Ocean Pearl',
    tags: ['imported'],
    short: 'Whole sardines in a rich tomato sauce.',
    description: 'Heat gently or eat cold with bread.',
    ingredients: 'Sardines, tomato paste, water, vegetable oil, salt',
    shelfLife: '36 months',
    origin: 'Morocco',
    variants: [
      {
        sku: 'OP-SARDINE-155',
        unit: 'G',
        unitValue: '155',
        price: '190',
        initialStock: 3,
        lowStockThreshold: 10,
        weightGrams: 200,
      },
    ],
  },
  {
    slug: 'pineapple-slices',
    name: 'Pineapple Slices in Syrup',
    category: 'canned-fruits',
    brand: 'Green Valley',
    tags: ['imported'],
    short: 'Sweet pineapple rings in light syrup.',
    description: 'Serve chilled, or use for desserts and cakes.',
    shelfLife: '24 months',
    origin: 'Thailand',
    variants: [
      {
        sku: 'GV-PINEAPPLE-565',
        unit: 'G',
        unitValue: '565',
        price: '330',
        initialStock: 40,
        weightGrams: 650,
      },
    ],
  },
  {
    slug: 'fruit-cocktail',
    name: 'Fruit Cocktail',
    category: 'canned-fruits',
    brand: 'Green Valley',
    short: 'Peach, pear, pineapple, grapes and cherries in syrup.',
    description: 'A ready-made fruit salad. Serve chilled.',
    shelfLife: '24 months',
    origin: 'Thailand',
    flags: { isNewArrival: true },
    variants: [
      {
        sku: 'GV-COCKTAIL-820',
        unit: 'G',
        unitValue: '820',
        price: '450',
        initialStock: 22,
        weightGrams: 920,
      },
    ],
  },
  {
    slug: 'medjool-dates',
    name: 'Medjool Dates',
    category: 'dry-fruits-nuts',
    brand: 'Desert Gold',
    tags: ['imported', 'gift-idea'],
    short: 'Large, soft and naturally sweet dates.',
    description: 'Ideal for iftar and gifting.\n\n- Premium grade\n- No added sugar',
    ingredients: '100% Medjool dates',
    shelfLife: '12 months',
    origin: 'Saudi Arabia',
    flags: { isFeatured: true },
    variants: [
      {
        sku: 'DG-DATES-500',
        unit: 'G',
        unitValue: '500',
        price: '950',
        initialStock: 30,
        weightGrams: 560,
      },
      {
        sku: 'DG-DATES-1KG',
        unit: 'KG',
        unitValue: '1',
        price: '1800',
        salePrice: '1650',
        initialStock: 15,
        weightGrams: 1100,
      },
    ],
  },
  {
    slug: 'roasted-almonds',
    name: 'Roasted Almonds',
    category: 'dry-fruits-nuts',
    brand: 'Desert Gold',
    tags: ['imported'],
    short: 'Crunchy dry-roasted almonds, lightly salted.',
    description: 'A healthy snack. Keep the pack closed after opening.',
    ingredients: 'Almonds, salt',
    shelfLife: '9 months',
    origin: 'USA',
    variants: [
      {
        sku: 'DG-ALMOND-250',
        unit: 'G',
        unitValue: '250',
        price: '480',
        initialStock: 35,
        weightGrams: 280,
      },
      {
        sku: 'DG-ALMOND-500',
        unit: 'G',
        unitValue: '500',
        price: '920',
        initialStock: 18,
        weightGrams: 540,
      },
    ],
  },
  {
    slug: 'pure-cow-ghee',
    name: 'Pure Cow Ghee',
    category: 'cooking-essentials',
    brand: 'Sundar Farms',
    tags: ['halal'],
    short: 'Traditional ghee with a rich aroma, made from cow milk butter.',
    description: 'For cooking, polao and sweets. Store away from direct sunlight.',
    ingredients: '100% cow milk fat',
    shelfLife: '12 months',
    origin: 'Bangladesh',
    flags: { isBestSeller: true },
    variants: [
      {
        sku: 'SF-GHEE-200',
        unit: 'G',
        unitValue: '200',
        price: '420',
        initialStock: 30,
        weightGrams: 260,
      },
      {
        sku: 'SF-GHEE-400',
        unit: 'G',
        unitValue: '400',
        price: '780',
        initialStock: 25,
        weightGrams: 480,
      },
    ],
  },
  {
    slug: 'mustard-oil',
    name: 'Cold Pressed Mustard Oil',
    category: 'cooking-essentials',
    brand: 'Sundar Farms',
    short: 'Pungent ghani-pressed mustard oil.',
    description: 'For cooking, pickles and bharta.',
    shelfLife: '12 months',
    origin: 'Bangladesh',
    variants: [
      {
        sku: 'SF-MUSTOIL-500',
        unit: 'ML',
        unitValue: '500',
        price: '210',
        initialStock: 50,
        weightGrams: 560,
      },
      {
        sku: 'SF-MUSTOIL-1L',
        unit: 'L',
        unitValue: '1',
        price: '390',
        initialStock: 40,
        weightGrams: 1050,
      },
    ],
  },
  {
    slug: 'corn-flakes',
    name: 'Corn Flakes',
    category: 'breakfast',
    brand: 'Morning Malt',
    short: 'Crispy toasted corn flakes, a classic breakfast.',
    description: 'Serve with cold milk and fruit.',
    ingredients: 'Corn, sugar, salt, malt extract, vitamins',
    shelfLife: '12 months',
    origin: 'India',
    variants: [
      {
        sku: 'MM-CORNFLAKES-475',
        unit: 'G',
        unitValue: '475',
        price: '420',
        initialStock: 28,
        weightGrams: 520,
      },
    ],
  },
  {
    slug: 'rolled-oats',
    name: 'Rolled Oats',
    category: 'breakfast',
    brand: 'Green Valley',
    tags: ['organic', 'sugar-free'],
    short: 'Whole grain oats for porridge and baking.',
    description: 'Cook with milk or water for 3 minutes.',
    shelfLife: '12 months',
    origin: 'Australia',
    status: 'DRAFT',
    variants: [
      {
        sku: 'GV-OATS-500',
        unit: 'G',
        unitValue: '500',
        price: '350',
        initialStock: 0,
        attrs: ['Type=Organic'],
        weightGrams: 540,
      },
    ],
  },
];

/** A plain placeholder image (colour block and initials); real photos replace it later. */
async function placeholder(name: string, color: string): Promise<Buffer> {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000">
  <rect width="1000" height="1000" fill="${color}"/>
  <circle cx="500" cy="440" r="250" fill="#ffffff" fill-opacity="0.18"/>
  <text x="500" y="520" font-family="Arial, Helvetica, sans-serif" font-size="230" font-weight="700" fill="#ffffff" text-anchor="middle">${initials}</text>
  <text x="500" y="850" font-family="Arial, Helvetica, sans-serif" font-size="56" fill="#ffffff" fill-opacity="0.85" text-anchor="middle">Demo image</text>
</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
}

async function main() {
  const admin = await prisma.adminUser.findFirst({
    where: { isActive: true, role: { isSystem: true } },
    orderBy: { createdAt: 'asc' },
  });
  if (!admin)
    throw new Error(
      'No Super Admin found: run pnpm db:seed first (with SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD).',
    );
  const actor: Actor = {
    adminUserId: admin.id,
    ipAddress: '127.0.0.1',
    isSuperAdmin: true,
    permissions: [],
  };
  const catalog = { prisma, publicMediaUrl: deps.publicMediaUrl };

  // Categories (parents first, as listed).
  const categoryId = new Map<string, string>();
  for (const c of CATEGORIES) {
    const existing = await prisma.category.findUnique({ where: { slug: c.slug } });
    const id =
      existing?.id ??
      (
        await createCategory(catalog, actor, {
          name: c.name,
          slug: c.slug,
          parentId: c.parent ? categoryId.get(c.parent) : null,
        })
      ).id;
    categoryId.set(c.slug, id);
  }

  const brandId = new Map<string, string>();
  for (const name of BRANDS) {
    const slug = name.toLowerCase().replace(/\s+/g, '-');
    const existing = await prisma.brand.findUnique({ where: { slug } });
    brandId.set(name, existing?.id ?? (await createBrand(prisma, actor, { name, slug }))!.id);
  }

  const tagId = new Map<string, string>();
  for (const name of TAGS) {
    const slug = name.toLowerCase().replace(/\s+/g, '-');
    const existing = await prisma.tag.findUnique({ where: { slug } });
    tagId.set(slug, existing?.id ?? (await createTag(prisma, actor, { name, slug }))!.id);
  }

  const valueId = new Map<string, string>(); // "Flavor=Plain" -> id
  for (const [name, values] of Object.entries(ATTRIBUTES)) {
    let attr = await prisma.attribute.findUnique({ where: { name }, include: { values: true } });
    if (!attr) {
      await createAttribute(prisma, actor, { name, isFilterable: true });
      attr = await prisma.attribute.findUniqueOrThrow({
        where: { name },
        include: { values: true },
      });
    }
    for (const value of values) {
      if (!attr.values.some((v) => v.value === value))
        await addAttributeValue(prisma, actor, attr.id, { value });
    }
    for (const v of await prisma.attributeValue.findMany({ where: { attributeId: attr.id } }))
      valueId.set(`${name}=${v.value}`, v.id);
  }

  let created = 0;
  for (const p of PRODUCTS) {
    if (await prisma.product.findUnique({ where: { slug: p.slug } })) continue;
    const color = CATEGORIES.find((c) => c.slug === p.category)?.color ?? '#525252';
    const product = await createProduct(catalog, actor, {
      name: p.name,
      slug: p.slug,
      categoryId: categoryId.get(p.category)!,
      brandId: brandId.get(p.brand)!,
      tagIds: (p.tags ?? []).map((t) => tagId.get(t)!),
      status: p.status ?? 'ACTIVE',
      shortDescription: p.short,
      description: p.description,
      ingredients: p.ingredients ?? null,
      nutritionFacts: p.facts ?? null,
      shelfLife: p.shelfLife ?? null,
      origin: p.origin ?? null,
      isFeatured: p.flags?.isFeatured ?? false,
      isNewArrival: p.flags?.isNewArrival ?? false,
      isBestSeller: p.flags?.isBestSeller ?? false,
      variants: p.variants.map(({ attrs, ...v }) => ({
        ...v,
        attributeValueIds: (attrs ?? []).map((a) => valueId.get(a)!),
      })),
    });
    const media = await uploadMedia(deps, actor, {
      body: await placeholder(p.name, color),
      altText: `${p.name} (demo image)`,
    });
    await setProductImages(catalog, actor, product.id, [media.id]);
    created += 1;
  }
  console.log(
    `Demo catalog ready: ${created} new products (${PRODUCTS.length - created} already there).`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => deps.close());
