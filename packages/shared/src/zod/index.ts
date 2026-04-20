import { z } from 'zod';

const NAME_60 = z.string().trim().min(1).max(60);
const NAME_120 = z.string().trim().min(1).max(120);
const UNIT = z.string().trim().min(1).max(16).regex(/^[a-zA-Z%°µ]+$/, 'unit must be letters or %°µ');
const COLOR = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color must be #RRGGBB');
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');
const NON_NEG = z.number().finite().nonnegative();
const POS = z.number().finite().positive();
const ID = z.string().min(1).max(64);

export const rectShapeZ = z.object({
  type: z.literal('rect'),
  x: z.number().finite(),
  y: z.number().finite(),
  w: POS,
  h: POS,
});

export const polygonShapeZ = z.object({
  type: z.literal('polygon'),
  points: z
    .array(z.tuple([z.number().finite(), z.number().finite()]))
    .min(3),
});

export const shapeZ = z.discriminatedUnion('type', [rectShapeZ, polygonShapeZ]);

export const itemCreateZ = z.object({
  name: NAME_120,
  item_type_id: ID,
  storage_location_id: ID,
  quantity: NON_NEG.optional(),
  unit: UNIT.optional(),
  expiration_date: DATE.nullable().optional(),
  low_stock_threshold: NON_NEG.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  photo_ids: z.array(ID).max(10).optional(),
});

export const itemPatchZ = z
  .object({
    name: NAME_120.optional(),
    item_type_id: ID.optional(),
    storage_location_id: ID.optional(),
    quantity: NON_NEG.optional(),
    unit: UNIT.optional(),
    expiration_date: DATE.nullable().optional(),
    low_stock_threshold: NON_NEG.nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    photo_ids: z.array(ID).max(10).optional(),
    base_updated_at: z.string().optional(),
  })
  .strict();

export const quantityOpZ = z.object({
  op: z.enum(['increment', 'decrement', 'set']),
  amount: z.number().finite(),
  reason: z.enum(['manual', 'quick_add', 'shopping_restock', 'import']).optional(),
});

export const itemTypeCreateZ = z.object({
  name: NAME_60,
  default_unit: UNIT,
  default_low_stock_threshold: NON_NEG.nullable().optional(),
  icon: z.string().max(32).regex(/^[^<>]*$/).nullable().optional(),
  color: COLOR.nullable().optional(),
});

export const itemTypePatchZ = itemTypeCreateZ
  .partial()
  .extend({ base_updated_at: z.string().optional() })
  .strict();

export const itemTypeMergeZ = z.object({ target_id: ID });

export const roomCreateZ = z.object({
  name: NAME_60,
  shape_on_plan: shapeZ,
});

export const roomPatchZ = roomCreateZ
  .partial()
  .extend({ base_updated_at: z.string().optional() })
  .strict();

export const locationCreateZ = z.object({
  name: NAME_60,
  room_id: ID,
  shape_on_plan: shapeZ,
});

export const locationPatchZ = locationCreateZ
  .partial()
  .extend({ base_updated_at: z.string().optional() })
  .strict();

export const doorZ = z.object({
  id: z.string(),
  room_id: ID,
  wall: z.enum(['north', 'south', 'east', 'west']),
  t: z.number().finite().min(0).max(1),
  width: POS,
});
export const doorsZ = z.array(doorZ);

export const floorPlanPatchZ = z
  .object({
    name: NAME_60.optional(),
    width: POS.optional(),
    height: POS.optional(),
    background_image_photo_id: ID.nullable().optional(),
    doors: doorsZ.optional(),
    base_updated_at: z.string().optional(),
  })
  .strict();

export const floorPlanEditOpZ = z.discriminatedUnion('op', [
  z.object({ op: z.literal('create_room'), temp_id: z.string(), name: NAME_60, shape_on_plan: shapeZ }),
  z.object({ op: z.literal('update_room'), id: ID, name: NAME_60.optional(), shape_on_plan: shapeZ.optional() }),
  z.object({ op: z.literal('delete_room'), id: ID }),
  z.object({ op: z.literal('create_location'), temp_id: z.string(), name: NAME_60, room_id: z.string(), shape_on_plan: shapeZ }),
  z.object({ op: z.literal('update_location'), id: ID, name: NAME_60.optional(), room_id: ID.optional(), shape_on_plan: shapeZ.optional() }),
  z.object({ op: z.literal('delete_location'), id: ID }),
]);

export const floorPlanEditSessionZ = z.object({
  plan: floorPlanPatchZ.optional(),
  ops: z.array(floorPlanEditOpZ),
});

export const shoppingEntryCreateZ = z.object({
  label: NAME_120,
});

export const shoppingEntryPatchZ = z
  .object({
    label: NAME_120.optional(),
    checked: z.boolean().optional(),
    base_updated_at: z.string().optional(),
  })
  .strict();

export const shoppingAutoCheckZ = z.object({
  item_id: ID,
  checked: z.boolean(),
});

export const restockItemZ = z.object({
  item_id: ID,
  restock_amount: NON_NEG.optional(),
  new_expiration_date: DATE.nullable().optional(),
  new_quantity: NON_NEG.optional(),
  action: z.enum(['restock', 'update_expiry', 'delete_item']).optional(),
});

export const restockConfirmZ = z.object({
  items: z.array(restockItemZ),
  manual_entry_ids: z.array(ID).optional(),
});

export const settingsPatchZ = z
  .object({
    expiring_soon_window_days: z.number().int().min(1).max(90).optional(),
    quick_add_default_type_id: ID.nullable().optional(),
    quick_add_default_location_id: ID.nullable().optional(),
    quick_add_default_unit: UNIT.nullable().optional(),
  })
  .strict();

export const itemSearchQueryZ = z.object({
  q: z.string().optional(),
  item_type_id: z.union([z.string(), z.array(z.string())]).optional(),
  storage_location_id: z.union([z.string(), z.array(z.string())]).optional(),
  room_id: z.union([z.string(), z.array(z.string())]).optional(),
  expires_within_days: z.coerce.number().int().min(0).optional(),
  low_stock_only: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),
  has_photo: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),
  sort: z
    .enum(['relevance', 'name_asc', 'name_desc', 'updated_desc', 'expiration_asc', 'quantity_asc', 'quantity_desc'])
    .optional(),
  page: z.coerce.number().int().min(1).optional(),
  page_size: z.coerce.number().int().min(1).max(200).optional(),
});

export const autocompleteQueryZ = z.object({
  q: z.string(),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

export const restoreConfirmZ = z.object({
  confirm: z.literal('REPLACE ALL DATA'),
});

export type ItemCreate = z.infer<typeof itemCreateZ>;
export type ItemPatch = z.infer<typeof itemPatchZ>;
export type ItemTypeCreate = z.infer<typeof itemTypeCreateZ>;
export type ItemTypePatch = z.infer<typeof itemTypePatchZ>;
export type RoomCreate = z.infer<typeof roomCreateZ>;
export type RoomPatch = z.infer<typeof roomPatchZ>;
export type LocationCreate = z.infer<typeof locationCreateZ>;
export type LocationPatch = z.infer<typeof locationPatchZ>;
export type FloorPlanPatch = z.infer<typeof floorPlanPatchZ>;
export type FloorPlanEditOp = z.infer<typeof floorPlanEditOpZ>;
export type FloorPlanEditSession = z.infer<typeof floorPlanEditSessionZ>;
export type ShoppingEntryCreate = z.infer<typeof shoppingEntryCreateZ>;
export type ShoppingEntryPatch = z.infer<typeof shoppingEntryPatchZ>;
export type RestockConfirm = z.infer<typeof restockConfirmZ>;
export type SettingsPatch = z.infer<typeof settingsPatchZ>;
export type QuantityOp = z.infer<typeof quantityOpZ>;
export type ItemSearchQuery = z.infer<typeof itemSearchQueryZ>;
