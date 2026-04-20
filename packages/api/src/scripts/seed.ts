import { config, ensureDirs } from '../config.js';
import { openPool, getPool, runMigrations } from '../db/postgres.js';
import { initS3, ensureBucket } from '../storage/s3.js';
import { createType } from '../services/types-service.js';
import { createRoom, createLocation } from '../services/locations-service.js';
import { createItem } from '../services/items-service.js';

const ITEM_TYPES = [
  { name: 'Spice', default_unit: 'g' },
  { name: 'Pantry', default_unit: 'g' },
  { name: 'Cleaning', default_unit: 'pcs' },
  { name: 'Battery', default_unit: 'pcs' },
  { name: 'Beverage', default_unit: 'ml' },
];

const ROOM_NAMES = ['Kitchen', 'Pantry', 'Garage', 'Bathroom', 'Closet'];

async function main() {
  ensureDirs();
  openPool(config.databaseUrl);
  initS3(config.minioEndpoint, config.minioAccessKey, config.minioSecretKey, config.minioBucket);
  await ensureBucket();
  await runMigrations(getPool());

  const db = getPool();

  const types = await Promise.all(ITEM_TYPES.map((t) => createType(db, t)));
  const rooms = await Promise.all(
    ROOM_NAMES.map((name, i) =>
      createRoom(db, {
        name,
        shape_on_plan: { type: 'rect', x: (i % 3) * 300, y: Math.floor(i / 3) * 300, w: 280, h: 280 },
      }),
    ),
  );
  const locations = await Promise.all(
    rooms.flatMap((room) =>
      Array.from({ length: 3 }).map((_, j) =>
        createLocation(db, {
          name: `Shelf ${j + 1}`,
          room_id: room.id,
          shape_on_plan: {
            type: 'rect',
            x: (room.shape_on_plan as { x: number }).x + 10 + j * 90,
            y: (room.shape_on_plan as { y: number }).y + 10,
            w: 80,
            h: 40,
          },
        }),
      ),
    ),
  );

  const itemNamePool = [
    'Paprika', 'Salt', 'Pepper', 'Cumin', 'Turmeric', 'Oregano', 'Basil', 'Thyme',
    'Rice', 'Pasta', 'Flour', 'Sugar', 'Honey', 'Soy sauce', 'Olive oil', 'Vinegar',
    'Detergent', 'Soap', 'Sponges', 'Bleach', 'Bin liners', 'Paper towels',
    'AA Battery', 'AAA Battery', '9V Battery',
    'Tea', 'Coffee', 'Milk', 'Juice', 'Sparkling water',
  ];
  const count = Number(process.env.SOPHIE_SEED_COUNT || 200);
  for (let i = 0; i < count; i++) {
    const base = itemNamePool[i % itemNamePool.length]!;
    const type = types[i % types.length]!;
    const loc = locations[i % locations.length]!;
    await createItem(db, {
      name: `${base}${i < itemNamePool.length ? '' : ` #${Math.floor(i / itemNamePool.length)}`}`,
      item_type_id: type.id,
      storage_location_id: loc.id,
      quantity: (i % 10) + 1,
      unit: type.default_unit,
      expiration_date: i % 5 === 0 ? new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10) : null,
      low_stock_threshold: i % 7 === 0 ? 2 : null,
    });
  }
  console.log(`seeded ${count} items, ${types.length} types, ${rooms.length} rooms, ${locations.length} locations`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
