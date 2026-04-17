import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { clock, resetClock } from '../src/util/clock.js';

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sophie-parity-'));
  process.env.SOPHIE_DATA_DIR = tmpDir;
  process.env.SOPHIE_DB_PATH = path.join(tmpDir, 'test.db');
  process.env.SOPHIE_PHOTO_ROOT = path.join(tmpDir, 'photos');
  process.env.SOPHIE_BACKUP_ROOT = path.join(tmpDir, 'backups');
  process.env.SOPHIE_LOG_DIR = path.join(tmpDir, 'logs');
  process.env.NODE_ENV = 'test';
});

afterAll(() => {
  resetClock();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('alerts parity: SQL flags must agree with JS predicates', () => {
  it('matches is_low_stock / is_expired / is_expiring_soon row-by-row', async () => {
    const { openDb, runMigrations } = await import('../src/db/sqlite.js');
    const { ensureDirs, config } = await import('../src/config.js');
    const { createType } = await import('../src/services/types-service.js');
    const { createRoom, createLocation } = await import('../src/services/locations-service.js');
    const { createItem } = await import('../src/services/items-service.js');
    const { searchItems } = await import('../src/services/search-service.js');
    const { isExpiredJS, isExpiringSoonJS, isLowStockJS } = await import(
      '../src/services/alerts-service.js'
    );
    const { getSettings } = await import('../src/services/settings-service.js');

    ensureDirs();
    const db = openDb(config.dbPath);
    runMigrations(db);

    const typeA = createType(db, {
      name: 'ParityA',
      default_unit: 'g',
      default_low_stock_threshold: 5,
    });
    const typeB = createType(db, { name: 'ParityB', default_unit: 'pcs' });
    const room = createRoom(db, {
      name: 'ParityRoom',
      shape_on_plan: { type: 'rect', x: 0, y: 0, w: 200, h: 200 },
    });
    const loc = createLocation(db, {
      name: 'ParityLoc',
      room_id: room.id,
      shape_on_plan: { type: 'rect', x: 10, y: 10, w: 40, h: 40 },
    });

    const today = '2026-04-17';
    clock.todayIso = () => today;
    const expiredDate = '2026-04-10';
    const soonDate = '2026-04-20'; // within 7 day window
    const farDate = '2027-01-01';

    // Matrix: varying thresholds (inherit/item/null), varying quantities and dates.
    const items = [
      // inherits threshold 5 from typeA; quantity 3 → low stock; no expiry
      createItem(db, {
        name: 'inherit_low',
        item_type_id: typeA.id,
        storage_location_id: loc.id,
        quantity: 3,
      }),
      // overrides threshold on item = 1; quantity 2 → NOT low stock
      createItem(db, {
        name: 'override_ok',
        item_type_id: typeA.id,
        storage_location_id: loc.id,
        quantity: 2,
        low_stock_threshold: 1,
      }),
      // typeB has no default threshold and no item override → never low-stock
      createItem(db, {
        name: 'no_threshold_zero',
        item_type_id: typeB.id,
        storage_location_id: loc.id,
        quantity: 0,
      }),
      // expired
      createItem(db, {
        name: 'expired',
        item_type_id: typeB.id,
        storage_location_id: loc.id,
        quantity: 5,
        expiration_date: expiredDate,
      }),
      // expiring soon
      createItem(db, {
        name: 'soon',
        item_type_id: typeB.id,
        storage_location_id: loc.id,
        quantity: 5,
        expiration_date: soonDate,
      }),
      // far future
      createItem(db, {
        name: 'far',
        item_type_id: typeB.id,
        storage_location_id: loc.id,
        quantity: 5,
        expiration_date: farDate,
      }),
      // equal to threshold edge — typeA default=5, quantity=5 → low-stock TRUE
      createItem(db, {
        name: 'edge_equal',
        item_type_id: typeA.id,
        storage_location_id: loc.id,
        quantity: 5,
      }),
    ];

    const settings = getSettings(db);
    const res = searchItems(db, { page_size: 200 });
    // Confirm every searched row's SQL-derived flags match the JS predicates.
    for (const row of res.items) {
      const sourceItem = items.find((it) => it.name === row.name)!;
      const typeDefault =
        row.item_type_id === typeA.id ? (typeA.default_low_stock_threshold ?? null) : null;

      const jsLow = isLowStockJS(row.quantity, sourceItem.low_stock_threshold, typeDefault);
      const jsExpired = isExpiredJS(row.expiration_date, today);
      const jsSoon = isExpiringSoonJS(
        row.expiration_date,
        today,
        settings.expiring_soon_window_days,
      );

      expect({ name: row.name, low: row.is_low_stock }).toEqual({ name: row.name, low: jsLow });
      expect({ name: row.name, expired: row.is_expired }).toEqual({
        name: row.name,
        expired: jsExpired,
      });
      expect({ name: row.name, soon: row.is_expiring_soon }).toEqual({
        name: row.name,
        soon: jsSoon,
      });
    }
  });
});
