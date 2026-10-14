import { defineAction, z, type ActionsModule, type Ctx } from "./sdk-compat";
import { and, asc, desc, eq, gt, gte, inArray, like, lt, lte, or, sql } from "drizzle-orm";
import { privileged } from "./privileged";
import seedProducts from "./products.json";
import * as schema from "./schema";

const imageUrlList = z.array(z.string().trim().url().max(2000)).max(30).default([]);

function parseImageUrls(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim()).slice(0, 30);
  } catch {
    return [];
  }
}

function cleanImageUrls(urls: string[] | undefined): string[] {
  if (!urls) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    const clean = url.trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= 30) break;
  }
  return out;
}

function resolvedDescription(input: { description?: string; full_description?: string }): string {
  if (input.full_description !== undefined && input.full_description.trim().length > 0) return input.full_description.trim();
  return (input.description ?? "").trim();
}

function resolvedImageUrls(input: { image_urls?: string[]; images?: string[] }): string[] {
  if (input.image_urls !== undefined) return cleanImageUrls(input.image_urls);
  if (input.images !== undefined) return cleanImageUrls(input.images);
  return [];
}

function hasImageInput(input: { image_urls?: string[]; images?: string[] }): boolean {
  return input.image_urls !== undefined || input.images !== undefined;
}

// Tags arrive from Shopify as a comma-separated string and from the app as
// an array; both normalize to a deduped list of trimmed tags. Stored as JSON.
const tagsInput = z.union([
  z.string().trim().max(5000),
  z.array(z.string().trim().max(120)).max(50),
]);

function cleanTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const clean = raw.trim();
    if (!clean || clean.length > 120) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= 50) break;
  }
  return out;
}

function normalizeTagsInput(input: string | string[] | undefined): string[] {
  if (input === undefined) return [];
  if (typeof input === "string") return cleanTags(input.split(",").map((part) => part.trim()));
  return cleanTags(input);
}

function parseTags(raw: string | null | undefined): string[] {
  if (!raw || !raw.trim()) return [];
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return cleanTags(parsed.filter((value): value is string => typeof value === "string"));
    } catch {
      return [];
    }
  }
  // Legacy / hand-entered comma-separated fallback.
  return cleanTags(trimmed.split(",").map((part) => part.trim()));
}

const productSchema = z.object({
  id: z.number(),
  title: z.string(),
  short_description: z.string(),
  description: z.string(),
  full_description: z.string(),
  tags: z.array(z.string()),
  image_urls: z.array(z.string()),
  images: z.array(z.string()),
  vendor: z.string(),
  part_number: z.string(),
  sku: z.string(),
  medco_part_number: z.string(),
  oak_part_number: z.string(),
  thumbnail_url: z.string().nullable(),
  barcode: z.string().nullable(),
  quantity: z.number(),
  inbound_qty: z.number(),
  medco_cost_cents: z.number(),
  oak_cost_cents: z.number(),
  medco_moq: z.number(),
  oak_moq: z.number(),
  medco_available: z.boolean(),
  oak_available: z.boolean(),
  par_level: z.number(),
  shortage: z.number(),
  msrp_cents: z.number(),
  price_cents: z.number(),
  cost_cents: z.number(),
  markup_bps: z.number(),
  markup_override_bps: z.number().nullable(),
  status: z.enum(["active", "draft"]),
  updated_at: z.string(),
});

const productPricingFields = z.object({
  title: z.string().trim().min(1).max(220),
  short_description: z.string().trim().max(300).default(""),
  description: z.string().trim().max(50000).default(""),
  full_description: z.string().trim().max(50000).optional(),
  tags: tagsInput.optional(),
  image_urls: imageUrlList.optional(),
  images: z.array(z.string().trim().url().max(2000)).max(30).optional(),
  vendor: z.string().trim().max(160).default(""),
  part_number: z.string().trim().max(120).default(""),
  sku: z.string().trim().max(120).default(""),
  medco_part_number: z.string().trim().max(120).default(""),
  oak_part_number: z.string().trim().max(120).default(""),
  medco_cost_cents: z.number().int().min(0).max(100000000).default(0),
  oak_cost_cents: z.number().int().min(0).max(100000000).default(0),
  medco_moq: z.number().int().min(1).max(9999).default(1),
  oak_moq: z.number().int().min(1).max(9999).default(1),
  medco_available: z.boolean().default(true),
  oak_available: z.boolean().default(true),
  barcode: z.string().trim().max(120).nullable().default(null),
  msrp_cents: z.number().int().min(0).max(100000000),
  price_cents: z.number().int().min(0).max(100000000),
  cost_cents: z.number().int().min(0).max(100000000),
  markup_bps: z.number().int().min(-10000).max(1000000),
  status: z.enum(["active", "draft"]).default("active"),
});

type ProductRow = typeof schema.products.$inferSelect;

async function presentProduct(ctx: Ctx, row: ProductRow) {
  const uploadedUrl = row.imageBlobKey ? await ctx.blobs.getUrl(row.imageBlobKey, { expiresInSeconds: 3600 }) : null;
  const storedImages = parseImageUrls(row.imageUrls);
  const gallery: string[] = [];
  const pushUnique = (url: string | null | undefined) => {
    const clean = url?.trim();
    if (clean && !gallery.includes(clean)) gallery.push(clean);
  };
  pushUnique(uploadedUrl);
  for (const url of storedImages) pushUnique(url);
  pushUnique(row.thumbnailUrl);
  const thumbnailUrl = uploadedUrl ?? row.thumbnailUrl ?? gallery[0] ?? null;
  const fullDescription = row.description ?? "";
  return {
    id: row.id,
    title: row.title,
    short_description: row.shortDescription || row.title,
    description: fullDescription,
    full_description: fullDescription,
    tags: parseTags(row.tags),
    image_urls: gallery,
    images: gallery,
    vendor: row.vendor,
    part_number: row.partNumber,
    sku: row.sku,
    medco_part_number: row.medcoPartNumber,
    oak_part_number: row.oakPartNumber,
    thumbnail_url: thumbnailUrl,
    barcode: row.barcode,
    quantity: row.quantity,
    inbound_qty: row.inboundQty,
    medco_cost_cents: row.medcoCostCents,
    oak_cost_cents: row.oakCostCents,
    medco_moq: row.medcoMoq,
    oak_moq: row.oakMoq,
    medco_available: row.medcoAvailable === 1,
    oak_available: row.oakAvailable === 1,
    par_level: row.parLevel,
    shortage: Math.max(0, row.parLevel - row.quantity - row.inboundQty),
    msrp_cents: row.msrpCents,
    price_cents: row.priceCents,
    cost_cents: row.costCents,
    markup_bps: row.markupBps,
    markup_override_bps: row.markupOverrideBps ?? null,
    status: row.status,
    updated_at: row.updatedAt.toISOString(),
  };
}

const updateResponse = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  product: productSchema.nullable(),
});

const customerFieldsSchema = z.object({
  name: z.string().trim().min(1).max(140),
  business_name: z.string().trim().max(180).default(""),
  phone: z.string().trim().max(60).default(""),
  email: z.string().trim().max(180).default(""),
  tax_id: z.string().trim().max(80).default(""),
  delivery_street: z.string().trim().max(220).default(""),
  delivery_city: z.string().trim().max(120).default(""),
  delivery_state: z.string().trim().max(80).default(""),
  delivery_zip: z.string().trim().max(24).default(""),
  ap_name: z.string().trim().max(140).default(""),
  ap_phone: z.string().trim().max(60).default(""),
  ap_email: z.string().trim().max(180).default(""),
  card_last4: z.string().trim().regex(/^$|^\d{4}$/, "Card last 4 must be exactly four digits."),
  card_expiry: z.string().trim().regex(/^$|^\d{4}-(0[1-9]|1[0-2])$/, "Card expiry must be a valid month."),
  cardholder_name: z.string().trim().max(140).default(""),
  tax_status: z.enum(["taxable", "exempt"]),
  tax_rate_override_bps: z.number().int().min(0).max(3000).nullable(),
  print_balance_due: z.boolean().default(true),
  notes: z.string().trim().max(2000).default(""),
});

const customerSchema = z.object({
  id: z.number(),
  ...customerFieldsSchema.shape,
  tax_rate_bps: z.number(),
  tax_rate_source: z.enum(["exempt", "override", "state", "unconfigured"]),
  balance_cents: z.number(),
  open_wishlist_count: z.number(),
  created_at: z.string(),
});

const wishlistItemSchema = z.object({
  id: z.number(),
  customer_id: z.number(),
  product_id: z.number().nullable(),
  title: z.string(),
  notes: z.string(),
  status: z.enum(["open", "done"]),
  created_at: z.string(),
  done_at: z.string().nullable(),
  product_price_cents: z.number().nullable(),
  product_part_number: z.string().nullable(),
  product_in_stock: z.number().nullable(),
});

const wishlistResponse = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  item: wishlistItemSchema.nullable(),
});

// ── Tasks / Daily Ops ──────────────────────────────────────────────────

type TaskRow = typeof schema.tasks.$inferSelect;

const taskSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string(),
  assigned_to: z.string(),
  due_date: z.string().nullable(),
  repeat_pattern: z.enum(["none", "daily", "weekly"]),
  is_completed: z.number(),
  completed_at: z.string().nullable(),
  customer_id: z.number().nullable(),
  customer_name: z.string().nullable(),
  priority: z.enum(["low", "normal", "high"]),
  task_type: z.enum(["task", "sales_call", "visit"]),
  created_by: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

const dailyTaskSchema = taskSchema.extend({
  is_auto: z.boolean(),
  auto_label: z.string().nullable(),
});

const taskResponse = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  task: taskSchema.nullable(),
});

async function presentTask(ctx: Ctx, row: TaskRow): Promise<z.infer<typeof taskSchema>> {
  const db = ctx.db<typeof schema>();
  let customerName: string | null = null;
  if (row.customerId !== null) {
    const [c] = await db.select({ name: schema.customers.name, businessName: schema.customers.businessName })
      .from(schema.customers).where(eq(schema.customers.id, row.customerId)).limit(1);
    if (c) customerName = c.businessName || c.name;
  }
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    assigned_to: row.assignedTo,
    due_date: row.dueDate,
    repeat_pattern: row.repeatPattern,
    is_completed: row.isCompleted,
    completed_at: row.completedAt ? row.completedAt.toISOString() : null,
    customer_id: row.customerId,
    customer_name: customerName,
    priority: row.priority,
    task_type: row.taskType,
    created_by: row.createdBy,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

type CustomerRow = typeof schema.customers.$inferSelect;
type TaxRateSource = "exempt" | "override" | "state" | "unconfigured";

function stateTaxRateBps(state: string): number | null {
  const normalized = state.trim().toUpperCase().replaceAll(".", "");
  if (normalized === "RI" || normalized === "RHODE ISLAND") return 700;
  if (normalized === "MA" || normalized === "MASSACHUSETTS") return 625;
  return null;
}

function resolveCustomerTax(customer: CustomerRow): { rateBps: number; source: TaxRateSource } {
  if (customer.taxStatus === "exempt") return { rateBps: 0, source: "exempt" };
  if (customer.taxRateOverrideBps !== null) return { rateBps: customer.taxRateOverrideBps, source: "override" };
  const stateRate = stateTaxRateBps(customer.deliveryState);
  return stateRate === null ? { rateBps: 0, source: "unconfigured" } : { rateBps: stateRate, source: "state" };
}

type WishlistRow = typeof schema.wishlistItems.$inferSelect;

async function presentWishlistItem(ctx: Ctx, row: WishlistRow): Promise<z.infer<typeof wishlistItemSchema>> {
  const db = ctx.db<typeof schema>();
  let productPrice: number | null = null;
  let productPart: string | null = null;
  let productStock: number | null = null;
  if (row.productId !== null) {
    const [product] = await db.select().from(schema.products).where(eq(schema.products.id, row.productId)).limit(1);
    if (product) {
      productPrice = product.priceCents;
      productPart = product.partNumber || product.sku || null;
      productStock = product.quantity;
    }
  }
  return {
    id: row.id,
    customer_id: row.customerId,
    product_id: row.productId,
    title: row.title,
    notes: row.notes,
    status: row.status,
    created_at: row.createdAt.toISOString(),
    done_at: row.doneAt ? row.doneAt.toISOString() : null,
    product_price_cents: productPrice,
    product_part_number: productPart,
    product_in_stock: productStock,
  };
}

async function openWishlistCount(ctx: Ctx, customerId: number): Promise<number> {
  const db = ctx.db<typeof schema>();
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(schema.wishlistItems).where(and(eq(schema.wishlistItems.customerId, customerId), eq(schema.wishlistItems.status, "open")));
  return Number(row?.count ?? 0);
}

const preferenceItemSchema = z.object({
  product_id: z.number(),
  product_title: z.string(),
  vendor: z.string(),
  part_number: z.string(),
  price_cents: z.number(),
  on_hand: z.number(),
  total_quantity: z.number(),
  order_count: z.number(),
  typical_quantity: z.number(),
  total_spent_cents: z.number(),
  last_bought_at: z.string(),
  last_quantity: z.number(),
});

const manualPreferenceSchema = z.object({
  id: z.number(),
  customer_id: z.number(),
  product_id: z.number().nullable(),
  title: z.string(),
  note: z.string(),
  pinned: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  product_price_cents: z.number().nullable(),
  product_part_number: z.string().nullable(),
  product_in_stock: z.number().nullable(),
});

const manualPreferenceResponse = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  preference: manualPreferenceSchema.nullable(),
});

const customerPreferencesResponse = z.object({
  customer_id: z.number(),
  customer_label: z.string(),
  has_history: z.boolean(),
  total_orders: z.number(),
  summary: z.string(),
  top_title: z.string().nullable(),
  most_bought: z.array(preferenceItemSchema),
  recent: z.array(preferenceItemSchema),
  manual: z.array(manualPreferenceSchema),
});

type ManualPreferenceRow = typeof schema.customerPreferences.$inferSelect;

async function presentManualPreference(ctx: Ctx, row: ManualPreferenceRow): Promise<z.infer<typeof manualPreferenceSchema>> {
  const db = ctx.db<typeof schema>();
  let productPrice: number | null = null;
  let productPart: string | null = null;
  let productStock: number | null = null;
  if (row.productId !== null) {
    const [product] = await db.select().from(schema.products).where(eq(schema.products.id, row.productId)).limit(1);
    if (product) {
      productPrice = product.priceCents;
      productPart = product.partNumber || product.sku || null;
      productStock = product.quantity;
    }
  }
  return {
    id: row.id,
    customer_id: row.customerId,
    product_id: row.productId,
    title: row.title,
    note: row.note,
    pinned: row.pinned === 1,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    product_price_cents: productPrice,
    product_part_number: productPart,
    product_in_stock: productStock,
  };
}

function typicalQuantity(quantities: number[]): number {
  if (quantities.length === 0) return 0;
  const counts = new Map<number, number>();
  for (const qty of quantities) counts.set(qty, (counts.get(qty) ?? 0) + 1);
  let best = quantities[0] ?? 0;
  let bestCount = 0;
  for (const [qty, count] of counts) {
    if (count > bestCount || (count === bestCount && qty > best)) {
      best = qty;
      bestCount = count;
    }
  }
  return best;
}

async function buildCustomerPreferences(ctx: Ctx, customerId: number): Promise<z.infer<typeof customerPreferencesResponse>> {
  const db = ctx.db<typeof schema>();
  const [customer] = await db.select().from(schema.customers).where(eq(schema.customers.id, customerId)).limit(1);
  const customerLabel = customer ? (customer.businessName || customer.name) : "";
  const manualRows = await db.select().from(schema.customerPreferences).where(eq(schema.customerPreferences.customerId, customerId)).orderBy(desc(schema.customerPreferences.pinned), desc(schema.customerPreferences.updatedAt));
  const manual = await Promise.all(manualRows.map((row) => presentManualPreference(ctx, row)));
  if (!customer) {
    return { customer_id: customerId, customer_label: "", has_history: false, total_orders: 0, summary: "", top_title: null, most_bought: [], recent: [], manual };
  }
  const salesRows = await db.select().from(schema.sales).where(eq(schema.sales.customerId, customerId)).orderBy(desc(schema.sales.createdAt));
  const saleIds = salesRows.map((row) => row.id);
  const saleById = new Map(salesRows.map((row) => [row.id, row]));
  const itemRows = saleIds.length > 0 ? await db.select().from(schema.saleItems).where(inArray(schema.saleItems.saleId, saleIds)) : [];
  const returnRows = saleIds.length > 0 ? await db.select().from(schema.returns).where(inArray(schema.returns.saleId, saleIds)) : [];
  const returnIds = returnRows.map((row) => row.id);
  const returnItemRows = returnIds.length > 0 ? await db.select().from(schema.returnItems).where(inArray(schema.returnItems.returnId, returnIds)) : [];
  const returnedByProduct = new Map<number, { qty: number; cents: number }>();
  for (const item of returnItemRows) {
    const current = returnedByProduct.get(item.productId) ?? { qty: 0, cents: 0 };
    current.qty += item.quantity;
    current.cents += item.lineTotalCents;
    returnedByProduct.set(item.productId, current);
  }
  type Agg = {
    productId: number;
    title: string;
    grossQty: number;
    grossCents: number;
    saleIds: Set<string>;
    quantities: number[];
    lastBoughtAt: Date;
    lastQuantity: number;
  };
  const byProduct = new Map<number, Agg>();
  // Walk sales newest-first so the first quantity seen per product is its most recent.
  const sortedItems = [...itemRows].sort((a, b) => {
    const aTime = saleById.get(a.saleId)?.createdAt.getTime() ?? 0;
    const bTime = saleById.get(b.saleId)?.createdAt.getTime() ?? 0;
    return bTime - aTime;
  });
  for (const item of sortedItems) {
    const sale = saleById.get(item.saleId);
    if (!sale) continue;
    let agg = byProduct.get(item.productId);
    if (!agg) {
      agg = { productId: item.productId, title: item.productTitle, grossQty: 0, grossCents: 0, saleIds: new Set<string>(), quantities: [], lastBoughtAt: sale.createdAt, lastQuantity: item.quantity };
      byProduct.set(item.productId, agg);
    }
    agg.grossQty += item.quantity;
    agg.grossCents += item.lineTotalCents;
    agg.saleIds.add(item.saleId);
    agg.quantities.push(item.quantity);
    if (sale.createdAt.getTime() > agg.lastBoughtAt.getTime()) {
      agg.lastBoughtAt = sale.createdAt;
      agg.lastQuantity = item.quantity;
    }
  }
  const productIds = [...byProduct.keys()];
  const productRows = productIds.length > 0 ? await db.select().from(schema.products).where(inArray(schema.products.id, productIds)) : [];
  const productById = new Map(productRows.map((row) => [row.id, row]));
  const aggregates: Array<z.infer<typeof preferenceItemSchema>> = [];
  for (const agg of byProduct.values()) {
    const returned = returnedByProduct.get(agg.productId) ?? { qty: 0, cents: 0 };
    const netQty = agg.grossQty - returned.qty;
    if (netQty <= 0) continue;
    const product = productById.get(agg.productId);
    aggregates.push({
      product_id: agg.productId,
      product_title: product?.title ?? agg.title,
      vendor: product?.vendor ?? "",
      part_number: product ? (product.partNumber || product.sku || "") : "",
      price_cents: product?.priceCents ?? 0,
      on_hand: product?.quantity ?? 0,
      total_quantity: netQty,
      order_count: agg.saleIds.size,
      typical_quantity: typicalQuantity(agg.quantities),
      total_spent_cents: Math.max(0, agg.grossCents - returned.cents),
      last_bought_at: agg.lastBoughtAt.toISOString(),
      last_quantity: agg.lastQuantity,
    });
  }
  const mostBought = [...aggregates].sort((a, b) => b.total_quantity - a.total_quantity || b.order_count - a.order_count || b.last_bought_at.localeCompare(a.last_bought_at)).slice(0, 8);
  const recent = [...aggregates].sort((a, b) => b.last_bought_at.localeCompare(a.last_bought_at) || b.total_quantity - a.total_quantity).slice(0, 8);
  const top = mostBought[0] ?? null;
  const summary = top
    ? `${customerLabel} usually buys ${top.product_title} — ${top.total_quantity} bought across ${top.order_count} order${top.order_count === 1 ? "" : "s"}${top.typical_quantity > 0 ? `, typically ${top.typical_quantity} at a time` : ""}.`
    : salesRows.length > 0
      ? `${customerLabel} has ${salesRows.length} order${salesRows.length === 1 ? "" : "s"} on file, but everything bought so far has been returned — no usual items yet.`
      : `${customerLabel} has no orders yet — their usual items will show up here after the first sale.`;
  return {
    customer_id: customerId,
    customer_label: customerLabel,
    has_history: aggregates.length > 0,
    total_orders: salesRows.length,
    summary,
    top_title: top?.product_title ?? null,
    most_bought: mostBought,
    recent,
    manual,
  };
}

function presentCustomer(row: CustomerRow, balanceCents: number, openWishlistCountValue = 0) {
  const tax = resolveCustomerTax(row);
  return {
    id: row.id,
    name: row.name,
    business_name: row.businessName,
    phone: row.phone,
    email: row.email,
    tax_id: row.taxId,
    delivery_street: row.deliveryStreet,
    delivery_city: row.deliveryCity,
    delivery_state: row.deliveryState,
    delivery_zip: row.deliveryZip,
    ap_name: row.apName,
    ap_phone: row.apPhone,
    ap_email: row.apEmail,
    card_last4: row.cardLast4,
    card_expiry: row.cardExpiry,
    cardholder_name: row.cardholderName,
    tax_status: row.taxStatus,
    tax_rate_bps: tax.rateBps,
    tax_rate_override_bps: row.taxRateOverrideBps,
    tax_rate_source: tax.source,
    print_balance_due: row.printBalanceDue === 1,
    notes: row.notes,
    balance_cents: balanceCents,
    open_wishlist_count: openWishlistCountValue,
    created_at: row.createdAt.toISOString(),
  };
}

const salespersonSchema = z.string().trim().min(1).max(80);

const markupRuleSchema = z.object({
  id: z.number(),
  vendor: z.string(),
  is_default: z.boolean(),
  markup_bps: z.number(),
  product_count: z.number(),
  updated_at: z.string(),
});

const priceProposalSchema = z.object({
  id: z.number(),
  product_id: z.number(),
  product_title: z.string(),
  vendor: z.string(),
  old_cost_cents: z.number(),
  new_cost_cents: z.number(),
  old_price_cents: z.number(),
  proposed_price_cents: z.number(),
  markup_bps: z.number(),
  rule_source: z.string(),
  status: z.enum(["pending", "approved", "rejected"]),
  created_at: z.string(),
  decided_at: z.string().nullable(),
});

const salesTeamMemberSchema = z.object({
  id: z.number(),
  name: z.string(),
  commission_bps: z.number(),
  commission_percent: z.number(),
  active: z.boolean(),
  created_at: z.string(),
});

async function ensureSalesTeam(ctx: Ctx) {
  const db = ctx.db<typeof schema>();
  const existing = await db.select().from(schema.salesTeam).orderBy(asc(schema.salesTeam.id));
  if (existing.length > 0) return existing;
  const now = new Date();
  await db.insert(schema.salesTeam).values([
    { name: "Randy", commissionBps: 0, active: 1, createdAt: now, updatedAt: now },
    { name: "Nathan", commissionBps: 0, active: 1, createdAt: now, updatedAt: now },
    { name: "Alan", commissionBps: 0, active: 1, createdAt: now, updatedAt: now },
  ]).onConflictDoNothing({ target: schema.salesTeam.name });
  return db.select().from(schema.salesTeam).orderBy(asc(schema.salesTeam.id));
}

async function effectiveMarkupForProduct(ctx: Ctx, product: ProductRow): Promise<{ markupBps: number; source: string } | null> {
  if (product.markupOverrideBps !== null && product.markupOverrideBps !== undefined) return { markupBps: product.markupOverrideBps, source: "per-item override" };
  const db = ctx.db<typeof schema>();
  const rules = await db.select().from(schema.markupRules);
  const vendorKey = (product.vendor ?? "").trim().toLowerCase();
  const vendorRule = rules.find((r) => r.vendor.trim() !== "" && r.vendor.trim().toLowerCase() === vendorKey);
  if (vendorRule) return { markupBps: vendorRule.markupBps, source: `manufacturer rule — ${vendorRule.vendor}` };
  const defaultRule = rules.find((r) => r.vendor.trim() === "");
  if (defaultRule) return { markupBps: defaultRule.markupBps, source: "default rule" };
  // No rule on the chart covers this product: the product's own markup % is
  // the fixed value. A cost change reprices from it — it never rewrites it.
  return { markupBps: product.markupBps, source: "product markup (no rule set)" };
}

async function maybeCreatePriceProposal(ctx: Ctx, productBefore: ProductRow, newCostCents: number) {
  if (newCostCents === productBefore.costCents || newCostCents <= 0) return null;
  const effective = await effectiveMarkupForProduct(ctx, productBefore);
  if (!effective) return null;
  const proposed = Math.round(newCostCents * (1 + effective.markupBps / 10000));
  if (proposed === productBefore.priceCents) return null;
  const db = ctx.db<typeof schema>();
  const [existing] = await db.select().from(schema.priceProposals).where(and(eq(schema.priceProposals.productId, productBefore.id), eq(schema.priceProposals.status, "pending"), eq(schema.priceProposals.newCostCents, newCostCents))).limit(1);
  if (existing) return existing;
  const [row] = await db.insert(schema.priceProposals).values({
    productId: productBefore.id,
    productTitle: productBefore.title,
    vendor: productBefore.vendor ?? "",
    oldCostCents: productBefore.costCents,
    newCostCents,
    oldPriceCents: productBefore.priceCents,
    proposedPriceCents: proposed,
    markupBps: effective.markupBps,
    ruleSource: effective.source,
    status: "pending",
    createdAt: new Date(),
    decidedAt: null,
  }).returning();
  return row ?? null;
}

const returnItemSchema = z.object({
  id: z.number(),
  sale_item_id: z.number(),
  product_id: z.number(),
  product_title: z.string(),
  quantity: z.number(),
  unit_price_cents: z.number(),
  line_total_cents: z.number(),
  reason: z.string(),
});

const saleReturnSchema = z.object({
  id: z.string(),
  refund_method: z.enum(["cash", "card", "account_credit"]),
  subtotal_cents: z.number(),
  tax_cents: z.number(),
  total_cents: z.number(),
  refunded_cents: z.number(),
  credited_cents: z.number(),
  created_at: z.string(),
  items: z.array(returnItemSchema),
});

const saleSummarySchema = z.object({
  id: z.string(),
  invoice_number: z.number().nullable(),
  customer_id: z.number().nullable(),
  customer_name: z.string(),
  salesperson: salespersonSchema,
  subtotal_cents: z.number(),
  tax_cents: z.number(),
  tax_rate_bps: z.number(),
  tax_status: z.enum(["taxable", "exempt"]),
  total_cents: z.number(),
  paid_cents: z.number(),
  balance_cents: z.number(),
  status: z.enum(["paid", "partial", "unpaid"]),
  created_at: z.string(),
  items: z.array(z.object({
    id: z.number(),
    product_id: z.number(),
    product_title: z.string(),
    quantity: z.number(),
    returned_quantity: z.number(),
    unit_price_cents: z.number(),
    line_total_cents: z.number(),
  })),
  returns: z.array(saleReturnSchema),
});

type SaleRow = typeof schema.sales.$inferSelect;

async function presentSaleSummaries(ctx: Ctx, orders: SaleRow[]): Promise<Array<z.infer<typeof saleSummarySchema>>> {
  const db = ctx.db<typeof schema>();
  const saleIds = orders.map((order) => order.id);
  const itemRows = saleIds.length > 0 ? await db.select().from(schema.saleItems).where(inArray(schema.saleItems.saleId, saleIds)).orderBy(asc(schema.saleItems.id)) : [];
  const returnRows = saleIds.length > 0 ? await db.select().from(schema.returns).where(inArray(schema.returns.saleId, saleIds)).orderBy(desc(schema.returns.createdAt)) : [];
  const returnIds = returnRows.map((row) => row.id);
  const returnItemRows = returnIds.length > 0 ? await db.select().from(schema.returnItems).where(inArray(schema.returnItems.returnId, returnIds)).orderBy(asc(schema.returnItems.id)) : [];
  const returnedBySaleItem = new Map<number, number>();
  for (const item of returnItemRows) returnedBySaleItem.set(item.saleItemId, (returnedBySaleItem.get(item.saleItemId) ?? 0) + item.quantity);
  return orders.map((order) => ({
    id: order.id,
    invoice_number: order.invoiceNumber,
    customer_id: order.customerId,
    customer_name: order.customerName,
    salesperson: order.salesperson,
    subtotal_cents: order.subtotalCents,
    tax_cents: order.taxCents,
    tax_rate_bps: order.taxRateBps,
    tax_status: order.taxStatus,
    total_cents: order.totalCents,
    paid_cents: order.paidCents,
    balance_cents: order.totalCents - order.paidCents,
    status: order.status,
    created_at: order.createdAt.toISOString(),
    items: itemRows.filter((item) => item.saleId === order.id).map((item) => ({
      id: item.id,
      product_id: item.productId,
      product_title: item.productTitle,
      quantity: item.quantity,
      returned_quantity: returnedBySaleItem.get(item.id) ?? 0,
      unit_price_cents: item.unitPriceCents,
      line_total_cents: item.lineTotalCents,
    })),
    returns: returnRows.filter((row) => row.saleId === order.id).map((row) => ({
      id: row.id,
      refund_method: row.refundMethod,
      subtotal_cents: row.subtotalCents,
      tax_cents: row.taxCents,
      total_cents: row.totalCents,
      refunded_cents: row.refundedCents,
      credited_cents: row.creditedCents,
      created_at: row.createdAt.toISOString(),
      items: returnItemRows.filter((item) => item.returnId === row.id).map((item) => ({
        id: item.id,
        sale_item_id: item.saleItemId,
        product_id: item.productId,
        product_title: item.productTitle,
        quantity: item.quantity,
        unit_price_cents: item.unitPriceCents,
        line_total_cents: item.lineTotalCents,
        reason: item.reason,
      })),
    })),
  }));
}

const paymentSchema = z.object({
  id: z.number(),
  sale_id: z.string().nullable(),
  amount_cents: z.number(),
  method: z.enum(["cash", "card", "check"]),
  created_at: z.string(),
});

const fieldOrderItemSchema = z.object({
  id: z.number(),
  product_id: z.number(),
  product_title: z.string(),
  part_number: z.string(),
  quantity: z.number(),
  unit_price_cents: z.number(),
  line_total_cents: z.number(),
  on_hand: z.number(),
  thumbnail_url: z.string().nullable(),
});

const fieldOrderSchema = z.object({
  id: z.string(),
  customer_id: z.number(),
  customer_name: z.string(),
  customer_business_name: z.string(),
  customer_phone: z.string(),
  delivery_address: z.string(),
  status: z.enum(["draft", "finalized", "cancelled"]),
  notes: z.string(),
  created_by: salespersonSchema,
  sale_id: z.string().nullable(),
  invoice_number: z.number().nullable(),
  subtotal_cents: z.number(),
  item_count: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  finalized_at: z.string().nullable(),
  items: z.array(fieldOrderItemSchema),
  returns: z.array(saleReturnSchema),
  returned_cents: z.number(),
  returned_units: z.number(),
});

const fieldOrderResponse = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  order: fieldOrderSchema.nullable(),
});

const finalizeFieldOrderResponse = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  order: fieldOrderSchema.nullable(),
  sale_id: z.string().nullable(),
  invoice_number: z.number().nullable(),
  total_cents: z.number(),
  tax_cents: z.number(),
  account_balance_cents: z.number(),
});

const fieldOrderItemsInput = z.array(z.object({
  product_id: z.number().int().positive(),
  quantity: z.number().int().min(1).max(9999),
})).min(1).max(200);

type FieldOrderRow = typeof schema.fieldOrders.$inferSelect;

async function presentFieldOrder(ctx: Ctx, row: FieldOrderRow): Promise<z.infer<typeof fieldOrderSchema>> {
  const db = ctx.db<typeof schema>();
  const [customer] = await db.select().from(schema.customers).where(eq(schema.customers.id, row.customerId)).limit(1);
  const itemRows = await db.select().from(schema.fieldOrderItems).where(eq(schema.fieldOrderItems.fieldOrderId, row.id)).orderBy(asc(schema.fieldOrderItems.id));
  const productIds = itemRows.map((item) => item.productId);
  const productRows = productIds.length > 0 ? await db.select().from(schema.products).where(inArray(schema.products.id, productIds)) : [];
  const onHandById = new Map(productRows.map((product) => [product.id, product.quantity]));
  const thumbById = new Map<number, string | null>();
  for (const product of productRows) {
    const uploadedUrl = product.imageBlobKey ? await ctx.blobs.getUrl(product.imageBlobKey, { expiresInSeconds: 3600 }) : null;
    const storedImages = parseImageUrls(product.imageUrls);
    thumbById.set(product.id, uploadedUrl ?? product.thumbnailUrl ?? storedImages[0] ?? null);
  }
  let invoiceNumber: number | null = null;
  if (row.saleId) {
    const [sale] = await db.select({ invoiceNumber: schema.sales.invoiceNumber }).from(schema.sales).where(eq(schema.sales.id, row.saleId)).limit(1);
    invoiceNumber = sale?.invoiceNumber ?? null;
  }
  const deliveryAddress = customer ? [customer.deliveryStreet, customer.deliveryCity, customer.deliveryState, customer.deliveryZip].filter(Boolean).join(", ") : "";
  let fieldReturns: Array<z.infer<typeof saleReturnSchema>> = [];
  if (row.saleId) {
    const retRows = await db.select().from(schema.returns).where(eq(schema.returns.saleId, row.saleId)).orderBy(desc(schema.returns.createdAt));
    const retIds = retRows.map((r) => r.id);
    const retItems = retIds.length > 0 ? await db.select().from(schema.returnItems).where(inArray(schema.returnItems.returnId, retIds)).orderBy(asc(schema.returnItems.id)) : [];
    fieldReturns = retRows.map((r) => ({
      id: r.id,
      refund_method: r.refundMethod,
      subtotal_cents: r.subtotalCents,
      tax_cents: r.taxCents,
      total_cents: r.totalCents,
      refunded_cents: r.refundedCents,
      credited_cents: r.creditedCents,
      created_at: r.createdAt.toISOString(),
      items: retItems.filter((it) => it.returnId === r.id).map((it) => ({ id: it.id, sale_item_id: it.saleItemId, product_id: it.productId, product_title: it.productTitle, quantity: it.quantity, unit_price_cents: it.unitPriceCents, line_total_cents: it.lineTotalCents, reason: it.reason })),
    }));
  }
  return {
    id: row.id,
    customer_id: row.customerId,
    customer_name: row.customerName,
    customer_business_name: customer?.businessName ?? "",
    customer_phone: customer?.phone ?? "",
    delivery_address: deliveryAddress,
    status: row.status,
    notes: row.notes,
    created_by: row.createdBy,
    sale_id: row.saleId,
    invoice_number: invoiceNumber,
    subtotal_cents: itemRows.reduce((sum, item) => sum + item.lineTotalCents, 0),
    item_count: itemRows.reduce((sum, item) => sum + item.quantity, 0),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    finalized_at: row.finalizedAt ? row.finalizedAt.toISOString() : null,
    returns: fieldReturns,
    returned_cents: fieldReturns.reduce((s, r) => s + r.total_cents, 0),
    returned_units: fieldReturns.reduce((s, r) => s + r.items.reduce((a, it) => a + it.quantity, 0), 0),
    items: itemRows.map((item) => ({
      id: item.id,
      product_id: item.productId,
      product_title: item.productTitle,
      part_number: item.partNumber,
      quantity: item.quantity,
      unit_price_cents: item.unitPriceCents,
      line_total_cents: item.lineTotalCents,
      on_hand: onHandById.get(item.productId) ?? 0,
      thumbnail_url: thumbById.get(item.productId) ?? null,
    })),
  };
}

const recordPaymentResponse = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  sale_id: z.string().nullable(),
  paid_cents: z.number(),
  balance_cents: z.number(),
  account_balance_cents: z.number(),
});

const createReturnResponse = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  return_id: z.string().nullable(),
  refund_method: z.enum(["cash", "card", "account_credit"]).nullable(),
  returned_cents: z.number(),
  refunded_cents: z.number(),
  credited_cents: z.number(),
  sale_total_cents: z.number(),
  sale_paid_cents: z.number(),
  sale_balance_cents: z.number(),
  account_balance_cents: z.number(),
});

const checkoutResponse = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  sale_id: z.string().nullable(),
  invoice_number: z.number().nullable(),
  salesperson: salespersonSchema.nullable(),
  subtotal_cents: z.number(),
  tax_cents: z.number(),
  tax_rate_bps: z.number(),
  total_cents: z.number(),
  paid_cents: z.number(),
  old_balance_cents: z.number(),
  balance_paid_cents: z.number(),
  collected_cents: z.number(),
  account_balance_cents: z.number(),
});

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must be YYYY-MM-DD.");

const analyticsRange = z.object({
  start_date: dateString.nullable().default(null),
  end_date: dateString.nullable().default(null),
});

function rangeBounds(args: { start_date: string | null; end_date: string | null }): { start: Date | null; endExclusive: Date | null } {
  const start = args.start_date ? new Date(`${args.start_date}T00:00:00.000Z`) : null;
  let endExclusive: Date | null = null;
  if (args.end_date) {
    endExclusive = new Date(`${args.end_date}T00:00:00.000Z`);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  }
  return { start, endExclusive };
}

function rangeCondition(start: Date | null, endExclusive: Date | null) {
  const conditions = [
    ...(start ? [gte(schema.sales.createdAt, start)] : []),
    ...(endExclusive ? [lt(schema.sales.createdAt, endExclusive)] : []),
  ];
  return conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : and(...conditions);
}

const salespersonReportRow = z.object({
  salesperson: salespersonSchema,
  sale_count: z.number(),
  units_sold: z.number(),
  subtotal_cents: z.number(),
  tax_cents: z.number(),
  total_cents: z.number(),
  paid_cents: z.number(),
  balance_cents: z.number(),
  returns_cents: z.number(),
  profit_cents: z.number(),
  avg_sale_cents: z.number(),
  commission_bps: z.number(),
  commission_cents: z.number(),
});

const salespersonReportResponse = z.object({
  rows: z.array(salespersonReportRow),
  totals: z.object({
    sale_count: z.number(),
    units_sold: z.number(),
    subtotal_cents: z.number(),
    tax_cents: z.number(),
    total_cents: z.number(),
    paid_cents: z.number(),
    balance_cents: z.number(),
    returns_cents: z.number(),
    profit_cents: z.number(),
    commission_cents: z.number(),
  }),
  sales: z.array(saleSummarySchema),
});

const itemAnalyticsRow = z.object({
  product_id: z.number(),
  product_title: z.string(),
  part_number: z.string(),
  sku: z.string(),
  vendor: z.string(),
  thumbnail_url: z.string().nullable(),
  units_sold: z.number(),
  returned_units: z.number(),
  revenue_cents: z.number(),
  unit_cost_cents: z.number(),
  cost_cents: z.number(),
  profit_cents: z.number(),
  margin_bps: z.number(),
  sale_count: z.number(),
});

const itemAnalyticsResponse = z.object({
  rows: z.array(itemAnalyticsRow),
  totals: z.object({
    units_sold: z.number(),
    revenue_cents: z.number(),
    cost_cents: z.number(),
    profit_cents: z.number(),
    item_count: z.number(),
  }),
});

type NetLine = { netQty: number; netRevenueCents: number };

// Net sold quantities/revenue per sale item after returns, for a set of sales.
async function netLinesForSales(ctx: Ctx, saleIds: string[]) {
  const db = ctx.db<typeof schema>();
  const itemRows = saleIds.length > 0 ? await db.select().from(schema.saleItems).where(inArray(schema.saleItems.saleId, saleIds)) : [];
  const returnRows = saleIds.length > 0 ? await db.select().from(schema.returns).where(inArray(schema.returns.saleId, saleIds)) : [];
  const returnIds = returnRows.map((row) => row.id);
  const returnItemRows = returnIds.length > 0 ? await db.select().from(schema.returnItems).where(inArray(schema.returnItems.returnId, returnIds)) : [];
  const returnedBySaleItem = new Map<number, NetLine>();
  for (const item of returnItemRows) {
    const current = returnedBySaleItem.get(item.saleItemId) ?? { netQty: 0, netRevenueCents: 0 };
    current.netQty += item.quantity;
    current.netRevenueCents += item.lineTotalCents;
    returnedBySaleItem.set(item.saleItemId, current);
  }
  return { itemRows, returnRows, returnedBySaleItem };
}

const supplierEnum = z.enum(["medco", "oak"]);
type SupplierKey = z.infer<typeof supplierEnum>;

const SUPPLIER_LABEL: Record<SupplierKey, string> = { medco: "Medco", oak: "National Oak" };

function moneyText(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

type SupplierCandidate = {
  supplier: SupplierKey;
  partNumber: string;
  carried: boolean;
  available: boolean;
  costCents: number;
  costIsFallback: boolean;
  moq: number;
};

function supplierCandidate(product: ProductRow, supplier: SupplierKey): SupplierCandidate {
  const partNumber = (supplier === "medco" ? product.medcoPartNumber : product.oakPartNumber).trim();
  const specificCost = supplier === "medco" ? product.medcoCostCents : product.oakCostCents;
  const availableFlag = supplier === "medco" ? product.medcoAvailable === 1 : product.oakAvailable === 1;
  return {
    supplier,
    partNumber,
    carried: partNumber.length > 0,
    available: partNumber.length > 0 && availableFlag,
    costCents: specificCost > 0 ? specificCost : product.costCents,
    costIsFallback: specificCost <= 0,
    moq: Math.max(1, supplier === "medco" ? product.medcoMoq : product.oakMoq),
  };
}

function chooseSupplier(product: ProductRow): { chosen: SupplierCandidate; alt: SupplierCandidate; reason: string } | null {
  const medco = supplierCandidate(product, "medco");
  const oak = supplierCandidate(product, "oak");
  const options = [medco, oak].filter((candidate) => candidate.available);
  if (options.length === 0) return null;
  // Cheaper effective cost wins; ties go to Medco as the primary warehouse.
  options.sort((a, b) => a.costCents - b.costCents || (a.supplier === "medco" ? -1 : 1));
  const chosen = options[0] as SupplierCandidate;
  const alt = chosen.supplier === "medco" ? oak : medco;
  const other = chosen.supplier === "medco" ? oak : medco;
  let reason: string;
  if (!other.carried) {
    reason = `Only ${SUPPLIER_LABEL[chosen.supplier]} carries this item.`;
  } else if (!other.available) {
    reason = `${SUPPLIER_LABEL[other.supplier]} lists it but is marked unavailable — ordering from ${SUPPLIER_LABEL[chosen.supplier]}.`;
  } else if (chosen.costCents < other.costCents) {
    reason = `Cheaper at ${SUPPLIER_LABEL[chosen.supplier]} (${moneyText(chosen.costCents)} vs ${moneyText(other.costCents)} at ${SUPPLIER_LABEL[other.supplier]}).`;
  } else if (chosen.costCents === other.costCents) {
    reason = `Same cost at both warehouses (${moneyText(chosen.costCents)}) — ${SUPPLIER_LABEL[chosen.supplier]} picked as the default.`;
  } else {
    reason = `Cheaper at ${SUPPLIER_LABEL[chosen.supplier]} (${moneyText(chosen.costCents)} vs ${moneyText(other.costCents)} at ${SUPPLIER_LABEL[other.supplier]}).`;
  }
  if (chosen.costIsFallback && other.costIsFallback) {
    reason += " No supplier-specific cost on file — compared on catalog cost; add each warehouse's cost in Products to sharpen this pick.";
  } else if (chosen.costIsFallback) {
    reason += ` ${SUPPLIER_LABEL[chosen.supplier]} cost is the catalog cost — no warehouse-specific cost on file.`;
  }
  return { chosen, alt, reason };
}

const poItemSchema = z.object({
  id: z.number(),
  product_id: z.number(),
  product_title: z.string(),
  supplier_part_number: z.string(),
  quantity: z.number(),
  suggested_quantity: z.number(),
  unit_cost_cents: z.number(),
  line_total_cents: z.number(),
  par_level: z.number(),
  on_hand: z.number(),
  inbound_qty: z.number(),
  need_qty: z.number(),
  moq: z.number(),
  choice_reason: z.string(),
  alt_supplier: z.string(),
  alt_part_number: z.string(),
  alt_cost_cents: z.number(),
  alt_available: z.boolean(),
  alt_moq: z.number(),
  current_on_hand: z.number(),
  current_inbound_qty: z.number(),
  thumbnail_url: z.string().nullable(),
});

const purchaseOrderSchema = z.object({
  id: z.string(),
  po_number: z.number().nullable(),
  supplier: supplierEnum,
  supplier_label: z.string(),
  status: z.enum(["draft", "approved", "received", "cancelled"]),
  notes: z.string(),
  total_cents: z.number(),
  item_count: z.number(),
  unit_count: z.number(),
  min_order_cents: z.number(),
  below_min_order: z.boolean(),
  created_at: z.string(),
  approved_at: z.string().nullable(),
  received_at: z.string().nullable(),
  items: z.array(poItemSchema),
});

const purchaseOrderResponse = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  order: purchaseOrderSchema.nullable(),
});

type PurchaseOrderRow = typeof schema.purchaseOrders.$inferSelect;

async function presentPurchaseOrder(ctx: Ctx, row: PurchaseOrderRow): Promise<z.infer<typeof purchaseOrderSchema>> {
  const db = ctx.db<typeof schema>();
  const itemRows = await db.select().from(schema.purchaseOrderItems).where(eq(schema.purchaseOrderItems.poId, row.id)).orderBy(asc(schema.purchaseOrderItems.id));
  const productIds = itemRows.map((item) => item.productId);
  const productRows = productIds.length > 0 ? await db.select().from(schema.products).where(inArray(schema.products.id, productIds)) : [];
  const productById = new Map(productRows.map((product) => [product.id, product]));
  const thumbById = new Map<number, string | null>();
  for (const product of productRows) {
    const uploadedUrl = product.imageBlobKey ? await ctx.blobs.getUrl(product.imageBlobKey, { expiresInSeconds: 3600 }) : null;
    const storedImages = parseImageUrls(product.imageUrls);
    thumbById.set(product.id, uploadedUrl ?? product.thumbnailUrl ?? storedImages[0] ?? null);
  }
  const [settings] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.id, 1)).limit(1);
  const minOrderCents = row.supplier === "medco" ? (settings?.medcoMinOrderCents ?? 0) : (settings?.oakMinOrderCents ?? 0);
  return {
    id: row.id,
    po_number: row.poNumber,
    supplier: row.supplier,
    supplier_label: SUPPLIER_LABEL[row.supplier],
    status: row.status,
    notes: row.notes,
    total_cents: row.totalCents,
    item_count: itemRows.length,
    unit_count: itemRows.reduce((sum, item) => sum + item.quantity, 0),
    min_order_cents: minOrderCents,
    below_min_order: minOrderCents > 0 && row.totalCents < minOrderCents,
    created_at: row.createdAt.toISOString(),
    approved_at: row.approvedAt ? row.approvedAt.toISOString() : null,
    received_at: row.receivedAt ? row.receivedAt.toISOString() : null,
    items: itemRows.map((item) => {
      const product = productById.get(item.productId);
      return {
        id: item.id,
        product_id: item.productId,
        product_title: item.productTitle,
        supplier_part_number: item.supplierPartNumber,
        quantity: item.quantity,
        suggested_quantity: item.suggestedQuantity,
        unit_cost_cents: item.unitCostCents,
        line_total_cents: item.lineTotalCents,
        par_level: item.parLevel,
        on_hand: item.onHand,
        inbound_qty: item.inboundQty,
        need_qty: item.needQty,
        moq: item.moq,
        choice_reason: item.choiceReason,
        alt_supplier: item.altSupplier,
        alt_part_number: item.altPartNumber,
        alt_cost_cents: item.altCostCents,
        alt_available: item.altAvailable === 1,
        alt_moq: item.altMoq,
        current_on_hand: product?.quantity ?? item.onHand,
        current_inbound_qty: product?.inboundQty ?? item.inboundQty,
        thumbnail_url: thumbById.get(item.productId) ?? null,
      };
    }),
  };
}

async function ensurePoSettings(ctx: Ctx) {
  const db = ctx.db<typeof schema>();
  await db.insert(schema.appSettings).values({ id: 1, nextInvoiceNumber: 1001, updatedAt: new Date() }).onConflictDoNothing({ target: schema.appSettings.id });
  const [settings] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.id, 1)).limit(1);
  return settings;
}

async function recalcPoTotal(ctx: Ctx, poId: string) {
  const db = ctx.db<typeof schema>();
  const items = await db.select().from(schema.purchaseOrderItems).where(eq(schema.purchaseOrderItems.poId, poId));
  const total = items.reduce((sum, item) => sum + item.lineTotalCents, 0);
  await db.update(schema.purchaseOrders).set({ totalCents: total, updatedAt: new Date() }).where(eq(schema.purchaseOrders.id, poId));
  return total;
}

const reorderNeedSchema = z.object({
  product_id: z.number(),
  product_title: z.string(),
  vendor: z.string(),
  part_number: z.string(),
  thumbnail_url: z.string().nullable(),
  par_level: z.number(),
  on_hand: z.number(),
  inbound_qty: z.number(),
  need_qty: z.number(),
  order_qty: z.number(),
  chosen_supplier: supplierEnum.nullable(),
  chosen_supplier_label: z.string(),
  chosen_part_number: z.string(),
  chosen_cost_cents: z.number(),
  chosen_moq: z.number(),
  moq_bumped: z.boolean(),
  choice_reason: z.string(),
  medco_part_number: z.string(),
  oak_part_number: z.string(),
  medco_cost_cents: z.number(),
  oak_cost_cents: z.number(),
  medco_available: z.boolean(),
  oak_available: z.boolean(),
  orderable: z.boolean(),
});

function buildNeedRow(product: ProductRow, thumbnailUrl: string | null): z.infer<typeof reorderNeedSchema> | null {
  const need = product.parLevel - product.quantity - product.inboundQty;
  if (product.parLevel <= 0 || need <= 0) return null;
  const medco = supplierCandidate(product, "medco");
  const oak = supplierCandidate(product, "oak");
  const pick = chooseSupplier(product);
  const orderQty = pick ? Math.max(need, pick.chosen.moq) : need;
  return {
    product_id: product.id,
    product_title: product.title,
    vendor: product.vendor,
    part_number: product.partNumber || product.sku,
    thumbnail_url: thumbnailUrl,
    par_level: product.parLevel,
    on_hand: product.quantity,
    inbound_qty: product.inboundQty,
    need_qty: need,
    order_qty: orderQty,
    chosen_supplier: pick ? pick.chosen.supplier : null,
    chosen_supplier_label: pick ? SUPPLIER_LABEL[pick.chosen.supplier] : "",
    chosen_part_number: pick ? pick.chosen.partNumber : "",
    chosen_cost_cents: pick ? pick.chosen.costCents : 0,
    chosen_moq: pick ? pick.chosen.moq : 1,
    moq_bumped: pick ? orderQty > need : false,
    choice_reason: pick ? pick.reason : "Neither warehouse carries this item — add a Medco or National Oak part number in Products before it can be ordered.",
    medco_part_number: product.medcoPartNumber,
    oak_part_number: product.oakPartNumber,
    medco_cost_cents: medco.costCents,
    oak_cost_cents: oak.costCents,
    medco_available: medco.available,
    oak_available: oak.available,
    orderable: pick !== null,
  };
}

const receivingSupplierSchema = z.enum(["medco", "oak", "unknown"]);

const receivingLineSchema = z.object({
  id: z.number(),
  product_id: z.number().nullable(),
  product_title: z.string(),
  product_part_number: z.string(),
  product_medco_part_number: z.string(),
  product_oak_part_number: z.string(),
  current_on_hand: z.number(),
  current_inbound_qty: z.number(),
  raw_part_number: z.string(),
  raw_description: z.string(),
  matched_by: z.string(),
  ordered_qty: z.number(),
  shipped_qty: z.number(),
  backorder_qty: z.number(),
  unit_cost_cents: z.number(),
  current_cost_cents: z.number(),
  cost_change_status: z.enum(["none", "pending", "approved", "rejected"]),
  include_line: z.boolean(),
  notes: z.string(),
});

const receivingDocumentSchema = z.object({
  id: z.string(),
  file_name: z.string(),
  pdf_url: z.string().nullable(),
  mime_type: z.string(),
  supplier: receivingSupplierSchema,
  supplier_label: z.string(),
  supplier_invoice_number: z.string(),
  document_type: z.enum(["invoice", "packing_list", "unknown"]),
  status: z.enum(["needs_review", "received", "cancelled"]),
  parse_notes: z.string(),
  line_count: z.number(),
  matched_count: z.number(),
  unmatched_count: z.number(),
  shipped_units: z.number(),
  backorder_units: z.number(),
  pending_cost_changes: z.number(),
  created_at: z.string(),
  applied_at: z.string().nullable(),
  lines: z.array(receivingLineSchema),
});

const receivingDocumentResponse = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  document: receivingDocumentSchema.nullable(),
});

type ReceivingDocumentRow = typeof schema.receivingDocuments.$inferSelect;

function receivingSupplierLabel(supplier: z.infer<typeof receivingSupplierSchema>): string {
  return supplier === "medco" ? "Medco" : supplier === "oak" ? "National Oak" : "Warehouse not identified";
}

async function presentReceivingDocument(ctx: Ctx, row: ReceivingDocumentRow): Promise<z.infer<typeof receivingDocumentSchema>> {
  const db = ctx.db<typeof schema>();
  const lineRows = await db.select().from(schema.receivingLines).where(eq(schema.receivingLines.documentId, row.id)).orderBy(asc(schema.receivingLines.id));
  const productIds = lineRows.map((line) => line.productId).filter((id): id is number => id !== null);
  const productRows = productIds.length > 0 ? await db.select().from(schema.products).where(inArray(schema.products.id, productIds)) : [];
  const productById = new Map(productRows.map((product) => [product.id, product]));
  const pdfUrl = row.mimeType === "application/pdf" ? await ctx.blobs.getUrl(row.fileBlobKey, { expiresInSeconds: 3600 }) : null;
  const included = lineRows.filter((line) => line.includeLine === 1);
  return {
    id: row.id,
    file_name: row.fileName,
    pdf_url: pdfUrl,
    mime_type: row.mimeType,
    supplier: row.supplier,
    supplier_label: receivingSupplierLabel(row.supplier),
    supplier_invoice_number: row.supplierInvoiceNumber,
    document_type: row.documentType,
    status: row.status,
    parse_notes: row.parseNotes,
    line_count: lineRows.length,
    matched_count: lineRows.filter((line) => line.productId !== null).length,
    unmatched_count: lineRows.filter((line) => line.productId === null).length,
    shipped_units: included.reduce((sum, line) => sum + line.shippedQty, 0),
    backorder_units: included.reduce((sum, line) => sum + line.backorderQty, 0),
    pending_cost_changes: lineRows.filter((line) => line.costChangeStatus === "pending").length,
    created_at: row.createdAt.toISOString(),
    applied_at: row.appliedAt ? row.appliedAt.toISOString() : null,
    lines: lineRows.map((line) => {
      const product = line.productId !== null ? productById.get(line.productId) : undefined;
      return {
        id: line.id,
        product_id: line.productId,
        product_title: product?.title ?? "",
        product_part_number: product?.partNumber || product?.sku || "",
        product_medco_part_number: product?.medcoPartNumber ?? "",
        product_oak_part_number: product?.oakPartNumber ?? "",
        current_on_hand: product?.quantity ?? 0,
        current_inbound_qty: product?.inboundQty ?? 0,
        raw_part_number: line.rawPartNumber,
        raw_description: line.rawDescription,
        matched_by: line.matchedBy,
        ordered_qty: line.orderedQty,
        shipped_qty: line.shippedQty,
        backorder_qty: line.backorderQty,
        unit_cost_cents: line.unitCostCents,
        current_cost_cents: line.currentCostCents,
        cost_change_status: line.costChangeStatus,
        include_line: line.includeLine === 1,
        notes: line.notes,
      };
    }),
  };
}

function normalizedPart(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function canonicalPart(value: string): string {
  let normalized = normalizedPart(value);
  if (normalized.startsWith("MMM")) normalized = `3M${normalized.slice(3)}`;
  return normalized.replace(/\d+/g, (digits) => digits.replace(/^0+(?=\d)/, ""));
}

function matchReceivingProduct(products: ProductRow[], supplier: z.infer<typeof receivingSupplierSchema>, rawPartNumber: string): { product: ProductRow; matchedBy: string } | null {
  const rawNormalized = normalizedPart(rawPartNumber);
  const rawCanonical = canonicalPart(rawPartNumber);
  if (!rawNormalized) return null;
  let best: { product: ProductRow; score: number; matchedBy: string } | null = null;
  let tied = false;
  const consider = (product: ProductRow, score: number, matchedBy: string) => {
    if (!best || score > best.score) {
      best = { product, score, matchedBy };
      tied = false;
    } else if (score === best.score && best.product.id !== product.id) {
      tied = true;
    }
  };
  for (const product of products) {
    const fields: Array<{ value: string; label: string; preferred: boolean }> = [
      { value: product.medcoPartNumber, label: "Medco #", preferred: supplier === "medco" },
      { value: product.oakPartNumber, label: "National Oak #", preferred: supplier === "oak" },
      { value: product.partNumber, label: "Internal part #", preferred: false },
      { value: product.sku, label: "SKU", preferred: false },
    ];
    for (const field of fields) {
      if (!field.value.trim()) continue;
      const isSupplierField = field.label === "Medco #" || field.label === "National Oak #";
      if (normalizedPart(field.value) === rawNormalized) {
        consider(product, isSupplierField ? (field.preferred || supplier === "unknown" ? 120 : 104) : 82, `${field.label} exact cross-reference`);
      } else if (canonicalPart(field.value) === rawCanonical) {
        consider(product, isSupplierField ? (field.preferred || supplier === "unknown" ? 112 : 98) : 74, `${field.label} cross-reference (leading-zero / brand-prefix match)`);
      } else if (rawCanonical.length >= 4 && canonicalPart(field.value).endsWith(rawCanonical)) {
        consider(product, 58, `${field.label} suffix match — verify before receiving`);
      }
    }
  }
  if (!best || tied) return null;
  const winner: { product: ProductRow; score: number; matchedBy: string } = best;
  return { product: winner.product, matchedBy: winner.matchedBy };
}

function effectiveSupplierCost(product: ProductRow, supplier: z.infer<typeof receivingSupplierSchema>, matchedBy = ""): number {
  if (supplier === "medco") return product.medcoCostCents > 0 ? product.medcoCostCents : product.costCents;
  if (supplier === "oak") return product.oakCostCents > 0 ? product.oakCostCents : product.costCents;
  if (matchedBy.startsWith("Medco")) return product.medcoCostCents > 0 ? product.medcoCostCents : product.costCents;
  if (matchedBy.startsWith("National Oak")) return product.oakCostCents > 0 ? product.oakCostCents : product.costCents;
  return product.costCents;
}

const extractedReceivingSchema = z.object({
  supplier: receivingSupplierSchema,
  supplier_invoice_number: z.string().max(120),
  document_type: z.enum(["invoice", "packing_list", "unknown"]),
  lines: z.array(z.object({
    supplier_part_number: z.string().max(160),
    description: z.string().max(400),
    ordered_qty: z.number().min(0).max(999999),
    shipped_qty: z.number().min(0).max(999999),
    backorder_qty: z.number().min(0).max(999999),
    unit_cost_dollars: z.number().min(0).max(1000000),
  })).max(200),
  notes: z.string().max(1000),
});

type ExtractedReceiving = z.infer<typeof extractedReceivingSchema>;

function fallbackReceivingExtraction(text: string, products: ProductRow[], preferredSupplier: z.infer<typeof receivingSupplierSchema>): ExtractedReceiving {
  const lines: ExtractedReceiving["lines"] = [];
  const seen = new Set<string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.length > 500) continue;
    const tokens = line.toUpperCase().match(/[A-Z0-9]+(?:[-/][A-Z0-9]+)*/g) ?? [];
    let matched: { product: ProductRow; matchedBy: string } | null = null;
    let matchedToken = "";
    for (const token of tokens) {
      const candidate = matchReceivingProduct(products, preferredSupplier, token);
      if (candidate) {
        matched = candidate;
        matchedToken = token;
        break;
      }
    }
    if (!matched || seen.has(`${matched.product.id}:${matchedToken}`)) continue;
    seen.add(`${matched.product.id}:${matchedToken}`);
    const withoutCode = line.replace(matchedToken, " ");
    const moneyMatches = [...withoutCode.matchAll(/\$?\s*(\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})\b/g)].map((match) => Number((match[1] ?? "0").replaceAll(",", "")));
    const integers = [...withoutCode.replace(/\d+\.\d{2}/g, " ").matchAll(/\b\d{1,6}\b/g)].map((match) => Number.parseInt(match[0], 10)).filter((value) => Number.isFinite(value));
    const ordered = integers.length >= 3 ? (integers[0] ?? 0) : integers.length >= 1 ? (integers[0] ?? 0) : 0;
    const shipped = integers.length >= 3 ? (integers[1] ?? 0) : integers.length >= 2 ? (integers[1] ?? 0) : ordered;
    const backorder = integers.length >= 3 ? (integers[2] ?? 0) : Math.max(0, ordered - shipped);
    lines.push({
      supplier_part_number: matchedToken,
      description: matched.product.title,
      ordered_qty: ordered,
      shipped_qty: shipped,
      backorder_qty: backorder,
      unit_cost_dollars: moneyMatches.length > 0 ? (moneyMatches[moneyMatches.length - 1] ?? 0) : 0,
    });
    if (lines.length >= 200) break;
  }
  return {
    supplier: preferredSupplier,
    supplier_invoice_number: "",
    document_type: "unknown",
    lines,
    notes: lines.length > 0 ? "The structured reader was unavailable, so lines were matched from supplier part numbers found in the PDF text. Check every quantity and cost before receiving." : "No supplier part numbers could be matched in the PDF text.",
  };
}

export const Actions = {
  initializeInventory: defineAction({
    request: z.object({}),
    response: z.object({ imported: z.number(), total: z.number() }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const [existing] = await db.select({ count: sql<number>`count(*)` }).from(schema.products);
      const existingCount = Number(existing?.count ?? 0);
      if (existingCount > 0) return { imported: 0, total: existingCount };

      const now = new Date();
      let imported = 0;
      for (let offset = 0; offset < seedProducts.length; offset += 100) {
        const chunk = seedProducts.slice(offset, offset + 100).map((item, chunkIndex) => ({
          seedKey: `shopify-export:${offset + chunkIndex}`,
          title: item.title,
          shortDescription: item.title,
          description: "",
          tags: "[]",
          imageUrls: "[]",
          vendor: item.vendor,
          partNumber: "",
          sku: "",
          medcoPartNumber: "",
          oakPartNumber: "",
          imageBlobKey: null,
          barcode: item.barcode || null,
          quantity: Math.max(0, Math.trunc(item.qty)),
          parLevel: 0,
          msrpCents: Math.round(item.price * 100),
          priceCents: Math.round(item.price * 100),
          costCents: Math.round(item.cost * 100),
          markupBps: item.cost > 0 ? Math.round(((item.price - item.cost) / item.cost) * 10000) : 0,
          status: item.status === "draft" ? ("draft" as const) : ("active" as const),
          updatedAt: now,
        }));
        const inserted = await db
          .insert(schema.products)
          .values(chunk)
          .onConflictDoNothing({ target: schema.products.seedKey })
          .returning({ id: schema.products.id });
        imported += inserted.length;
      }
      ctx.invalidateQueries();
      return { imported, total: seedProducts.length };
    },
  }),

  getInventoryStats: defineAction({
    request: z.object({}),
    response: z.object({
      total: z.number(),
      below_par: z.number(),
      par_configured: z.number(),
      missing_barcode: z.number(),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .select({
          total: sql<number>`count(*)`,
          belowPar: sql<number>`sum(case when ${schema.products.parLevel} > 0 and ${schema.products.quantity} + ${schema.products.inboundQty} < ${schema.products.parLevel} then 1 else 0 end)`,
          parConfigured: sql<number>`sum(case when ${schema.products.parLevel} > 0 then 1 else 0 end)`,
          missingBarcode: sql<number>`sum(case when ${schema.products.barcode} is null or ${schema.products.barcode} = '' then 1 else 0 end)`,
        })
        .from(schema.products);
      return {
        total: Number(row?.total ?? 0),
        below_par: Number(row?.belowPar ?? 0),
        par_configured: Number(row?.parConfigured ?? 0),
        missing_barcode: Number(row?.missingBarcode ?? 0),
      };
    },
  }),

  listProducts: defineAction({
    request: z.object({
      query: z.string().max(120).default(""),
      mode: z.enum(["all", "reorder"]).default("all"),
      limit: z.number().int().min(1).max(100).default(60),
      offset: z.number().int().min(0).default(0),
    }),
    response: z.object({ products: z.array(productSchema), total: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const query = args.query.trim();
      const searchCondition = query
        ? or(
            like(schema.products.title, `%${query}%`),
            like(schema.products.shortDescription, `%${query}%`),
            like(schema.products.description, `%${query}%`),
            like(schema.products.tags, `%${query}%`),
            like(schema.products.vendor, `%${query}%`),
            like(schema.products.partNumber, `%${query}%`),
            like(schema.products.sku, `%${query}%`),
            like(schema.products.medcoPartNumber, `%${query}%`),
            like(schema.products.oakPartNumber, `%${query}%`),
            like(schema.products.barcode, `%${query}%`),
          )
        : undefined;
      const reorderCondition = args.mode === "reorder"
        ? and(gt(schema.products.parLevel, 0), sql`${schema.products.quantity} + ${schema.products.inboundQty} < ${schema.products.parLevel}`)
        : undefined;
      const where = searchCondition && reorderCondition
        ? and(searchCondition, reorderCondition)
        : searchCondition ?? reorderCondition;

      const rows = await db
        .select()
        .from(schema.products)
        .where(where)
        .orderBy(
          ...(args.mode === "reorder"
            ? [desc(sql<number>`${schema.products.parLevel} - ${schema.products.quantity} - ${schema.products.inboundQty}`), asc(schema.products.title)]
            : [asc(schema.products.title)]),
        )
        .limit(args.limit)
        .offset(args.offset);
      const [countRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.products)
        .where(where);
      return { products: await Promise.all(rows.map((row) => presentProduct(ctx, row))), total: Number(countRow?.count ?? 0) };
    },
  }),

  findByBarcode: defineAction({
    request: z.object({ barcode: z.string().min(1).max(120) }),
    response: z.object({ product: productSchema.nullable() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const barcode = args.barcode.trim();
      const [row] = await db.select().from(schema.products).where(eq(schema.products.barcode, barcode)).limit(1);
      return { product: row ? await presentProduct(ctx, row) : null };
    },
  }),

  getProduct: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ product: productSchema.nullable() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db.select().from(schema.products).where(eq(schema.products.id, args.id)).limit(1);
      return { product: row ? await presentProduct(ctx, row) : null };
    },
  }),

  updateStockSettings: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      quantity: z.number().int().min(0).max(999999),
      inbound_qty: z.number().int().min(0).max(999999).default(0),
      par_level: z.number().int().min(0).max(999999),
    }),
    response: updateResponse,
    async handler(ctx, args): Promise<z.infer<typeof updateResponse>> {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .update(schema.products)
        .set({ quantity: args.quantity, inboundQty: args.inbound_qty, parLevel: args.par_level, updatedAt: new Date() })
        .where(eq(schema.products.id, args.id))
        .returning();
      if (!row) return { ok: false, error: "Product not found.", product: null };
      ctx.invalidateQueries();
      return { ok: true, product: await presentProduct(ctx, row) };
    },
  }),

  setQuantity: defineAction({
    request: z.object({ id: z.number().int().positive(), quantity: z.number().int().min(0).max(999999) }),
    response: updateResponse,
    async handler(ctx, args): Promise<z.infer<typeof updateResponse>> {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .update(schema.products)
        .set({ quantity: args.quantity, updatedAt: new Date() })
        .where(eq(schema.products.id, args.id))
        .returning();
      if (!row) return { ok: false, error: "Product not found.", product: null };
      ctx.invalidateQueries();
      return { ok: true, product: await presentProduct(ctx, row) };
    },
  }),

  adjustQuantity: defineAction({
    request: z.object({ id: z.number().int().positive(), delta: z.number().int().min(-1000).max(1000) }),
    response: updateResponse,
    async handler(ctx, args): Promise<z.infer<typeof updateResponse>> {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .update(schema.products)
        .set({ quantity: sql`max(0, ${schema.products.quantity} + ${args.delta})`, updatedAt: new Date() })
        .where(eq(schema.products.id, args.id))
        .returning();
      if (!row) return { ok: false, error: "Product not found.", product: null };
      ctx.invalidateQueries();
      return { ok: true, product: await presentProduct(ctx, row) };
    },
  }),

  setParLevel: defineAction({
    request: z.object({ id: z.number().int().positive(), par_level: z.number().int().min(0).max(999999) }),
    response: updateResponse,
    async handler(ctx, args): Promise<z.infer<typeof updateResponse>> {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .update(schema.products)
        .set({ parLevel: args.par_level, updatedAt: new Date() })
        .where(eq(schema.products.id, args.id))
        .returning();
      if (!row) return { ok: false, error: "Product not found.", product: null };
      ctx.invalidateQueries();
      return { ok: true, product: await presentProduct(ctx, row) };
    },
  }),

  createProduct: defineAction({
    request: productPricingFields.extend({ quantity: z.number().int().min(0).max(999999).default(0) }),
    response: updateResponse,
    async handler(ctx, args): Promise<z.infer<typeof updateResponse>> {
      const db = ctx.db<typeof schema>();
      const barcode = args.barcode?.trim() || null;
      if (barcode) {
        const [existing] = await db.select({ id: schema.products.id }).from(schema.products).where(eq(schema.products.barcode, barcode)).limit(1);
        if (existing) return { ok: false, error: "That barcode is already assigned to another product.", product: null };
      }
      const now = new Date();
      const createImages = resolvedImageUrls(args);
      const [row] = await db.insert(schema.products).values({
        seedKey: `manual:${crypto.randomUUID()}`,
        title: args.title,
        shortDescription: args.short_description || args.title,
        description: resolvedDescription(args),
        tags: JSON.stringify(normalizeTagsInput(args.tags)),
        imageUrls: JSON.stringify(createImages),
        thumbnailUrl: createImages[0] ?? null,
        vendor: args.vendor,
        partNumber: args.part_number,
        sku: args.sku,
        medcoPartNumber: args.medco_part_number,
        oakPartNumber: args.oak_part_number,
        medcoCostCents: args.medco_cost_cents,
        oakCostCents: args.oak_cost_cents,
        medcoMoq: args.medco_moq,
        oakMoq: args.oak_moq,
        medcoAvailable: args.medco_available ? 1 : 0,
        oakAvailable: args.oak_available ? 1 : 0,
        barcode,
        quantity: args.quantity,
        parLevel: 0,
        msrpCents: args.msrp_cents,
        priceCents: args.price_cents,
        costCents: args.cost_cents,
        markupBps: args.markup_bps,
        status: args.status,
        updatedAt: now,
      }).returning();
      if (!row) return { ok: false, error: "Could not add product.", product: null };
      ctx.invalidateQueries();
      return { ok: true, product: await presentProduct(ctx, row) };
    },
  }),

  updateProductPricing: defineAction({
    request: productPricingFields.extend({ id: z.number().int().positive() }),
    response: updateResponse,
    async handler(ctx, args): Promise<z.infer<typeof updateResponse>> {
      const db = ctx.db<typeof schema>();
      const barcode = args.barcode?.trim() || null;
      if (barcode) {
        const [existing] = await db.select({ id: schema.products.id }).from(schema.products).where(and(eq(schema.products.barcode, barcode), sql`${schema.products.id} != ${args.id}`)).limit(1);
        if (existing) return { ok: false, error: "That barcode is already assigned to another product.", product: null };
      }
      const [before] = await db.select().from(schema.products).where(eq(schema.products.id, args.id)).limit(1);
      const updateImages = hasImageInput(args) ? resolvedImageUrls(args) : parseImageUrls(before?.imageUrls);
      // Pricing rule: a cost change must NOT change the markup %. The markup
      // only moves when the user edits the markup (or price) field themselves.
      // When cost changes on its own, the live price stays put and the new
      // price — cost × (1 + fixed markup) from the markup rules chart — is
      // sent to price proposals for approval instead of applying directly.
      const costChanged = before !== undefined && before.costCents !== args.cost_cents;
      const markupChangedByUser = before !== undefined && args.markup_bps !== before.markupBps;
      const costDrivenSave = costChanged && !markupChangedByUser;
      const livePriceCents = costDrivenSave && before ? before.priceCents : args.price_cents;
      const liveMarkupBps = costDrivenSave && before ? before.markupBps : args.markup_bps;
      const [row] = await db.update(schema.products).set({
        title: args.title,
        shortDescription: args.short_description || args.title,
        description: resolvedDescription(args),
        tags: JSON.stringify(normalizeTagsInput(args.tags)),
        imageUrls: JSON.stringify(updateImages),
        thumbnailUrl: hasImageInput(args) ? (updateImages[0] ?? null) : (before?.thumbnailUrl ?? null),
        vendor: args.vendor,
        partNumber: args.part_number,
        sku: args.sku,
        medcoPartNumber: args.medco_part_number,
        oakPartNumber: args.oak_part_number,
        medcoCostCents: args.medco_cost_cents,
        oakCostCents: args.oak_cost_cents,
        medcoMoq: args.medco_moq,
        oakMoq: args.oak_moq,
        medcoAvailable: args.medco_available ? 1 : 0,
        oakAvailable: args.oak_available ? 1 : 0,
        barcode,
        msrpCents: args.msrp_cents,
        priceCents: livePriceCents,
        costCents: args.cost_cents,
        markupBps: liveMarkupBps,
        status: args.status,
        updatedAt: new Date(),
      }).where(eq(schema.products.id, args.id)).returning();
      if (!row) return { ok: false, error: "Product not found.", product: null };
      // Cost changed without the user repricing it themselves: propose the
      // rule-based price (per-item override, then manufacturer rule, then
      // default) for approval. The live price above stays at the old value
      // until that proposal is approved.
      if (before && costDrivenSave) {
        await maybeCreatePriceProposal(ctx, { ...before, vendor: args.vendor }, args.cost_cents).catch(() => null);
      }
      ctx.invalidateQueries();
      return { ok: true, product: await presentProduct(ctx, row) };
    },
  }),

  setProductThumbnail: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      data_base64: z.string().min(1).max(12000000),
      mime_type: z.enum(["image/jpeg", "image/png", "image/webp"]),
    }),
    response: updateResponse,
    async handler(ctx, args): Promise<z.infer<typeof updateResponse>> {
      const db = ctx.db<typeof schema>();
      const [existing] = await db.select().from(schema.products).where(eq(schema.products.id, args.id)).limit(1);
      if (!existing) return { ok: false, error: "Product not found.", product: null };
      const raw = args.data_base64.includes(",") ? (args.data_base64.split(",")[1] ?? "") : args.data_base64;
      const bytes = Uint8Array.from(atob(raw), (character) => character.charCodeAt(0));
      if (bytes.byteLength > 8000000) return { ok: false, error: "Thumbnail must be smaller than 8 MB.", product: null };
      const extension = args.mime_type === "image/png" ? "png" : args.mime_type === "image/webp" ? "webp" : "jpg";
      const key = `product-thumbnails/${args.id}-${crypto.randomUUID()}.${extension}`;
      await ctx.blobs.put(key, bytes, { contentType: args.mime_type });
      const [row] = await db.update(schema.products).set({ imageBlobKey: key, updatedAt: new Date() }).where(eq(schema.products.id, args.id)).returning();
      if (existing.imageBlobKey) await ctx.blobs.delete(existing.imageBlobKey).catch(() => undefined);
      if (!row) return { ok: false, error: "Could not save thumbnail.", product: null };
      ctx.invalidateQueries();
      return { ok: true, product: await presentProduct(ctx, row) };
    },
  }),

  setProductThumbnails: defineAction({
    request: z.object({
      items: z.array(z.object({
        barcode: z.string().trim().min(1).max(120),
        thumbnail_url: z.string().trim().url().max(2000),
      })).min(1).max(2000),
    }),
    response: z.object({ ok: z.boolean(), set: z.number(), skipped: z.number(), unmatched_barcodes: z.array(z.string()) }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      // Last entry wins if a barcode appears more than once in the batch.
      const urlByBarcode = new Map<string, string>();
      for (const item of args.items) urlByBarcode.set(item.barcode, item.thumbnail_url);
      const barcodes = [...urlByBarcode.keys()];
      const productByBarcode = new Map<string, number>();
      for (let i = 0; i < barcodes.length; i += 500) {
        const chunk = barcodes.slice(i, i + 500);
        const rows = await db.select({ id: schema.products.id, barcode: schema.products.barcode }).from(schema.products).where(inArray(schema.products.barcode, chunk));
        for (const row of rows) if (row.barcode) productByBarcode.set(row.barcode, row.id);
      }
      const now = new Date();
      let set = 0;
      const unmatched: string[] = [];
      for (const [barcode, thumbnailUrl] of urlByBarcode) {
        const productId = productByBarcode.get(barcode);
        if (productId === undefined) {
          unmatched.push(barcode);
          continue;
        }
        const [row] = await db.update(schema.products).set({ thumbnailUrl, updatedAt: now }).where(eq(schema.products.id, productId)).returning({ id: schema.products.id });
        if (row) set += 1;
        else unmatched.push(barcode);
      }
      ctx.invalidateQueries();
      return { ok: true, set, skipped: unmatched.length, unmatched_barcodes: unmatched };
    },
  }),

  bulkImportProducts: defineAction({
    request: z.object({ items: z.array(productPricingFields.extend({ quantity: z.number().int().min(0).max(999999).default(0) })).min(1).max(2000) }),
    response: z.object({ ok: z.boolean(), imported: z.number(), skipped: z.number(), errors: z.array(z.string()) }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];
      const now = new Date();
      for (const [index, item] of args.items.entries()) {
        const barcode = item.barcode?.trim() || null;
        if (barcode) {
          const [existing] = await db.select({ id: schema.products.id }).from(schema.products).where(eq(schema.products.barcode, barcode)).limit(1);
          if (existing) {
            skipped += 1;
            if (errors.length < 10) errors.push(`Row ${index + 2}: barcode ${barcode} is already in the catalog.`);
            continue;
          }
        }
        const bulkImages = resolvedImageUrls(item);
        const [row] = await db.insert(schema.products).values({
          seedKey: `bulk:${crypto.randomUUID()}`,
          title: item.title,
          shortDescription: item.short_description || item.title,
          description: resolvedDescription(item),
          tags: JSON.stringify(normalizeTagsInput(item.tags)),
          imageUrls: JSON.stringify(bulkImages),
          thumbnailUrl: bulkImages[0] ?? null,
          vendor: item.vendor,
          partNumber: item.part_number,
          sku: item.sku,
          medcoPartNumber: item.medco_part_number,
          oakPartNumber: item.oak_part_number,
          medcoCostCents: item.medco_cost_cents,
          oakCostCents: item.oak_cost_cents,
          medcoMoq: item.medco_moq,
          oakMoq: item.oak_moq,
          medcoAvailable: item.medco_available ? 1 : 0,
          oakAvailable: item.oak_available ? 1 : 0,
          imageBlobKey: null,
          barcode,
          quantity: item.quantity,
          parLevel: 0,
          msrpCents: item.msrp_cents,
          priceCents: item.price_cents,
          costCents: item.cost_cents,
          markupBps: item.markup_bps,
          status: item.status,
          updatedAt: now,
        }).returning({ id: schema.products.id });
        if (row) imported += 1;
        else skipped += 1;
      }
      ctx.invalidateQueries();
      return { ok: true, imported, skipped, errors };
    },
  }),

  bulkUpdateProducts: defineAction({
    request: z.object({
      items: z.array(z.object({
        id: z.number().int().positive(),
        price_cents: z.number().int().min(0).max(100000000).optional(),
        cost_cents: z.number().int().min(0).max(100000000).optional(),
        msrp_cents: z.number().int().min(0).max(100000000).optional(),
        tags: tagsInput.optional(),
        markup_bps: z.number().int().min(-10000).max(1000000).optional(),
        short_description: z.string().trim().max(300).optional(),
        description: z.string().trim().max(50000).optional(),
        full_description: z.string().trim().max(50000).optional(),
        image_urls: z.array(z.string().trim().url().max(2000)).max(30).optional(),
        images: z.array(z.string().trim().url().max(2000)).max(30).optional(),
        thumbnail_url: z.string().trim().url().max(2000).nullable().optional(),
        vendor: z.string().trim().max(160).optional(),
      })).min(1).max(2000),
    }),
    response: z.object({ ok: z.boolean(), updated: z.number(), skipped: z.number(), errors: z.array(z.string()) }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      let updated = 0;
      let skipped = 0;
      const errors: string[] = [];
      const now = new Date();
      // Items apply in order; if the same id appears more than once, each
      // entry overwrites only the fields it provides.
      const ids = [...new Set(args.items.map((item) => item.id))];
      const existingIds = new Set<number>();
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        const rows = await db.select({ id: schema.products.id }).from(schema.products).where(inArray(schema.products.id, chunk));
        for (const row of rows) existingIds.add(row.id);
      }
      for (const item of args.items) {
        const id = item.id;
        if (!existingIds.has(id)) {
          skipped += 1;
          if (errors.length < 25) errors.push(`Product ${id}: not found.`);
          continue;
        }
        const set: Partial<{ priceCents: number; costCents: number; msrpCents: number; tags: string; markupBps: number; shortDescription: string; description: string; imageUrls: string; thumbnailUrl: string | null; vendor: string }> = {};
        if (item.price_cents !== undefined) set.priceCents = item.price_cents;
        if (item.cost_cents !== undefined) set.costCents = item.cost_cents;
        if (item.msrp_cents !== undefined) set.msrpCents = item.msrp_cents;
        if (item.tags !== undefined) set.tags = JSON.stringify(normalizeTagsInput(item.tags));
        if (item.markup_bps !== undefined) set.markupBps = item.markup_bps;
        if (item.short_description !== undefined) set.shortDescription = item.short_description;
        if (item.full_description !== undefined) set.description = item.full_description;
        else if (item.description !== undefined) set.description = item.description;
        if (hasImageInput(item)) {
          const cleaned = resolvedImageUrls(item);
          set.imageUrls = JSON.stringify(cleaned);
          set.thumbnailUrl = cleaned[0] ?? null;
        } else if (item.thumbnail_url !== undefined) {
          set.thumbnailUrl = item.thumbnail_url;
          if (item.thumbnail_url) set.imageUrls = JSON.stringify([item.thumbnail_url]);
        }
        if (item.vendor !== undefined) set.vendor = item.vendor;
        if (Object.keys(set).length === 0) {
          skipped += 1;
          if (errors.length < 25) errors.push(`Product ${id}: no fields to update.`);
          continue;
        }
        const [row] = await db.update(schema.products).set({ ...set, updatedAt: now }).where(eq(schema.products.id, id)).returning({ id: schema.products.id });
        if (row) updated += 1;
        else {
          skipped += 1;
          if (errors.length < 25) errors.push(`Product ${id}: update failed.`);
        }
      }
      if (updated > 0) ctx.invalidateQueries();
      return { ok: true, updated, skipped, errors };
    },
  }),

  deleteProduct: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.boolean(), error: z.string().optional() }),
    async handler(ctx, args): Promise<{ ok: boolean; error?: string }> {
      const db = ctx.db<typeof schema>();
      const [existing] = await db.select().from(schema.products).where(eq(schema.products.id, args.id)).limit(1);
      if (!existing) return { ok: false, error: "Product not found." };
      try {
        await db.delete(schema.products).where(eq(schema.products.id, args.id));
      } catch {
        return { ok: false, error: "This product is referenced by sales or order history and cannot be deleted." };
      }
      if (existing.imageBlobKey) await ctx.blobs.delete(existing.imageBlobKey).catch(() => undefined);
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  getInvoiceSettings: defineAction({
    request: z.object({}),
    response: z.object({ next_invoice_number: z.number(), last_invoice_number: z.number().nullable() }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      await db.insert(schema.appSettings).values({ id: 1, nextInvoiceNumber: 1001, updatedAt: new Date() }).onConflictDoNothing({ target: schema.appSettings.id });
      const [settings] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.id, 1)).limit(1);
      const [last] = await db.select({ value: sql<number | null>`max(${schema.sales.invoiceNumber})` }).from(schema.sales);
      return { next_invoice_number: settings?.nextInvoiceNumber ?? 1001, last_invoice_number: last?.value === null || last?.value === undefined ? null : Number(last.value) };
    },
  }),

  updateInvoiceSettings: defineAction({
    request: z.object({ starting_invoice_number: z.number().int().min(1).max(999999999) }),
    response: z.object({ ok: z.boolean(), next_invoice_number: z.number(), error: z.string().optional() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [last] = await db.select({ value: sql<number | null>`max(${schema.sales.invoiceNumber})` }).from(schema.sales);
      const lastInvoiceNumber = last?.value === null || last?.value === undefined ? null : Number(last.value);
      await db.insert(schema.appSettings).values({ id: 1, nextInvoiceNumber: Math.max(1001, (lastInvoiceNumber ?? 1000) + 1), updatedAt: new Date() }).onConflictDoNothing({ target: schema.appSettings.id });
      const [current] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.id, 1)).limit(1);
      const currentNext = current?.nextInvoiceNumber ?? Math.max(1001, (lastInvoiceNumber ?? 1000) + 1);
      const minimumNext = lastInvoiceNumber === null ? 1 : Math.max(lastInvoiceNumber + 1, currentNext);
      if (args.starting_invoice_number < minimumNext) {
        return { ok: false, next_invoice_number: currentNext, error: `Use ${minimumNext} or higher. A lower number has already been issued.` };
      }
      const [settings] = await db.update(schema.appSettings)
        .set({ nextInvoiceNumber: args.starting_invoice_number, updatedAt: new Date() })
        .where(and(eq(schema.appSettings.id, 1), eq(schema.appSettings.nextInvoiceNumber, currentNext)))
        .returning();
      if (!settings) return { ok: false, next_invoice_number: currentNext, error: "Invoice numbering changed while you were saving. Refresh and try again." };
      ctx.invalidateQueries();
      return { ok: true, next_invoice_number: settings.nextInvoiceNumber };
    },
  }),

  createCustomer: defineAction({
    request: customerFieldsSchema,
    response: z.object({ ok: z.boolean(), customer: customerSchema.nullable(), error: z.string().optional() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const now = new Date();
      const [row] = await db.insert(schema.customers).values({
        name: args.name,
        businessName: args.business_name,
        phone: args.phone,
        email: args.email,
        taxId: args.tax_id,
        deliveryStreet: args.delivery_street,
        deliveryCity: args.delivery_city,
        deliveryState: args.delivery_state,
        deliveryZip: args.delivery_zip,
        apName: args.ap_name,
        apPhone: args.ap_phone,
        apEmail: args.ap_email,
        cardLast4: args.card_last4,
        cardExpiry: args.card_expiry,
        cardholderName: args.cardholder_name,
        taxStatus: args.tax_status,
        taxRateBps: args.tax_status === "exempt" ? 0 : (args.tax_rate_override_bps ?? stateTaxRateBps(args.delivery_state) ?? 0),
        taxRateOverrideBps: args.tax_rate_override_bps,
        printBalanceDue: args.print_balance_due ? 1 : 0,
        notes: args.notes,
        createdAt: now,
        updatedAt: now,
      }).returning();
      if (!row) return { ok: false, customer: null, error: "Could not create customer." };
      ctx.invalidateQueries();
      return { ok: true, customer: presentCustomer(row, 0) };
    },
  }),

  updateCustomer: defineAction({
    request: customerFieldsSchema.extend({ id: z.number().int().positive() }),
    response: z.object({ ok: z.boolean(), customer: customerSchema.nullable(), error: z.string().optional() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db.update(schema.customers).set({
        name: args.name,
        businessName: args.business_name,
        phone: args.phone,
        email: args.email,
        taxId: args.tax_id,
        deliveryStreet: args.delivery_street,
        deliveryCity: args.delivery_city,
        deliveryState: args.delivery_state,
        deliveryZip: args.delivery_zip,
        apName: args.ap_name,
        apPhone: args.ap_phone,
        apEmail: args.ap_email,
        cardLast4: args.card_last4,
        cardExpiry: args.card_expiry,
        cardholderName: args.cardholder_name,
        taxStatus: args.tax_status,
        taxRateBps: args.tax_status === "exempt" ? 0 : (args.tax_rate_override_bps ?? stateTaxRateBps(args.delivery_state) ?? 0),
        taxRateOverrideBps: args.tax_rate_override_bps,
        printBalanceDue: args.print_balance_due ? 1 : 0,
        notes: args.notes,
        updatedAt: new Date(),
      }).where(eq(schema.customers.id, args.id)).returning();
      if (!row) return { ok: false, customer: null, error: "Customer not found." };
      const [balanceRow] = await db.select({ balance: sql<number>`coalesce(sum(${schema.sales.totalCents} - ${schema.sales.paidCents}), 0)` }).from(schema.sales).where(eq(schema.sales.customerId, row.id));
      const wishlistCount = await openWishlistCount(ctx, row.id);
      ctx.invalidateQueries();
      return { ok: true, customer: presentCustomer(row, Number(balanceRow?.balance ?? 0), wishlistCount) };
    },
  }),

  listCustomers: defineAction({
    request: z.object({ query: z.string().max(120).default(""), limit: z.number().int().min(1).max(100).default(60) }),
    response: z.object({ customers: z.array(customerSchema), total: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const query = args.query.trim();
      const where = query
        ? or(
            like(schema.customers.name, `%${query}%`),
            like(schema.customers.businessName, `%${query}%`),
            like(schema.customers.phone, `%${query}%`),
            like(schema.customers.email, `%${query}%`),
          )
        : undefined;
      const rows = await db.select().from(schema.customers).where(where).orderBy(asc(schema.customers.businessName), asc(schema.customers.name)).limit(args.limit);
      const customerIds = rows.map((row) => row.id);
      const balanceRows = customerIds.length > 0
        ? await db
            .select({
              customerId: schema.sales.customerId,
              balance: sql<number>`coalesce(sum(${schema.sales.totalCents} - ${schema.sales.paidCents}), 0)`,
            })
            .from(schema.sales)
            .where(inArray(schema.sales.customerId, customerIds))
            .groupBy(schema.sales.customerId)
        : [];
      const balanceByCustomer = new Map<number, number>();
      for (const balanceRow of balanceRows) {
        if (balanceRow.customerId !== null) balanceByCustomer.set(balanceRow.customerId, Number(balanceRow.balance));
      }
      const wishlistRows = customerIds.length > 0
        ? await db
            .select({ customerId: schema.wishlistItems.customerId, count: sql<number>`count(*)` })
            .from(schema.wishlistItems)
            .where(and(inArray(schema.wishlistItems.customerId, customerIds), eq(schema.wishlistItems.status, "open")))
            .groupBy(schema.wishlistItems.customerId)
        : [];
      const wishlistByCustomer = new Map<number, number>();
      for (const wishRow of wishlistRows) wishlistByCustomer.set(wishRow.customerId, Number(wishRow.count));
      const [count] = await db.select({ count: sql<number>`count(*)` }).from(schema.customers).where(where);
      return {
        customers: rows.map((row) => presentCustomer(row, balanceByCustomer.get(row.id) ?? 0, wishlistByCustomer.get(row.id) ?? 0)),
        total: Number(count?.count ?? 0),
      };
    },
  }),

  getCustomerAccount: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ customer: customerSchema.nullable(), orders: z.array(saleSummarySchema), payments: z.array(paymentSchema), wishlist: z.array(wishlistItemSchema) }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [customer] = await db.select().from(schema.customers).where(eq(schema.customers.id, args.id)).limit(1);
      if (!customer) return { customer: null, orders: [], payments: [], wishlist: [] };
      const orderRows = await db.select().from(schema.sales).where(eq(schema.sales.customerId, args.id)).orderBy(desc(schema.sales.createdAt));
      const paymentRows = await db.select().from(schema.payments).where(eq(schema.payments.customerId, args.id)).orderBy(desc(schema.payments.createdAt));
      const wishlistRows = await db.select().from(schema.wishlistItems).where(eq(schema.wishlistItems.customerId, args.id)).orderBy(asc(schema.wishlistItems.status), desc(schema.wishlistItems.createdAt));
      const balance = orderRows.reduce((sum, order) => sum + order.totalCents - order.paidCents, 0);
      const openCount = wishlistRows.filter((row) => row.status === "open").length;
      return {
        customer: presentCustomer(customer, balance, openCount),
        orders: await presentSaleSummaries(ctx, orderRows),
        payments: paymentRows.map((payment) => ({ id: payment.id, sale_id: payment.saleId, amount_cents: payment.amountCents, method: payment.method, created_at: payment.createdAt.toISOString() })),
        wishlist: await Promise.all(wishlistRows.map((row) => presentWishlistItem(ctx, row))),
      };
    },
  }),

  addWishlistItem: defineAction({
    request: z.object({
      customer_id: z.number().int().positive(),
      product_id: z.number().int().positive().nullable().default(null),
      title: z.string().trim().max(300).default(""),
      notes: z.string().trim().max(1000).default(""),
    }),
    response: wishlistResponse,
    async handler(ctx, args): Promise<z.infer<typeof wishlistResponse>> {
      const db = ctx.db<typeof schema>();
      const [customer] = await db.select().from(schema.customers).where(eq(schema.customers.id, args.customer_id)).limit(1);
      if (!customer) return { ok: false, error: "Customer not found.", item: null };
      let title = args.title.trim();
      let productId: number | null = null;
      if (args.product_id !== null) {
        const [product] = await db.select().from(schema.products).where(eq(schema.products.id, args.product_id)).limit(1);
        if (!product) return { ok: false, error: "That product could not be found.", item: null };
        productId = product.id;
        if (!title) title = product.title;
      }
      if (!title) return { ok: false, error: "Add what the customer asked about — pick a product or type it in.", item: null };
      const [row] = await db.insert(schema.wishlistItems).values({ customerId: customer.id, productId, title, notes: args.notes.trim(), status: "open", createdAt: new Date(), doneAt: null }).returning();
      if (!row) return { ok: false, error: "Could not save that wishlist item.", item: null };
      ctx.invalidateQueries();
      return { ok: true, item: await presentWishlistItem(ctx, row) };
    },
  }),

  updateWishlistItem: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      title: z.string().trim().min(1).max(300),
      notes: z.string().trim().max(1000).default(""),
    }),
    response: wishlistResponse,
    async handler(ctx, args): Promise<z.infer<typeof wishlistResponse>> {
      const db = ctx.db<typeof schema>();
      const [row] = await db.update(schema.wishlistItems).set({ title: args.title.trim(), notes: args.notes.trim() }).where(eq(schema.wishlistItems.id, args.id)).returning();
      if (!row) return { ok: false, error: "Wishlist item not found.", item: null };
      ctx.invalidateQueries();
      return { ok: true, item: await presentWishlistItem(ctx, row) };
    },
  }),

  setWishlistStatus: defineAction({
    request: z.object({ id: z.number().int().positive(), status: z.enum(["open", "done"]) }),
    response: wishlistResponse,
    async handler(ctx, args): Promise<z.infer<typeof wishlistResponse>> {
      const db = ctx.db<typeof schema>();
      const [row] = await db.update(schema.wishlistItems).set({ status: args.status, doneAt: args.status === "done" ? new Date() : null }).where(eq(schema.wishlistItems.id, args.id)).returning();
      if (!row) return { ok: false, error: "Wishlist item not found.", item: null };
      ctx.invalidateQueries();
      return { ok: true, item: await presentWishlistItem(ctx, row) };
    },
  }),

  deleteWishlistItem: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.boolean(), error: z.string().optional() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db.delete(schema.wishlistItems).where(eq(schema.wishlistItems.id, args.id)).returning({ id: schema.wishlistItems.id });
      if (!row) return { ok: false, error: "Wishlist item not found." };
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  getCustomerPreferences: defineAction({
    request: z.object({ customer_id: z.number().int().positive() }),
    response: customerPreferencesResponse,
    async handler(ctx, args): Promise<z.infer<typeof customerPreferencesResponse>> {
      return buildCustomerPreferences(ctx, args.customer_id);
    },
  }),

  addCustomerPreference: defineAction({
    request: z.object({
      customer_id: z.number().int().positive(),
      product_id: z.number().int().positive().nullable().default(null),
      title: z.string().trim().max(300).default(""),
      note: z.string().trim().max(1000).default(""),
      pinned: z.boolean().default(true),
    }),
    response: manualPreferenceResponse,
    async handler(ctx, args): Promise<z.infer<typeof manualPreferenceResponse>> {
      const db = ctx.db<typeof schema>();
      const [customer] = await db.select().from(schema.customers).where(eq(schema.customers.id, args.customer_id)).limit(1);
      if (!customer) return { ok: false, error: "Customer not found.", preference: null };
      let title = args.title.trim();
      let productId: number | null = null;
      if (args.product_id !== null) {
        const [product] = await db.select().from(schema.products).where(eq(schema.products.id, args.product_id)).limit(1);
        if (!product) return { ok: false, error: "That product could not be found.", preference: null };
        productId = product.id;
        if (!title) title = product.title;
        const [existing] = await db.select().from(schema.customerPreferences).where(and(eq(schema.customerPreferences.customerId, customer.id), eq(schema.customerPreferences.productId, product.id))).limit(1);
        if (existing) {
          const [updated] = await db.update(schema.customerPreferences).set({ pinned: args.pinned ? 1 : 0, note: args.note.trim() || existing.note, title, updatedAt: new Date() }).where(eq(schema.customerPreferences.id, existing.id)).returning();
          if (!updated) return { ok: false, error: "Could not save that preference.", preference: null };
          ctx.invalidateQueries();
          return { ok: true, preference: await presentManualPreference(ctx, updated) };
        }
      }
      if (!title) return { ok: false, error: "Add what they usually get — pick a product or type it in.", preference: null };
      const now = new Date();
      const [row] = await db.insert(schema.customerPreferences).values({ customerId: customer.id, productId, title, note: args.note.trim(), pinned: args.pinned ? 1 : 0, createdAt: now, updatedAt: now }).returning();
      if (!row) return { ok: false, error: "Could not save that preference.", preference: null };
      ctx.invalidateQueries();
      return { ok: true, preference: await presentManualPreference(ctx, row) };
    },
  }),

  updateCustomerPreference: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      title: z.string().trim().min(1).max(300),
      note: z.string().trim().max(1000).default(""),
      pinned: z.boolean(),
    }),
    response: manualPreferenceResponse,
    async handler(ctx, args): Promise<z.infer<typeof manualPreferenceResponse>> {
      const db = ctx.db<typeof schema>();
      const [row] = await db.update(schema.customerPreferences).set({ title: args.title.trim(), note: args.note.trim(), pinned: args.pinned ? 1 : 0, updatedAt: new Date() }).where(eq(schema.customerPreferences.id, args.id)).returning();
      if (!row) return { ok: false, error: "Preference not found.", preference: null };
      ctx.invalidateQueries();
      return { ok: true, preference: await presentManualPreference(ctx, row) };
    },
  }),

  setCustomerPreferencePinned: defineAction({
    request: z.object({ id: z.number().int().positive(), pinned: z.boolean() }),
    response: manualPreferenceResponse,
    async handler(ctx, args): Promise<z.infer<typeof manualPreferenceResponse>> {
      const db = ctx.db<typeof schema>();
      const [row] = await db.update(schema.customerPreferences).set({ pinned: args.pinned ? 1 : 0, updatedAt: new Date() }).where(eq(schema.customerPreferences.id, args.id)).returning();
      if (!row) return { ok: false, error: "Preference not found.", preference: null };
      ctx.invalidateQueries();
      return { ok: true, preference: await presentManualPreference(ctx, row) };
    },
  }),

  deleteCustomerPreference: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.boolean(), error: z.string().optional() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db.delete(schema.customerPreferences).where(eq(schema.customerPreferences.id, args.id)).returning({ id: schema.customerPreferences.id });
      if (!row) return { ok: false, error: "Preference not found." };
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  recordPayment: defineAction({
    request: z.object({
      sale_id: z.string().min(1),
      amount_cents: z.number().int().min(1).max(100000000),
      method: z.enum(["cash", "card", "check"]),
    }),
    response: recordPaymentResponse,
    async handler(ctx, args): Promise<z.infer<typeof recordPaymentResponse>> {
      const db = ctx.db<typeof schema>();
      const [sale] = await db.select().from(schema.sales).where(eq(schema.sales.id, args.sale_id)).limit(1);
      if (!sale) return { ok: false, error: "Invoice not found.", sale_id: null, paid_cents: 0, balance_cents: 0, account_balance_cents: 0 };
      const remaining = sale.totalCents - sale.paidCents;
      if (remaining <= 0) return { ok: false, error: "This invoice is already paid in full.", sale_id: sale.id, paid_cents: sale.paidCents, balance_cents: 0, account_balance_cents: 0 };
      if (args.amount_cents > remaining) return { ok: false, error: "Payment cannot be more than the remaining balance on this invoice.", sale_id: sale.id, paid_cents: sale.paidCents, balance_cents: remaining, account_balance_cents: 0 };
      const newPaid = sale.paidCents + args.amount_cents;
      const newStatus = newPaid === sale.totalCents ? ("paid" as const) : ("partial" as const);
      const now = new Date();
      await db.batch([
        db.insert(schema.payments).values({ customerId: sale.customerId, saleId: sale.id, amountCents: args.amount_cents, method: args.method, createdAt: now }),
        db.update(schema.sales).set({ paidCents: newPaid, status: newStatus }).where(eq(schema.sales.id, sale.id)),
      ]);
      let accountBalance = 0;
      if (sale.customerId !== null) {
        const [balanceRow] = await db.select({ balance: sql<number>`coalesce(sum(${schema.sales.totalCents} - ${schema.sales.paidCents}), 0)` }).from(schema.sales).where(eq(schema.sales.customerId, sale.customerId));
        accountBalance = Number(balanceRow?.balance ?? 0);
      }
      ctx.invalidateQueries();
      return { ok: true, sale_id: sale.id, paid_cents: newPaid, balance_cents: sale.totalCents - newPaid, account_balance_cents: accountBalance };
    },
  }),

  createReturn: defineAction({
    request: z.object({
      sale_id: z.string().min(1),
      refund_method: z.enum(["cash", "card", "account_credit"]),
      items: z.array(z.object({
        sale_item_id: z.number().int().positive(),
        quantity: z.number().int().min(1).max(9999),
        reason: z.string().trim().max(300).default(""),
      })).min(1).max(200),
    }),
    response: createReturnResponse,
    async handler(ctx, args): Promise<z.infer<typeof createReturnResponse>> {
      const db = ctx.db<typeof schema>();
      const fail = (error: string): z.infer<typeof createReturnResponse> => ({ ok: false, error, return_id: null, refund_method: null, returned_cents: 0, refunded_cents: 0, credited_cents: 0, sale_total_cents: 0, sale_paid_cents: 0, sale_balance_cents: 0, account_balance_cents: 0 });
      const [sale] = await db.select().from(schema.sales).where(eq(schema.sales.id, args.sale_id)).limit(1);
      if (!sale) return fail("Invoice not found.");
      if (args.refund_method === "account_credit" && sale.customerId === null) return fail("Walk-in sales have no account to credit — refund cash or card instead.");
      // Combine duplicate lines for the same sold item.
      const requested = new Map<number, { quantity: number; reason: string }>();
      for (const item of args.items) {
        const existing = requested.get(item.sale_item_id);
        requested.set(item.sale_item_id, { quantity: (existing?.quantity ?? 0) + item.quantity, reason: item.reason || existing?.reason || "" });
      }
      for (const entry of requested.values()) {
        if (!entry.reason.trim()) return fail("Give a reason for every returned item.");
      }
      const saleItems = await db.select().from(schema.saleItems).where(eq(schema.saleItems.saleId, sale.id)).orderBy(asc(schema.saleItems.id));
      const saleItemById = new Map(saleItems.map((item) => [item.id, item]));
      for (const saleItemId of requested.keys()) {
        if (!saleItemById.has(saleItemId)) return fail("One of the returned items is not on this invoice.");
      }
      const priorReturns = await db.select().from(schema.returns).where(eq(schema.returns.saleId, sale.id));
      const priorReturnIds = priorReturns.map((row) => row.id);
      const priorItems = priorReturnIds.length > 0 ? await db.select().from(schema.returnItems).where(inArray(schema.returnItems.returnId, priorReturnIds)) : [];
      const alreadyReturned = new Map<number, number>();
      for (const item of priorItems) alreadyReturned.set(item.saleItemId, (alreadyReturned.get(item.saleItemId) ?? 0) + item.quantity);
      for (const [saleItemId, entry] of requested) {
        const sold = saleItemById.get(saleItemId);
        const available = (sold?.quantity ?? 0) - (alreadyReturned.get(saleItemId) ?? 0);
        if (entry.quantity > available) return fail(`${sold?.productTitle ?? "That item"} only has ${available} left to return on this invoice.`);
      }
      // Goods + pro-rated tax for this return. If this return empties the
      // invoice completely, hand back exactly the tax still on it so the
      // invoice zeroes out to the cent.
      let goodsCents = 0;
      for (const [saleItemId, entry] of requested) {
        const sold = saleItemById.get(saleItemId);
        goodsCents += (sold?.unitPriceCents ?? 0) * entry.quantity;
      }
      const emptiesInvoice = saleItems.every((item) => (alreadyReturned.get(item.id) ?? 0) + (requested.get(item.id)?.quantity ?? 0) >= item.quantity);
      const taxCents = sale.taxStatus === "exempt" || sale.taxRateBps === 0 ? 0 : emptiesInvoice ? sale.taxCents : Math.round(goodsCents * sale.taxRateBps / 10000);
      const returnedTotal = goodsCents + taxCents;
      if (returnedTotal <= 0) return fail("There is nothing to refund on those items.");
      // Cash / card refunds hand back money already collected (up to what was
      // paid); anything beyond that — and every on-account credit — comes off
      // what the customer owes, leaving a credit if they overpaid.
      const refundedCents = args.refund_method === "account_credit" ? 0 : Math.min(sale.paidCents, returnedTotal);
      const creditedCents = returnedTotal - refundedCents;
      const newSubtotal = sale.subtotalCents - goodsCents;
      const newTax = sale.taxCents - taxCents;
      const newTotal = sale.totalCents - returnedTotal;
      const newPaid = sale.paidCents - refundedCents;
      const newStatus = newPaid >= newTotal ? ("paid" as const) : newPaid === 0 ? ("unpaid" as const) : ("partial" as const);
      const returnId = crypto.randomUUID();
      const now = new Date();
      const productIds = [...new Set([...requested.keys()].map((saleItemId) => saleItemById.get(saleItemId)?.productId ?? 0))];
      const productRows = await db.select().from(schema.products).where(inArray(schema.products.id, productIds));
      const productById = new Map(productRows.map((product) => [product.id, product]));
      const returnedByProduct = new Map<number, number>();
      for (const [saleItemId, entry] of requested) {
        const productId = saleItemById.get(saleItemId)?.productId ?? 0;
        returnedByProduct.set(productId, (returnedByProduct.get(productId) ?? 0) + entry.quantity);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const batchOps: any[] = [
        db.insert(schema.returns).values({ id: returnId, saleId: sale.id, customerId: sale.customerId, customerName: sale.customerName, refundMethod: args.refund_method, subtotalCents: goodsCents, taxCents, totalCents: returnedTotal, refundedCents, creditedCents, createdAt: now }),
        db.insert(schema.returnItems).values([...requested.entries()].map(([saleItemId, entry]) => {
          const sold = saleItemById.get(saleItemId);
          return { returnId, saleItemId, productId: sold?.productId ?? 0, productTitle: sold?.productTitle ?? "", quantity: entry.quantity, unitPriceCents: sold?.unitPriceCents ?? 0, lineTotalCents: (sold?.unitPriceCents ?? 0) * entry.quantity, reason: entry.reason.trim() };
        })),
        db.update(schema.sales).set({ subtotalCents: newSubtotal, taxCents: newTax, totalCents: newTotal, paidCents: newPaid, status: newStatus }).where(eq(schema.sales.id, sale.id)),
      ];
      if (refundedCents > 0 && args.refund_method !== "account_credit") {
        batchOps.push(db.insert(schema.payments).values({ customerId: sale.customerId, saleId: sale.id, amountCents: -refundedCents, method: args.refund_method, createdAt: now }));
      }
      for (const [productId, quantity] of returnedByProduct) {
        const product = productById.get(productId);
        if (!product) continue;
        batchOps.push(db.update(schema.products).set({ quantity: product.quantity + quantity, updatedAt: now }).where(and(eq(schema.products.id, productId), eq(schema.products.quantity, product.quantity))));
      }
      await db.batch(batchOps as unknown as Parameters<typeof db.batch>[0]);
      let accountBalance = 0;
      if (sale.customerId !== null) {
        const [balanceRow] = await db.select({ balance: sql<number>`coalesce(sum(${schema.sales.totalCents} - ${schema.sales.paidCents}), 0)` }).from(schema.sales).where(eq(schema.sales.customerId, sale.customerId));
        accountBalance = Number(balanceRow?.balance ?? 0);
      }
      ctx.invalidateQueries();
      return { ok: true, return_id: returnId, refund_method: args.refund_method, returned_cents: returnedTotal, refunded_cents: refundedCents, credited_cents: creditedCents, sale_total_cents: newTotal, sale_paid_cents: newPaid, sale_balance_cents: newTotal - newPaid, account_balance_cents: accountBalance };
    },
  }),

  completeSale: defineAction({
    request: z.object({
      customer_id: z.number().int().positive().nullable(),
      items: z.array(z.object({ product_id: z.number().int().positive(), quantity: z.number().int().min(1).max(9999) })).min(1).max(200),
      payment_method: z.enum(["cash", "card", "check"]),
      payment_cents: z.number().int().min(0).max(100000000),
      balance_payment_cents: z.number().int().min(0).max(100000000).default(0),
      salesperson: salespersonSchema.default("Randy"),
    }),
    response: checkoutResponse,
    async handler(ctx, args): Promise<z.infer<typeof checkoutResponse>> {
      const db = ctx.db<typeof schema>();
      const fail = (error: string, subtotal_cents = 0, tax_cents = 0, tax_rate_bps = 0, total_cents = 0, old_balance_cents = 0): z.infer<typeof checkoutResponse> => ({ ok: false, error, sale_id: null, invoice_number: null, salesperson: null, subtotal_cents, tax_cents, tax_rate_bps, total_cents, paid_cents: 0, old_balance_cents, balance_paid_cents: 0, collected_cents: 0, account_balance_cents: 0 });
      const combined = new Map<number, number>();
      for (const item of args.items) combined.set(item.product_id, (combined.get(item.product_id) ?? 0) + item.quantity);
      const ids = [...combined.keys()];
      const productRows = await db.select().from(schema.products).where(inArray(schema.products.id, ids));
      if (productRows.length !== ids.length) return fail("One or more products could not be found.");
      for (const product of productRows) {
        const requested = combined.get(product.id) ?? 0;
        if (requested > product.quantity) return fail(`${product.title} only has ${product.quantity} on hand.`);
      }
      let customer: typeof schema.customers.$inferSelect | null = null;
      if (args.customer_id !== null) {
        const [found] = await db.select().from(schema.customers).where(eq(schema.customers.id, args.customer_id)).limit(1);
        if (!found) return fail("Customer not found.");
        customer = found;
      }
      const subtotal = productRows.reduce((sum, product) => sum + product.priceCents * (combined.get(product.id) ?? 0), 0);
      const taxStatus = customer?.taxStatus ?? "taxable";
      // Walk-in customers (no record) are always charged 7% RI sales tax.
      const taxRateBps = customer ? resolveCustomerTax(customer).rateBps : 700;
      const tax = taxStatus === "exempt" ? 0 : Math.round(subtotal * taxRateBps / 10000);
      const total = subtotal + tax;
      // Prior balance owed before this sale
      let oldUnpaid: Array<typeof schema.sales.$inferSelect> = [];
      let oldBalance = 0;
      if (customer) {
        oldUnpaid = await db.select().from(schema.sales).where(eq(schema.sales.customerId, customer.id)).orderBy(asc(schema.sales.createdAt));
        oldUnpaid = oldUnpaid.filter((s) => s.totalCents - s.paidCents > 0);
        oldBalance = oldUnpaid.reduce((sum, s) => sum + (s.totalCents - s.paidCents), 0);
      }
      const balancePayment = args.balance_payment_cents ?? 0;
      if (args.payment_cents > total) return fail("Payment for today's invoice cannot be more than today's total.", subtotal, tax, taxRateBps, total, oldBalance);
      if (balancePayment > oldBalance) return fail("Payment toward the old balance cannot be more than the outstanding balance.", subtotal, tax, taxRateBps, total, oldBalance);
      if (!customer && balancePayment !== 0) return fail("Walk-in sales cannot include a balance payment.", subtotal, tax, taxRateBps, total, oldBalance);
      if (!customer && args.payment_cents !== total) return fail("Walk-in sales must be paid in full.", subtotal, tax, taxRateBps, total, oldBalance);
      const status = args.payment_cents === total ? "paid" as const : args.payment_cents === 0 ? "unpaid" as const : "partial" as const;
      const saleId = crypto.randomUUID();
      const now = new Date();
      await db.insert(schema.appSettings).values({ id: 1, nextInvoiceNumber: 1001, updatedAt: now }).onConflictDoNothing({ target: schema.appSettings.id });
      const [settings] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.id, 1)).limit(1);
      const invoiceNumber = settings?.nextInvoiceNumber ?? 1001;
      const saleInsert = db.insert(schema.sales).values({ id: saleId, invoiceNumber: sql`(select ${schema.appSettings.nextInvoiceNumber} from ${schema.appSettings} where ${schema.appSettings.id} = 1)`, customerId: customer?.id ?? null, customerName: customer?.name ?? "Walk-in", subtotalCents: subtotal, taxCents: tax, taxRateBps, taxStatus, totalCents: total, paidCents: args.payment_cents, status, salesperson: args.salesperson, createdAt: now });
      const itemsInsert = db.insert(schema.saleItems).values(productRows.map((product) => ({ saleId, productId: product.id, productTitle: product.title, quantity: combined.get(product.id) ?? 0, unitPriceCents: product.priceCents, lineTotalCents: product.priceCents * (combined.get(product.id) ?? 0) })));
      const sequenceUpdate = db.update(schema.appSettings).set({ nextInvoiceNumber: sql`${schema.appSettings.nextInvoiceNumber} + 1`, updatedAt: now }).where(eq(schema.appSettings.id, 1));
      const stockUpdates = productRows.map((product) => db.update(schema.products).set({ quantity: product.quantity - (combined.get(product.id) ?? 0), updatedAt: now }).where(and(eq(schema.products.id, product.id), eq(schema.products.quantity, product.quantity))));
      // Build batch: new sale + items + payments + balance allocation FIFO + sequence + stock
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const batchOps: any[] = [saleInsert, itemsInsert];
      if (args.payment_cents > 0) {
        batchOps.push(db.insert(schema.payments).values({ customerId: customer?.id ?? null, saleId, amountCents: args.payment_cents, method: args.payment_method, createdAt: now }));
      }
      let remainingBalancePayment = balancePayment;
      for (const oldSale of oldUnpaid) {
        if (remainingBalancePayment <= 0) break;
        const owed = oldSale.totalCents - oldSale.paidCents;
        const alloc = Math.min(owed, remainingBalancePayment);
        if (alloc <= 0) continue;
        const newPaid = oldSale.paidCents + alloc;
        const newStatus = newPaid === oldSale.totalCents ? "paid" as const : "partial" as const;
        batchOps.push(db.insert(schema.payments).values({ customerId: customer?.id ?? null, saleId: oldSale.id, amountCents: alloc, method: args.payment_method, createdAt: now }));
        batchOps.push(db.update(schema.sales).set({ paidCents: newPaid, status: newStatus }).where(eq(schema.sales.id, oldSale.id)));
        remainingBalancePayment -= alloc;
      }
      batchOps.push(sequenceUpdate, ...stockUpdates);
      await db.batch(batchOps as unknown as Parameters<typeof db.batch>[0]);
      let accountBalance = 0;
      if (customer) {
        const [balanceRow] = await db.select({ balance: sql<number>`coalesce(sum(${schema.sales.totalCents} - ${schema.sales.paidCents}), 0)` }).from(schema.sales).where(eq(schema.sales.customerId, customer.id));
        accountBalance = Number(balanceRow?.balance ?? 0);
      }
      ctx.invalidateQueries();
      return { ok: true, sale_id: saleId, invoice_number: invoiceNumber, salesperson: args.salesperson, subtotal_cents: subtotal, tax_cents: tax, tax_rate_bps: taxRateBps, total_cents: total, paid_cents: args.payment_cents, old_balance_cents: oldBalance, balance_paid_cents: balancePayment, collected_cents: args.payment_cents + balancePayment, account_balance_cents: accountBalance };
    },
  }),

  listFieldOrders: defineAction({
    request: z.object({
      status: z.enum(["draft", "finalized", "all"]).default("all"),
      limit: z.number().int().min(1).max(100).default(50),
    }),
    response: z.object({ orders: z.array(fieldOrderSchema), draft_count: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const where = args.status === "all" ? undefined : eq(schema.fieldOrders.status, args.status);
      const rows = await db.select().from(schema.fieldOrders).where(where).orderBy(desc(schema.fieldOrders.updatedAt)).limit(args.limit);
      const [draftRow] = await db.select({ count: sql<number>`count(*)` }).from(schema.fieldOrders).where(eq(schema.fieldOrders.status, "draft"));
      return { orders: await Promise.all(rows.map((row) => presentFieldOrder(ctx, row))), draft_count: Number(draftRow?.count ?? 0) };
    },
  }),

  createFieldOrder: defineAction({
    request: z.object({
      customer_id: z.number().int().positive(),
      created_by: salespersonSchema.default("Randy"),
      notes: z.string().trim().max(1000).default(""),
      items: fieldOrderItemsInput,
    }),
    response: fieldOrderResponse,
    async handler(ctx, args): Promise<z.infer<typeof fieldOrderResponse>> {
      const db = ctx.db<typeof schema>();
      const [customer] = await db.select().from(schema.customers).where(eq(schema.customers.id, args.customer_id)).limit(1);
      if (!customer) return { ok: false, error: "Customer not found.", order: null };
      const combined = new Map<number, number>();
      for (const item of args.items) combined.set(item.product_id, (combined.get(item.product_id) ?? 0) + item.quantity);
      const ids = [...combined.keys()];
      const productRows = await db.select().from(schema.products).where(inArray(schema.products.id, ids));
      if (productRows.length !== ids.length) return { ok: false, error: "One or more products could not be found.", order: null };
      const orderId = crypto.randomUUID();
      const now = new Date();
      const productById = new Map(productRows.map((product) => [product.id, product]));
      await db.batch([
        db.insert(schema.fieldOrders).values({ id: orderId, customerId: customer.id, customerName: customer.name, status: "draft", notes: args.notes, createdBy: args.created_by, saleId: null, finalizedAt: null, createdAt: now, updatedAt: now }),
        db.insert(schema.fieldOrderItems).values(ids.map((productId) => {
          const product = productById.get(productId);
          const quantity = combined.get(productId) ?? 0;
          const unitPrice = product?.priceCents ?? 0;
          return { fieldOrderId: orderId, productId, productTitle: product?.title ?? "", partNumber: product?.partNumber ?? "", quantity, unitPriceCents: unitPrice, lineTotalCents: unitPrice * quantity };
        })),
      ]);
      const [row] = await db.select().from(schema.fieldOrders).where(eq(schema.fieldOrders.id, orderId)).limit(1);
      if (!row) return { ok: false, error: "Could not save the draft.", order: null };
      ctx.invalidateQueries();
      return { ok: true, order: await presentFieldOrder(ctx, row) };
    },
  }),

  updateFieldOrder: defineAction({
    request: z.object({
      id: z.string().min(1),
      notes: z.string().trim().max(1000).default(""),
      items: fieldOrderItemsInput,
    }),
    response: fieldOrderResponse,
    async handler(ctx, args): Promise<z.infer<typeof fieldOrderResponse>> {
      const db = ctx.db<typeof schema>();
      const [existing] = await db.select().from(schema.fieldOrders).where(eq(schema.fieldOrders.id, args.id)).limit(1);
      if (!existing) return { ok: false, error: "Field order not found.", order: null };
      if (existing.status !== "draft") return { ok: false, error: "Only drafts can be edited. This order is already finalized.", order: null };
      const combined = new Map<number, number>();
      for (const item of args.items) combined.set(item.product_id, (combined.get(item.product_id) ?? 0) + item.quantity);
      const ids = [...combined.keys()];
      const productRows = await db.select().from(schema.products).where(inArray(schema.products.id, ids));
      if (productRows.length !== ids.length) return { ok: false, error: "One or more products could not be found.", order: null };
      const productById = new Map(productRows.map((product) => [product.id, product]));
      const now = new Date();
      await db.batch([
        db.delete(schema.fieldOrderItems).where(eq(schema.fieldOrderItems.fieldOrderId, args.id)),
        db.insert(schema.fieldOrderItems).values(ids.map((productId) => {
          const product = productById.get(productId);
          const quantity = combined.get(productId) ?? 0;
          const unitPrice = product?.priceCents ?? 0;
          return { fieldOrderId: args.id, productId, productTitle: product?.title ?? "", partNumber: product?.partNumber ?? "", quantity, unitPriceCents: unitPrice, lineTotalCents: unitPrice * quantity };
        })),
        db.update(schema.fieldOrders).set({ notes: args.notes, updatedAt: now }).where(eq(schema.fieldOrders.id, args.id)),
      ]);
      const [row] = await db.select().from(schema.fieldOrders).where(eq(schema.fieldOrders.id, args.id)).limit(1);
      if (!row) return { ok: false, error: "Could not save the draft.", order: null };
      ctx.invalidateQueries();
      return { ok: true, order: await presentFieldOrder(ctx, row) };
    },
  }),

  cancelFieldOrder: defineAction({
    request: z.object({ id: z.string().min(1) }),
    response: fieldOrderResponse,
    async handler(ctx, args): Promise<z.infer<typeof fieldOrderResponse>> {
      const db = ctx.db<typeof schema>();
      const [existing] = await db.select().from(schema.fieldOrders).where(eq(schema.fieldOrders.id, args.id)).limit(1);
      if (!existing) return { ok: false, error: "Field order not found.", order: null };
      if (existing.status !== "draft") return { ok: false, error: "Only drafts can be cancelled.", order: null };
      const [row] = await db.update(schema.fieldOrders).set({ status: "cancelled", updatedAt: new Date() }).where(eq(schema.fieldOrders.id, args.id)).returning();
      if (!row) return { ok: false, error: "Could not cancel the draft.", order: null };
      ctx.invalidateQueries();
      return { ok: true, order: await presentFieldOrder(ctx, row) };
    },
  }),

  finalizeFieldOrder: defineAction({
    request: z.object({ id: z.string().min(1) }),
    response: finalizeFieldOrderResponse,
    async handler(ctx, args): Promise<z.infer<typeof finalizeFieldOrderResponse>> {
      const db = ctx.db<typeof schema>();
      const fail = (error: string): z.infer<typeof finalizeFieldOrderResponse> => ({ ok: false, error, order: null, sale_id: null, invoice_number: null, total_cents: 0, tax_cents: 0, account_balance_cents: 0 });
      const [order] = await db.select().from(schema.fieldOrders).where(eq(schema.fieldOrders.id, args.id)).limit(1);
      if (!order) return fail("Field order not found.");
      if (order.status === "finalized") return fail("This order was already finalized.");
      if (order.status !== "draft") return fail("Only drafts can be finalized.");
      const itemRows = await db.select().from(schema.fieldOrderItems).where(eq(schema.fieldOrderItems.fieldOrderId, order.id)).orderBy(asc(schema.fieldOrderItems.id));
      if (itemRows.length === 0) return fail("This draft has no items.");
      const [customer] = await db.select().from(schema.customers).where(eq(schema.customers.id, order.customerId)).limit(1);
      if (!customer) return fail("Customer not found.");
      const productIds = itemRows.map((item) => item.productId);
      const productRows = await db.select().from(schema.products).where(inArray(schema.products.id, productIds));
      if (productRows.length !== productIds.length) return fail("One or more products could not be found.");
      const productById = new Map(productRows.map((product) => [product.id, product]));
      for (const item of itemRows) {
        const product = productById.get(item.productId);
        if (!product) return fail("One or more products could not be found.");
        if (item.quantity > product.quantity) return fail(`${product.title} only has ${product.quantity} on hand — this order needs ${item.quantity}. Adjust the quantity to finalize.`);
      }
      const subtotal = itemRows.reduce((sum, item) => sum + item.lineTotalCents, 0);
      const taxInfo = resolveCustomerTax(customer);
      const taxRateBps = customer.taxStatus === "exempt" ? 0 : taxInfo.rateBps;
      const tax = customer.taxStatus === "exempt" ? 0 : Math.round(subtotal * taxRateBps / 10000);
      const total = subtotal + tax;
      const saleId = crypto.randomUUID();
      const now = new Date();
      await db.insert(schema.appSettings).values({ id: 1, nextInvoiceNumber: 1001, updatedAt: now }).onConflictDoNothing({ target: schema.appSettings.id });
      const [settings] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.id, 1)).limit(1);
      const invoiceNumber = settings?.nextInvoiceNumber ?? 1001;
      const saleInsert = db.insert(schema.sales).values({ id: saleId, invoiceNumber: sql`(select ${schema.appSettings.nextInvoiceNumber} from ${schema.appSettings} where ${schema.appSettings.id} = 1)`, customerId: customer.id, customerName: customer.name, subtotalCents: subtotal, taxCents: tax, taxRateBps, taxStatus: customer.taxStatus, totalCents: total, paidCents: 0, status: "unpaid", salesperson: order.createdBy, createdAt: now });
      const itemsInsert = db.insert(schema.saleItems).values(itemRows.map((item) => ({ saleId, productId: item.productId, productTitle: item.productTitle, quantity: item.quantity, unitPriceCents: item.unitPriceCents, lineTotalCents: item.lineTotalCents })));
      const sequenceUpdate = db.update(schema.appSettings).set({ nextInvoiceNumber: sql`${schema.appSettings.nextInvoiceNumber} + 1`, updatedAt: now }).where(eq(schema.appSettings.id, 1));
      const stockUpdates = itemRows.map((item) => {
        const product = productById.get(item.productId);
        return db.update(schema.products).set({ quantity: (product?.quantity ?? 0) - item.quantity, updatedAt: now }).where(and(eq(schema.products.id, item.productId), eq(schema.products.quantity, product?.quantity ?? 0)));
      });
      const orderUpdate = db.update(schema.fieldOrders).set({ status: "finalized", saleId, finalizedAt: now, updatedAt: now }).where(and(eq(schema.fieldOrders.id, order.id), eq(schema.fieldOrders.status, "draft")));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const batchOps: any[] = [saleInsert, itemsInsert, sequenceUpdate, ...stockUpdates, orderUpdate];
      await db.batch(batchOps as unknown as Parameters<typeof db.batch>[0]);
      const [balanceRow] = await db.select({ balance: sql<number>`coalesce(sum(${schema.sales.totalCents} - ${schema.sales.paidCents}), 0)` }).from(schema.sales).where(eq(schema.sales.customerId, customer.id));
      const [updated] = await db.select().from(schema.fieldOrders).where(eq(schema.fieldOrders.id, order.id)).limit(1);
      ctx.invalidateQueries();
      return { ok: true, order: updated ? await presentFieldOrder(ctx, updated) : null, sale_id: saleId, invoice_number: invoiceNumber, total_cents: total, tax_cents: tax, account_balance_cents: Number(balanceRow?.balance ?? 0) };
    },
  }),

  getSalesBySalesperson: defineAction({
    request: z.object({
      salesperson: salespersonSchema.nullable().default(null),
      limit: z.number().int().min(1).max(100).default(50),
    }),
    response: z.object({
      summary: z.array(z.object({ salesperson: salespersonSchema, sale_count: z.number(), total_cents: z.number(), paid_cents: z.number(), balance_cents: z.number() })),
      sales: z.array(saleSummarySchema),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const summaryRows = await db.select({
        salesperson: schema.sales.salesperson,
        saleCount: sql<number>`count(*)`,
        totalCents: sql<number>`coalesce(sum(${schema.sales.totalCents}), 0)`,
        paidCents: sql<number>`coalesce(sum(${schema.sales.paidCents}), 0)`,
      }).from(schema.sales).groupBy(schema.sales.salesperson);
      const summaryMap = new Map<string, { sale_count: number; total_cents: number; paid_cents: number }>();
      for (const row of summaryRows) summaryMap.set(row.salesperson, { sale_count: Number(row.saleCount), total_cents: Number(row.totalCents), paid_cents: Number(row.paidCents) });
      const team = await ensureSalesTeam(ctx);
      const teamNames = team.filter((m) => m.active === 1).map((m) => m.name);
      const extraNames = [...summaryMap.keys()].filter((n) => !teamNames.includes(n));
      const allPeople = [...teamNames, ...extraNames];
      const summary = allPeople.map((person) => {
        const entry = summaryMap.get(person) ?? { sale_count: 0, total_cents: 0, paid_cents: 0 };
        return { salesperson: person, sale_count: entry.sale_count, total_cents: entry.total_cents, paid_cents: entry.paid_cents, balance_cents: entry.total_cents - entry.paid_cents };
      });
      const where = args.salesperson ? eq(schema.sales.salesperson, args.salesperson) : undefined;
      const saleRows = await db.select().from(schema.sales).where(where).orderBy(desc(schema.sales.createdAt)).limit(args.limit);
      return {
        summary,
        sales: await presentSaleSummaries(ctx, saleRows),
      };
    },
  }),

  getSalespersonReport: defineAction({
    request: analyticsRange.extend({ salesperson: salespersonSchema.nullable().default(null) }),
    response: salespersonReportResponse,
    async handler(ctx, args): Promise<z.infer<typeof salespersonReportResponse>> {
      const db = ctx.db<typeof schema>();
      const { start, endExclusive } = rangeBounds(args);
      const range = rangeCondition(start, endExclusive);
      const saleRows = await db.select().from(schema.sales).where(range).orderBy(desc(schema.sales.createdAt));
      const { itemRows, returnRows, returnedBySaleItem } = await netLinesForSales(ctx, saleRows.map((row) => row.id));
      const productIds = [...new Set(itemRows.map((item) => item.productId))];
      const productRows = productIds.length > 0 ? await db.select().from(schema.products).where(inArray(schema.products.id, productIds)) : [];
      const costByProduct = new Map(productRows.map((product) => [product.id, product.costCents]));
      const saleByIdLocal = new Map(saleRows.map((row) => [row.id, row]));
      const returnsBySale = new Map<string, number>();
      for (const ret of returnRows) returnsBySale.set(ret.saleId, (returnsBySale.get(ret.saleId) ?? 0) + ret.totalCents);

      type Acc = { sale_count: number; units_sold: number; subtotal_cents: number; tax_cents: number; total_cents: number; paid_cents: number; returns_cents: number; profit_cents: number };
      const blank = (): Acc => ({ sale_count: 0, units_sold: 0, subtotal_cents: 0, tax_cents: 0, total_cents: 0, paid_cents: 0, returns_cents: 0, profit_cents: 0 });
      const byPerson = new Map<string, Acc>();
      for (const sale of saleRows) {
        const acc = byPerson.get(sale.salesperson) ?? blank();
        acc.sale_count += 1;
        acc.subtotal_cents += sale.subtotalCents;
        acc.tax_cents += sale.taxCents;
        acc.total_cents += sale.totalCents;
        acc.paid_cents += sale.paidCents;
        acc.returns_cents += returnsBySale.get(sale.id) ?? 0;
        byPerson.set(sale.salesperson, acc);
      }
      for (const item of itemRows) {
        const sale = saleByIdLocal.get(item.saleId);
        if (!sale) continue;
        const returned = returnedBySaleItem.get(item.id) ?? { netQty: 0, netRevenueCents: 0 };
        const netQty = item.quantity - returned.netQty;
        const netRevenue = item.lineTotalCents - returned.netRevenueCents;
        const acc = byPerson.get(sale.salesperson) ?? blank();
        acc.units_sold += netQty;
        acc.profit_cents += netRevenue - (costByProduct.get(item.productId) ?? 0) * netQty;
        byPerson.set(sale.salesperson, acc);
      }
      const team = await ensureSalesTeam(ctx);
      const rateByName = new Map(team.map((m) => [m.name, m.commissionBps]));
      const teamNames = team.map((m) => m.name);
      const extraNames = [...byPerson.keys()].filter((n) => !teamNames.includes(n));
      const people = [...teamNames, ...extraNames];
      const rows = people.map((person) => {
        const acc = byPerson.get(person) ?? blank();
        const commissionBps = rateByName.get(person) ?? 0;
        return {
          salesperson: person,
          sale_count: acc.sale_count,
          units_sold: acc.units_sold,
          subtotal_cents: acc.subtotal_cents,
          tax_cents: acc.tax_cents,
          total_cents: acc.total_cents,
          paid_cents: acc.paid_cents,
          balance_cents: acc.total_cents - acc.paid_cents,
          returns_cents: acc.returns_cents,
          profit_cents: acc.profit_cents,
          avg_sale_cents: acc.sale_count > 0 ? Math.round(acc.total_cents / acc.sale_count) : 0,
          commission_bps: commissionBps,
          commission_cents: Math.round(acc.subtotal_cents * commissionBps / 10000),
        };
      });
      const totals = rows.reduce((sum, row) => ({
        sale_count: sum.sale_count + row.sale_count,
        units_sold: sum.units_sold + row.units_sold,
        subtotal_cents: sum.subtotal_cents + row.subtotal_cents,
        tax_cents: sum.tax_cents + row.tax_cents,
        total_cents: sum.total_cents + row.total_cents,
        paid_cents: sum.paid_cents + row.paid_cents,
        balance_cents: sum.balance_cents + row.balance_cents,
        returns_cents: sum.returns_cents + row.returns_cents,
        profit_cents: sum.profit_cents + row.profit_cents,
        commission_cents: sum.commission_cents + row.commission_cents,
      }), { sale_count: 0, units_sold: 0, subtotal_cents: 0, tax_cents: 0, total_cents: 0, paid_cents: 0, balance_cents: 0, returns_cents: 0, profit_cents: 0, commission_cents: 0 });
      const filtered = args.salesperson ? saleRows.filter((row) => row.salesperson === args.salesperson) : saleRows;
      return { rows, totals, sales: await presentSaleSummaries(ctx, filtered.slice(0, 100)) };
    },
  }),

  getItemAnalytics: defineAction({
    request: analyticsRange.extend({
      sort_by: z.enum(["profit", "units", "revenue", "margin", "title"]).default("profit"),
      sort_dir: z.enum(["asc", "desc"]).default("desc"),
    }),
    response: itemAnalyticsResponse,
    async handler(ctx, args): Promise<z.infer<typeof itemAnalyticsResponse>> {
      const db = ctx.db<typeof schema>();
      const { start, endExclusive } = rangeBounds(args);
      const range = rangeCondition(start, endExclusive);
      const saleRows = await db.select({ id: schema.sales.id }).from(schema.sales).where(range);
      const { itemRows, returnedBySaleItem } = await netLinesForSales(ctx, saleRows.map((row) => row.id));
      const productIds = [...new Set(itemRows.map((item) => item.productId))];
      const productRows = productIds.length > 0 ? await db.select().from(schema.products).where(inArray(schema.products.id, productIds)) : [];
      const productById = new Map(productRows.map((product) => [product.id, product]));

      type Acc = { title: string; grossUnits: number; returnedUnits: number; grossRevenue: number; returnedRevenue: number; sales: Set<string> };
      const byProduct = new Map<number, Acc>();
      for (const item of itemRows) {
        const returned = returnedBySaleItem.get(item.id) ?? { netQty: 0, netRevenueCents: 0 };
        const acc = byProduct.get(item.productId) ?? { title: item.productTitle, grossUnits: 0, returnedUnits: 0, grossRevenue: 0, returnedRevenue: 0, sales: new Set<string>() };
        acc.grossUnits += item.quantity;
        acc.returnedUnits += returned.netQty;
        acc.grossRevenue += item.lineTotalCents;
        acc.returnedRevenue += returned.netRevenueCents;
        acc.sales.add(item.saleId);
        byProduct.set(item.productId, acc);
      }
      const rows: Array<z.infer<typeof itemAnalyticsRow>> = [];
      for (const [productId, acc] of byProduct) {
        const netUnits = acc.grossUnits - acc.returnedUnits;
        const netRevenue = acc.grossRevenue - acc.returnedRevenue;
        if (netUnits <= 0 && netRevenue <= 0) continue;
        const product = productById.get(productId);
        const unitCost = product?.costCents ?? 0;
        const costTotal = unitCost * netUnits;
        const profit = netRevenue - costTotal;
        rows.push({
          product_id: productId,
          product_title: acc.title,
          part_number: product?.partNumber ?? "",
          sku: product?.sku ?? "",
          vendor: product?.vendor ?? "",
          thumbnail_url: null,
          units_sold: netUnits,
          returned_units: acc.returnedUnits,
          revenue_cents: netRevenue,
          unit_cost_cents: unitCost,
          cost_cents: costTotal,
          profit_cents: profit,
          margin_bps: netRevenue > 0 ? Math.round((profit / netRevenue) * 10000) : 0,
          sale_count: acc.sales.size,
        });
      }
      const withThumbs = await Promise.all(rows.map(async (row) => {
        const product = productById.get(row.product_id);
        const url = product?.imageBlobKey ? await ctx.blobs.getUrl(product.imageBlobKey, { expiresInSeconds: 3600 }) : product?.thumbnailUrl ?? null;
        return { ...row, thumbnail_url: url };
      }));
      const dir = args.sort_dir === "asc" ? 1 : -1;
      const key = (row: z.infer<typeof itemAnalyticsRow>): number | string => args.sort_by === "profit" ? row.profit_cents : args.sort_by === "units" ? row.units_sold : args.sort_by === "revenue" ? row.revenue_cents : args.sort_by === "margin" ? row.margin_bps : row.product_title.toLowerCase();
      withThumbs.sort((a, b) => {
        const av = key(a);
        const bv = key(b);
        if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
        return (Number(av) - Number(bv)) * dir;
      });
      const totals = withThumbs.reduce((sum, row) => ({
        units_sold: sum.units_sold + row.units_sold,
        revenue_cents: sum.revenue_cents + row.revenue_cents,
        cost_cents: sum.cost_cents + row.cost_cents,
        profit_cents: sum.profit_cents + row.profit_cents,
        item_count: sum.item_count + 1,
      }), { units_sold: 0, revenue_cents: 0, cost_cents: 0, profit_cents: 0, item_count: 0 });
      return { rows: withThumbs, totals };
    },
  }),

  getSupplierSettings: defineAction({
    request: z.object({}),
    response: z.object({
      medco_min_order_cents: z.number(),
      oak_min_order_cents: z.number(),
      next_po_number: z.number(),
    }),
    async handler(ctx) {
      const settings = await ensurePoSettings(ctx);
      return {
        medco_min_order_cents: settings?.medcoMinOrderCents ?? 0,
        oak_min_order_cents: settings?.oakMinOrderCents ?? 0,
        next_po_number: settings?.nextPoNumber ?? 1001,
      };
    },
  }),

  updateSupplierSettings: defineAction({
    request: z.object({
      medco_min_order_cents: z.number().int().min(0).max(100000000),
      oak_min_order_cents: z.number().int().min(0).max(100000000),
    }),
    response: z.object({ ok: z.boolean(), medco_min_order_cents: z.number(), oak_min_order_cents: z.number(), error: z.string().optional() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      await ensurePoSettings(ctx);
      const [row] = await db.update(schema.appSettings).set({ medcoMinOrderCents: args.medco_min_order_cents, oakMinOrderCents: args.oak_min_order_cents, updatedAt: new Date() }).where(eq(schema.appSettings.id, 1)).returning();
      if (!row) return { ok: false, medco_min_order_cents: 0, oak_min_order_cents: 0, error: "Could not save supplier settings." };
      ctx.invalidateQueries();
      return { ok: true, medco_min_order_cents: row.medcoMinOrderCents, oak_min_order_cents: row.oakMinOrderCents };
    },
  }),

  updateSupplierInfo: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      inbound_qty: z.number().int().min(0).max(999999),
      medco_cost_cents: z.number().int().min(0).max(100000000),
      oak_cost_cents: z.number().int().min(0).max(100000000),
      medco_moq: z.number().int().min(1).max(9999),
      oak_moq: z.number().int().min(1).max(9999),
      medco_available: z.boolean(),
      oak_available: z.boolean(),
    }),
    response: updateResponse,
    async handler(ctx, args): Promise<z.infer<typeof updateResponse>> {
      const db = ctx.db<typeof schema>();
      const [row] = await db.update(schema.products).set({
        inboundQty: args.inbound_qty,
        medcoCostCents: args.medco_cost_cents,
        oakCostCents: args.oak_cost_cents,
        medcoMoq: args.medco_moq,
        oakMoq: args.oak_moq,
        medcoAvailable: args.medco_available ? 1 : 0,
        oakAvailable: args.oak_available ? 1 : 0,
        updatedAt: new Date(),
      }).where(eq(schema.products.id, args.id)).returning();
      if (!row) return { ok: false, error: "Product not found.", product: null };
      ctx.invalidateQueries();
      return { ok: true, product: await presentProduct(ctx, row) };
    },
  }),

  previewReorderNeeds: defineAction({
    request: z.object({}),
    response: z.object({
      needs: z.array(reorderNeedSchema),
      orderable_count: z.number(),
      unassigned_count: z.number(),
      medco_total_cents: z.number(),
      oak_total_cents: z.number(),
      has_draft: z.boolean(),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.products).where(and(eq(schema.products.status, "active"), gt(schema.products.parLevel, 0))).orderBy(desc(sql<number>`${schema.products.parLevel} - ${schema.products.quantity} - ${schema.products.inboundQty}`), asc(schema.products.title));
      const needs: Array<z.infer<typeof reorderNeedSchema>> = [];
      for (const row of rows) {
        const thumb = row.imageBlobKey ? await ctx.blobs.getUrl(row.imageBlobKey, { expiresInSeconds: 3600 }) : row.thumbnailUrl ?? null;
        const need = buildNeedRow(row, thumb);
        if (need) needs.push(need);
      }
      const [draftRow] = await db.select({ count: sql<number>`count(*)` }).from(schema.purchaseOrders).where(eq(schema.purchaseOrders.status, "draft"));
      return {
        needs,
        orderable_count: needs.filter((need) => need.orderable).length,
        unassigned_count: needs.filter((need) => !need.orderable).length,
        medco_total_cents: needs.filter((need) => need.chosen_supplier === "medco").reduce((sum, need) => sum + need.order_qty * need.chosen_cost_cents, 0),
        oak_total_cents: needs.filter((need) => need.chosen_supplier === "oak").reduce((sum, need) => sum + need.order_qty * need.chosen_cost_cents, 0),
        has_draft: Number(draftRow?.count ?? 0) > 0,
      };
    },
  }),

  generatePurchaseOrders: defineAction({
    request: z.object({}),
    response: z.object({
      ok: z.boolean(),
      error: z.string().optional(),
      orders: z.array(purchaseOrderSchema),
      unassigned: z.array(reorderNeedSchema),
    }),
    async handler(ctx): Promise<{ ok: boolean; error?: string; orders: Array<z.infer<typeof purchaseOrderSchema>>; unassigned: Array<z.infer<typeof reorderNeedSchema>> }> {
      const db = ctx.db<typeof schema>();
      const fail = (error: string) => ({ ok: false, error, orders: [], unassigned: [] });
      const [draftRow] = await db.select({ count: sql<number>`count(*)` }).from(schema.purchaseOrders).where(eq(schema.purchaseOrders.status, "draft"));
      if (Number(draftRow?.count ?? 0) > 0) return fail("A draft purchase order is already waiting for review. Approve or cancel it before generating a new one — that keeps the same items from being ordered twice.");
      const rows = await db.select().from(schema.products).where(and(eq(schema.products.status, "active"), gt(schema.products.parLevel, 0))).orderBy(asc(schema.products.title));
      type Line = { product: ProductRow; need: number; pick: NonNullable<ReturnType<typeof chooseSupplier>>; orderQty: number };
      const linesBySupplier = new Map<SupplierKey, Line[]>();
      const unassigned: Array<z.infer<typeof reorderNeedSchema>> = [];
      for (const product of rows) {
        const need = product.parLevel - product.quantity - product.inboundQty;
        if (need <= 0) continue;
        const pick = chooseSupplier(product);
        if (!pick) {
          const thumb = product.imageBlobKey ? await ctx.blobs.getUrl(product.imageBlobKey, { expiresInSeconds: 3600 }) : product.thumbnailUrl ?? null;
          const needRow = buildNeedRow(product, thumb);
          if (needRow) unassigned.push(needRow);
          continue;
        }
        const orderQty = Math.max(need, pick.chosen.moq);
        const list = linesBySupplier.get(pick.chosen.supplier) ?? [];
        list.push({ product, need, pick, orderQty });
        linesBySupplier.set(pick.chosen.supplier, list);
      }
      if (linesBySupplier.size === 0) {
        if (unassigned.length > 0) return { ok: false, error: "Everything below par is missing a supplier part number, so no order could be built. Add Medco or National Oak numbers in Products first.", orders: [], unassigned };
        return fail("Nothing to order — every product with a par level is at or above par once inbound stock is counted.");
      }
      const settings = await ensurePoSettings(ctx);
      let nextPo = settings?.nextPoNumber ?? 1001;
      const now = new Date();
      const createdIds: string[] = [];
      for (const supplier of ["medco", "oak"] as SupplierKey[]) {
        const lines = linesBySupplier.get(supplier);
        if (!lines || lines.length === 0) continue;
        const poId = crypto.randomUUID();
        const poNumber = nextPo;
        nextPo += 1;
        const total = lines.reduce((sum, line) => sum + line.orderQty * line.pick.chosen.costCents, 0);
        await db.batch([
          db.insert(schema.purchaseOrders).values({ id: poId, poNumber, supplier, status: "draft", notes: "", totalCents: total, createdAt: now, approvedAt: null, receivedAt: null, updatedAt: now }),
          db.insert(schema.purchaseOrderItems).values(lines.map((line) => {
            let reason = line.pick.reason;
            if (line.orderQty > line.need) reason += ` Quantity raised from ${line.need} to ${line.orderQty} to meet ${SUPPLIER_LABEL[supplier]}'s minimum order quantity of ${line.pick.chosen.moq}.`;
            return {
              poId,
              productId: line.product.id,
              productTitle: line.product.title,
              supplierPartNumber: line.pick.chosen.partNumber,
              quantity: line.orderQty,
              suggestedQuantity: line.orderQty,
              unitCostCents: line.pick.chosen.costCents,
              lineTotalCents: line.orderQty * line.pick.chosen.costCents,
              parLevel: line.product.parLevel,
              onHand: line.product.quantity,
              inboundQty: line.product.inboundQty,
              needQty: line.need,
              moq: line.pick.chosen.moq,
              choiceReason: reason,
              altSupplier: line.pick.alt.supplier,
              altPartNumber: line.pick.alt.partNumber,
              altCostCents: line.pick.alt.costCents,
              altAvailable: line.pick.alt.available ? 1 : 0,
              altMoq: line.pick.alt.moq,
            };
          })),
        ]);
        createdIds.push(poId);
      }
      await db.update(schema.appSettings).set({ nextPoNumber: nextPo, updatedAt: new Date() }).where(eq(schema.appSettings.id, 1));
      const createdRows: PurchaseOrderRow[] = [];
      for (const id of createdIds) {
        const [row] = await db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, id)).limit(1);
        if (row) createdRows.push(row);
      }
      ctx.invalidateQueries();
      return { ok: true, orders: await Promise.all(createdRows.map((row) => presentPurchaseOrder(ctx, row))), unassigned };
    },
  }),

  listPurchaseOrders: defineAction({
    request: z.object({ limit: z.number().int().min(1).max(100).default(50) }),
    response: z.object({ orders: z.array(purchaseOrderSchema), draft_count: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.purchaseOrders).orderBy(desc(schema.purchaseOrders.createdAt)).limit(args.limit);
      const [draftRow] = await db.select({ count: sql<number>`count(*)` }).from(schema.purchaseOrders).where(eq(schema.purchaseOrders.status, "draft"));
      return { orders: await Promise.all(rows.map((row) => presentPurchaseOrder(ctx, row))), draft_count: Number(draftRow?.count ?? 0) };
    },
  }),

  updatePurchaseOrderLine: defineAction({
    request: z.object({ po_id: z.string().min(1), item_id: z.number().int().positive(), quantity: z.number().int().min(0).max(999999) }),
    response: purchaseOrderResponse,
    async handler(ctx, args): Promise<z.infer<typeof purchaseOrderResponse>> {
      const db = ctx.db<typeof schema>();
      const [po] = await db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, args.po_id)).limit(1);
      if (!po) return { ok: false, error: "Purchase order not found.", order: null };
      if (po.status !== "draft") return { ok: false, error: "Only draft purchase orders can be edited.", order: await presentPurchaseOrder(ctx, po) };
      const [item] = await db.select().from(schema.purchaseOrderItems).where(and(eq(schema.purchaseOrderItems.id, args.item_id), eq(schema.purchaseOrderItems.poId, po.id))).limit(1);
      if (!item) return { ok: false, error: "That line is not on this purchase order.", order: await presentPurchaseOrder(ctx, po) };
      if (args.quantity === 0) return { ok: false, error: "Use Remove to take a line off the order.", order: await presentPurchaseOrder(ctx, po) };
      if (args.quantity < item.moq) return { ok: false, error: `${SUPPLIER_LABEL[po.supplier]}'s minimum for this item is ${item.moq} — the quantity can't go below that. Remove the line instead if you don't want it.`, order: await presentPurchaseOrder(ctx, po) };
      await db.update(schema.purchaseOrderItems).set({ quantity: args.quantity, lineTotalCents: args.quantity * item.unitCostCents }).where(eq(schema.purchaseOrderItems.id, item.id));
      await recalcPoTotal(ctx, po.id);
      const [updated] = await db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, po.id)).limit(1);
      ctx.invalidateQueries();
      return { ok: true, order: updated ? await presentPurchaseOrder(ctx, updated) : null };
    },
  }),

  removePurchaseOrderLine: defineAction({
    request: z.object({ po_id: z.string().min(1), item_id: z.number().int().positive() }),
    response: purchaseOrderResponse,
    async handler(ctx, args): Promise<z.infer<typeof purchaseOrderResponse>> {
      const db = ctx.db<typeof schema>();
      const [po] = await db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, args.po_id)).limit(1);
      if (!po) return { ok: false, error: "Purchase order not found.", order: null };
      if (po.status !== "draft") return { ok: false, error: "Only draft purchase orders can be edited.", order: await presentPurchaseOrder(ctx, po) };
      const [item] = await db.select().from(schema.purchaseOrderItems).where(and(eq(schema.purchaseOrderItems.id, args.item_id), eq(schema.purchaseOrderItems.poId, po.id))).limit(1);
      if (!item) return { ok: false, error: "That line is not on this purchase order.", order: await presentPurchaseOrder(ctx, po) };
      await db.delete(schema.purchaseOrderItems).where(eq(schema.purchaseOrderItems.id, item.id));
      const remaining = await db.select().from(schema.purchaseOrderItems).where(eq(schema.purchaseOrderItems.poId, po.id));
      if (remaining.length === 0) {
        await db.update(schema.purchaseOrders).set({ status: "cancelled", totalCents: 0, updatedAt: new Date() }).where(eq(schema.purchaseOrders.id, po.id));
      } else {
        await recalcPoTotal(ctx, po.id);
      }
      const [updated] = await db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, po.id)).limit(1);
      ctx.invalidateQueries();
      return { ok: true, order: updated ? await presentPurchaseOrder(ctx, updated) : null };
    },
  }),

  movePurchaseOrderLine: defineAction({
    request: z.object({ po_id: z.string().min(1), item_id: z.number().int().positive() }),
    response: purchaseOrderResponse,
    async handler(ctx, args): Promise<z.infer<typeof purchaseOrderResponse>> {
      const db = ctx.db<typeof schema>();
      const [po] = await db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, args.po_id)).limit(1);
      if (!po) return { ok: false, error: "Purchase order not found.", order: null };
      if (po.status !== "draft") return { ok: false, error: "Only draft purchase orders can be edited.", order: await presentPurchaseOrder(ctx, po) };
      const [item] = await db.select().from(schema.purchaseOrderItems).where(and(eq(schema.purchaseOrderItems.id, args.item_id), eq(schema.purchaseOrderItems.poId, po.id))).limit(1);
      if (!item) return { ok: false, error: "That line is not on this purchase order.", order: await presentPurchaseOrder(ctx, po) };
      const target: SupplierKey | null = item.altSupplier === "medco" ? "medco" : item.altSupplier === "oak" ? "oak" : null;
      if (!target || target === po.supplier || item.altAvailable !== 1) return { ok: false, error: "The other warehouse doesn't carry this item, so the line can't be moved.", order: await presentPurchaseOrder(ctx, po) };
      // Find (or create) the draft PO for the other warehouse.
      const [existingTarget] = await db.select().from(schema.purchaseOrders).where(and(eq(schema.purchaseOrders.status, "draft"), eq(schema.purchaseOrders.supplier, target))).orderBy(desc(schema.purchaseOrders.createdAt)).limit(1);
      let targetPo = existingTarget;
      const now = new Date();
      if (!targetPo) {
        const settings = await ensurePoSettings(ctx);
        const poNumber = settings?.nextPoNumber ?? 1001;
        const newId = crypto.randomUUID();
        await db.batch([
          db.insert(schema.purchaseOrders).values({ id: newId, poNumber, supplier: target, status: "draft", notes: "", totalCents: 0, createdAt: now, approvedAt: null, receivedAt: null, updatedAt: now }),
          db.update(schema.appSettings).set({ nextPoNumber: poNumber + 1, updatedAt: now }).where(eq(schema.appSettings.id, 1)),
        ]);
        const [created] = await db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, newId)).limit(1);
        if (!created) return { ok: false, error: "Could not create the other warehouse's draft.", order: await presentPurchaseOrder(ctx, po) };
        targetPo = created;
      }
      const newQty = Math.max(item.quantity, item.altMoq);
      const oldSupplier = po.supplier;
      await db.update(schema.purchaseOrderItems).set({
        poId: targetPo.id,
        supplierPartNumber: item.altPartNumber,
        quantity: newQty,
        suggestedQuantity: newQty,
        unitCostCents: item.altCostCents,
        lineTotalCents: newQty * item.altCostCents,
        moq: item.altMoq,
        choiceReason: `Moved from ${SUPPLIER_LABEL[oldSupplier]} by hand during review.${newQty > item.quantity ? ` Quantity raised to ${newQty} to meet ${SUPPLIER_LABEL[target]}'s minimum of ${item.altMoq}.` : ""}`,
        altSupplier: oldSupplier,
        altPartNumber: item.supplierPartNumber,
        altCostCents: item.unitCostCents,
        altAvailable: 1,
        altMoq: item.moq,
      }).where(eq(schema.purchaseOrderItems.id, item.id));
      await recalcPoTotal(ctx, targetPo.id);
      const remaining = await db.select().from(schema.purchaseOrderItems).where(eq(schema.purchaseOrderItems.poId, po.id));
      if (remaining.length === 0) {
        await db.update(schema.purchaseOrders).set({ status: "cancelled", totalCents: 0, updatedAt: new Date() }).where(eq(schema.purchaseOrders.id, po.id));
      } else {
        await recalcPoTotal(ctx, po.id);
      }
      const [freshTarget] = await db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, targetPo.id)).limit(1);
      ctx.invalidateQueries();
      return { ok: true, order: freshTarget ? await presentPurchaseOrder(ctx, freshTarget) : null };
    },
  }),

  approvePurchaseOrder: defineAction({
    request: z.object({ po_id: z.string().min(1), confirm_below_minimum: z.boolean().default(false) }),
    response: purchaseOrderResponse,
    async handler(ctx, args): Promise<z.infer<typeof purchaseOrderResponse>> {
      const db = ctx.db<typeof schema>();
      const [po] = await db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, args.po_id)).limit(1);
      if (!po) return { ok: false, error: "Purchase order not found.", order: null };
      if (po.status !== "draft") return { ok: false, error: "Only a draft purchase order can be approved.", order: await presentPurchaseOrder(ctx, po) };
      const items = await db.select().from(schema.purchaseOrderItems).where(eq(schema.purchaseOrderItems.poId, po.id));
      if (items.length === 0) return { ok: false, error: "This purchase order has no lines left.", order: await presentPurchaseOrder(ctx, po) };
      const settings = await ensurePoSettings(ctx);
      const minOrder = po.supplier === "medco" ? (settings?.medcoMinOrderCents ?? 0) : (settings?.oakMinOrderCents ?? 0);
      if (minOrder > 0 && po.totalCents < minOrder && !args.confirm_below_minimum) {
        return { ok: false, error: `This order totals ${moneyText(po.totalCents)}, below ${SUPPLIER_LABEL[po.supplier]}'s ${moneyText(minOrder)} minimum order. Add lines or approve anyway to continue.`, order: await presentPurchaseOrder(ctx, po) };
      }
      const now = new Date();
      const productIds = items.map((item) => item.productId);
      const productRows = await db.select().from(schema.products).where(inArray(schema.products.id, productIds));
      const productById = new Map(productRows.map((product) => [product.id, product]));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const batchOps: any[] = [
        db.update(schema.purchaseOrders).set({ status: "approved", approvedAt: now, updatedAt: now }).where(and(eq(schema.purchaseOrders.id, po.id), eq(schema.purchaseOrders.status, "draft"))),
      ];
      // Approved stock becomes inbound so the next generator run subtracts it
      // instead of ordering the same units twice.
      for (const item of items) {
        const product = productById.get(item.productId);
        if (!product) continue;
        batchOps.push(db.update(schema.products).set({ inboundQty: product.inboundQty + item.quantity, updatedAt: now }).where(and(eq(schema.products.id, product.id), eq(schema.products.inboundQty, product.inboundQty))));
      }
      await db.batch(batchOps as unknown as Parameters<typeof db.batch>[0]);
      const [updated] = await db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, po.id)).limit(1);
      ctx.invalidateQueries();
      return { ok: true, order: updated ? await presentPurchaseOrder(ctx, updated) : null };
    },
  }),

  cancelPurchaseOrder: defineAction({
    request: z.object({ po_id: z.string().min(1) }),
    response: purchaseOrderResponse,
    async handler(ctx, args): Promise<z.infer<typeof purchaseOrderResponse>> {
      const db = ctx.db<typeof schema>();
      const [po] = await db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, args.po_id)).limit(1);
      if (!po) return { ok: false, error: "Purchase order not found.", order: null };
      if (po.status === "received" || po.status === "cancelled") return { ok: false, error: "This purchase order can no longer be cancelled.", order: await presentPurchaseOrder(ctx, po) };
      const now = new Date();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const batchOps: any[] = [
        db.update(schema.purchaseOrders).set({ status: "cancelled", updatedAt: now }).where(eq(schema.purchaseOrders.id, po.id)),
      ];
      if (po.status === "approved") {
        const items = await db.select().from(schema.purchaseOrderItems).where(eq(schema.purchaseOrderItems.poId, po.id));
        const productIds = items.map((item) => item.productId);
        const productRows = productIds.length > 0 ? await db.select().from(schema.products).where(inArray(schema.products.id, productIds)) : [];
        const productById = new Map(productRows.map((product) => [product.id, product]));
        for (const item of items) {
          const product = productById.get(item.productId);
          if (!product) continue;
          batchOps.push(db.update(schema.products).set({ inboundQty: Math.max(0, product.inboundQty - item.quantity), updatedAt: now }).where(and(eq(schema.products.id, product.id), eq(schema.products.inboundQty, product.inboundQty))));
        }
      }
      await db.batch(batchOps as unknown as Parameters<typeof db.batch>[0]);
      const [updated] = await db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, po.id)).limit(1);
      ctx.invalidateQueries();
      return { ok: true, order: updated ? await presentPurchaseOrder(ctx, updated) : null };
    },
  }),

  receivePurchaseOrder: defineAction({
    request: z.object({ po_id: z.string().min(1) }),
    response: purchaseOrderResponse,
    async handler(ctx, args): Promise<z.infer<typeof purchaseOrderResponse>> {
      const db = ctx.db<typeof schema>();
      const [po] = await db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, args.po_id)).limit(1);
      if (!po) return { ok: false, error: "Purchase order not found.", order: null };
      if (po.status !== "approved") return { ok: false, error: "Only an approved purchase order can be marked received.", order: await presentPurchaseOrder(ctx, po) };
      const items = await db.select().from(schema.purchaseOrderItems).where(eq(schema.purchaseOrderItems.poId, po.id));
      const productIds = items.map((item) => item.productId);
      const productRows = productIds.length > 0 ? await db.select().from(schema.products).where(inArray(schema.products.id, productIds)) : [];
      const productById = new Map(productRows.map((product) => [product.id, product]));
      const now = new Date();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const batchOps: any[] = [
        db.update(schema.purchaseOrders).set({ status: "received", receivedAt: now, updatedAt: now }).where(and(eq(schema.purchaseOrders.id, po.id), eq(schema.purchaseOrders.status, "approved"))),
      ];
      for (const item of items) {
        const product = productById.get(item.productId);
        if (!product) continue;
        batchOps.push(db.update(schema.products).set({ quantity: product.quantity + item.quantity, inboundQty: Math.max(0, product.inboundQty - item.quantity), updatedAt: now }).where(and(eq(schema.products.id, product.id), eq(schema.products.quantity, product.quantity))));
      }
      await db.batch(batchOps as unknown as Parameters<typeof db.batch>[0]);
      const [updated] = await db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, po.id)).limit(1);
      ctx.invalidateQueries();
      return { ok: true, order: updated ? await presentPurchaseOrder(ctx, updated) : null };
    },
  }),

  uploadReceivingPdf: defineAction({
    request: z.object({
      file_name: z.string().trim().min(1).max(255),
      data_base64: z.string().min(1).max(16000000),
      mime_type: z.literal("application/pdf"),
      supplier_preference: z.enum(["auto", "medco", "oak"]).default("auto"),
    }),
    response: receivingDocumentResponse,
    privileged: [privileged.extractPdfText],
    async handler(ctx, args): Promise<z.infer<typeof receivingDocumentResponse>> {
      const db = ctx.db<typeof schema>();
      const raw = args.data_base64.includes(",") ? (args.data_base64.split(",")[1] ?? "") : args.data_base64;
      let bytes: Uint8Array;
      try {
        bytes = Uint8Array.from(atob(raw), (character) => character.charCodeAt(0));
      } catch {
        return { ok: false, error: "That PDF could not be decoded. Try uploading it again.", document: null };
      }
      if (bytes.byteLength === 0) return { ok: false, error: "That PDF was empty.", document: null };
      if (bytes.byteLength > 12000000) return { ok: false, error: "Warehouse PDFs must be smaller than 12 MB.", document: null };
      if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) {
        return { ok: false, error: "That file is not a PDF.", document: null };
      }

      const documentId = crypto.randomUUID();
      const blobKey = `warehouse-receiving/${documentId}.pdf`;
      const now = new Date();
      await ctx.blobs.put(blobKey, bytes, { contentType: "application/pdf" });
      const preferredSupplier: z.infer<typeof receivingSupplierSchema> = args.supplier_preference === "auto" ? "unknown" : args.supplier_preference;
      await db.insert(schema.receivingDocuments).values({
        id: documentId,
        fileName: args.file_name,
        fileBlobKey: blobKey,
        mimeType: "application/pdf",
        supplier: preferredSupplier,
        supplierInvoiceNumber: "",
        documentType: "unknown",
        status: "needs_review",
        parseNotes: "Reading the PDF…",
        createdAt: now,
        appliedAt: null,
        updatedAt: now,
      });

      const products = await db.select().from(schema.products).orderBy(asc(schema.products.title));
      let extraction: ExtractedReceiving | null = null;
      let parseFailure = "";
      try {
        const extracted = await ctx.executePrivileged(privileged.extractPdfText, { data_base64: raw });
        if (!extracted.ok) {
          parseFailure = extracted.error ?? "Could not read text from that PDF.";
        } else {
          try {
            extraction = await ctx.inference.complete(
              `Read this warehouse invoice or packing-list text and extract its shipment lines. The warehouse is ${args.supplier_preference === "auto" ? "not specified; identify Medco or National Oak only when the document itself makes it clear" : args.supplier_preference === "medco" ? "Medco" : "National Oak"}. Use the supplier part number exactly as printed for each line. Ordered quantity means the quantity ordered, shipped quantity means the quantity actually shipped on this document, and backorder quantity means the quantity explicitly shown as backordered or still owed. Do not use invoice totals, freight, tax, or summary rows as product lines. If a packing list gives only a shipped quantity, use that as shipped and leave ordered and backorder at zero. If a line's unit cost is shown, return it in dollars; otherwise use zero. Document text:\n\n${extracted.text.slice(0, 100000)}`,
              { schema: extractedReceivingSchema, timeout_secs: 60 },
            );
          } catch {
            extraction = fallbackReceivingExtraction(extracted.text, products, preferredSupplier);
          }
        }
      } catch {
        parseFailure = "Could not read text from that PDF.";
      }

      if (!extraction) {
        await db.update(schema.receivingDocuments).set({ parseNotes: parseFailure || "Could not read that PDF.", updatedAt: new Date() }).where(eq(schema.receivingDocuments.id, documentId));
        const [doc] = await db.select().from(schema.receivingDocuments).where(eq(schema.receivingDocuments.id, documentId)).limit(1);
        ctx.invalidateQueries();
        return { ok: true, document: doc ? await presentReceivingDocument(ctx, doc) : null };
      }

      const supplier: z.infer<typeof receivingSupplierSchema> = args.supplier_preference !== "auto" ? args.supplier_preference : extraction.supplier;
      const lineValues = extraction.lines.map((line) => {
        const supplierPart = line.supplier_part_number.trim();
        const match = supplierPart ? matchReceivingProduct(products, supplier, supplierPart) : null;
        const orderedQty = Math.max(0, Math.trunc(line.ordered_qty));
        const shippedQty = Math.max(0, Math.trunc(line.shipped_qty));
        let backorderQty = Math.max(0, Math.trunc(line.backorder_qty));
        let note = "";
        if (backorderQty === 0 && orderedQty > shippedQty) {
          backorderQty = orderedQty - shippedQty;
          note = "Backorder calculated as ordered minus shipped; verify it matches the warehouse document.";
        }
        if (!match) note = [note, supplierPart ? "No product matched this supplier part number. Assign the product before receiving, or leave the line unchecked." : "No supplier part number was read from this line."].filter(Boolean).join(" ");
        const unitCostCents = Math.max(0, Math.round(line.unit_cost_dollars * 100));
        const currentCostCents = match ? effectiveSupplierCost(match.product, supplier, match.matchedBy) : 0;
        return {
          documentId,
          productId: match?.product.id ?? null,
          rawPartNumber: supplierPart,
          rawDescription: line.description.trim(),
          matchedBy: match?.matchedBy ?? "",
          orderedQty,
          shippedQty,
          backorderQty,
          unitCostCents,
          currentCostCents,
          costChangeStatus: match && unitCostCents > 0 && unitCostCents !== currentCostCents ? ("pending" as const) : ("none" as const),
          includeLine: match ? 1 : 0,
          notes: note,
        };
      });
      const matchedCount = lineValues.filter((line) => line.productId !== null).length;
      const notes = [
        extraction.notes,
        lineValues.length === 0 ? "No shipment lines were found. Cancel this upload or try a clearer text PDF." : "",
        matchedCount < lineValues.length ? `${lineValues.length - matchedCount} line${lineValues.length - matchedCount === 1 ? "" : "s"} still need a product match.` : "",
      ].filter(Boolean).join(" ");
      await db.batch([
        db.update(schema.receivingDocuments).set({
          supplier,
          supplierInvoiceNumber: extraction.supplier_invoice_number.trim(),
          documentType: extraction.document_type,
          parseNotes: notes,
          updatedAt: new Date(),
        }).where(eq(schema.receivingDocuments.id, documentId)),
        ...(lineValues.length > 0 ? [db.insert(schema.receivingLines).values(lineValues)] : []),
      ] as unknown as Parameters<typeof db.batch>[0]);
      const [doc] = await db.select().from(schema.receivingDocuments).where(eq(schema.receivingDocuments.id, documentId)).limit(1);
      ctx.invalidateQueries();
      return { ok: true, document: doc ? await presentReceivingDocument(ctx, doc) : null };
    },
  }),

  listReceivingDocuments: defineAction({
    request: z.object({ limit: z.number().int().min(1).max(50).default(25) }),
    response: z.object({
      documents: z.array(receivingDocumentSchema),
      needs_review_count: z.number(),
      pending_cost_changes: z.number(),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.receivingDocuments).orderBy(desc(schema.receivingDocuments.createdAt)).limit(args.limit);
      const documents = await Promise.all(rows.map((row) => presentReceivingDocument(ctx, row)));
      return {
        documents,
        needs_review_count: documents.filter((doc) => doc.status === "needs_review").length,
        pending_cost_changes: documents.reduce((sum, doc) => sum + doc.pending_cost_changes, 0),
      };
    },
  }),

  updateReceivingLine: defineAction({
    request: z.object({
      document_id: z.string().min(1),
      line_id: z.number().int().positive(),
      product_id: z.number().int().positive().nullable(),
      ordered_qty: z.number().int().min(0).max(999999),
      shipped_qty: z.number().int().min(0).max(999999),
      backorder_qty: z.number().int().min(0).max(999999),
      unit_cost_cents: z.number().int().min(0).max(100000000),
      include_line: z.boolean(),
    }),
    response: receivingDocumentResponse,
    async handler(ctx, args): Promise<z.infer<typeof receivingDocumentResponse>> {
      const db = ctx.db<typeof schema>();
      const [doc] = await db.select().from(schema.receivingDocuments).where(eq(schema.receivingDocuments.id, args.document_id)).limit(1);
      if (!doc) return { ok: false, error: "Receiving document not found.", document: null };
      if (doc.status !== "needs_review") return { ok: false, error: "This shipment has already been received, so its lines can no longer be edited.", document: await presentReceivingDocument(ctx, doc) };
      const [line] = await db.select().from(schema.receivingLines).where(and(eq(schema.receivingLines.id, args.line_id), eq(schema.receivingLines.documentId, doc.id))).limit(1);
      if (!line) return { ok: false, error: "That line is not on this receiving document.", document: await presentReceivingDocument(ctx, doc) };
      let product: ProductRow | undefined;
      if (args.product_id !== null) {
        const [found] = await db.select().from(schema.products).where(eq(schema.products.id, args.product_id)).limit(1);
        if (!found) return { ok: false, error: "That product no longer exists.", document: await presentReceivingDocument(ctx, doc) };
        product = found;
      }
      const manualMatch = args.product_id !== null && args.product_id !== line.productId;
      const matchedBy = args.product_id === null ? "" : manualMatch ? "Matched by hand during review" : line.matchedBy;
      const currentCostCents = product ? effectiveSupplierCost(product, doc.supplier, matchedBy) : 0;
      const costChangeStatus = product && args.unit_cost_cents > 0 && args.unit_cost_cents !== currentCostCents ? "pending" as const : "none" as const;
      await db.update(schema.receivingLines).set({
        productId: args.product_id,
        matchedBy,
        orderedQty: args.ordered_qty,
        shippedQty: args.shipped_qty,
        backorderQty: args.backorder_qty,
        unitCostCents: args.unit_cost_cents,
        currentCostCents,
        costChangeStatus,
        includeLine: args.include_line ? 1 : 0,
        notes: args.product_id === null ? "No product assigned. Assign the product before receiving, or leave the line unchecked." : line.notes,
      }).where(eq(schema.receivingLines.id, line.id));
      await db.update(schema.receivingDocuments).set({ updatedAt: new Date() }).where(eq(schema.receivingDocuments.id, doc.id));
      const [updated] = await db.select().from(schema.receivingDocuments).where(eq(schema.receivingDocuments.id, doc.id)).limit(1);
      ctx.invalidateQueries();
      return { ok: true, document: updated ? await presentReceivingDocument(ctx, updated) : null };
    },
  }),

  applyReceivingDocument: defineAction({
    request: z.object({ document_id: z.string().min(1) }),
    response: receivingDocumentResponse,
    async handler(ctx, args): Promise<z.infer<typeof receivingDocumentResponse>> {
      const db = ctx.db<typeof schema>();
      const [doc] = await db.select().from(schema.receivingDocuments).where(eq(schema.receivingDocuments.id, args.document_id)).limit(1);
      if (!doc) return { ok: false, error: "Receiving document not found.", document: null };
      if (doc.status !== "needs_review") return { ok: false, error: "This shipment has already been received or cancelled.", document: await presentReceivingDocument(ctx, doc) };
      const lines = await db.select().from(schema.receivingLines).where(eq(schema.receivingLines.documentId, doc.id));
      const included = lines.filter((line) => line.includeLine === 1);
      if (included.length === 0) return { ok: false, error: "Check at least one matched line before receiving.", document: await presentReceivingDocument(ctx, doc) };
      const unmatched = included.filter((line) => line.productId === null);
      if (unmatched.length > 0) return { ok: false, error: `${unmatched.length} checked line${unmatched.length === 1 ? "" : "s"} still need a product match. Assign the product or uncheck the line.`, document: await presentReceivingDocument(ctx, doc) };
      const moving = included.filter((line) => line.shippedQty > 0 || line.backorderQty > 0);
      if (moving.length === 0) return { ok: false, error: "The checked lines have no shipped or backordered quantities to receive.", document: await presentReceivingDocument(ctx, doc) };
      const totalsByProduct = new Map<number, { shipped: number; backorder: number }>();
      for (const line of moving) {
        if (line.productId === null) continue;
        const current = totalsByProduct.get(line.productId) ?? { shipped: 0, backorder: 0 };
        current.shipped += line.shippedQty;
        current.backorder += line.backorderQty;
        totalsByProduct.set(line.productId, current);
      }
      const productIds = [...totalsByProduct.keys()];
      const productRows = await db.select().from(schema.products).where(inArray(schema.products.id, productIds));
      const productById = new Map(productRows.map((product) => [product.id, product]));
      const now = new Date();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const batchOps: any[] = [
        db.update(schema.receivingDocuments).set({ status: "received", appliedAt: now, updatedAt: now }).where(and(eq(schema.receivingDocuments.id, doc.id), eq(schema.receivingDocuments.status, "needs_review"))),
      ];
      for (const [productId, totals] of totalsByProduct) {
        const product = productById.get(productId);
        if (!product) continue;
        const inboundAfterArrival = Math.max(0, product.inboundQty - totals.shipped);
        batchOps.push(db.update(schema.products).set({
          quantity: product.quantity + totals.shipped,
          inboundQty: inboundAfterArrival + totals.backorder,
          updatedAt: now,
        }).where(eq(schema.products.id, product.id)));
      }
      await db.batch(batchOps as unknown as Parameters<typeof db.batch>[0]);
      const [updated] = await db.select().from(schema.receivingDocuments).where(eq(schema.receivingDocuments.id, doc.id)).limit(1);
      ctx.invalidateQueries();
      return { ok: true, document: updated ? await presentReceivingDocument(ctx, updated) : null };
    },
  }),

  decideReceivingCostChange: defineAction({
    request: z.object({ line_id: z.number().int().positive(), decision: z.enum(["approved", "rejected"]) }),
    response: receivingDocumentResponse,
    async handler(ctx, args): Promise<z.infer<typeof receivingDocumentResponse>> {
      const db = ctx.db<typeof schema>();
      const [line] = await db.select().from(schema.receivingLines).where(eq(schema.receivingLines.id, args.line_id)).limit(1);
      if (!line) return { ok: false, error: "That receiving line was not found.", document: null };
      const [doc] = await db.select().from(schema.receivingDocuments).where(eq(schema.receivingDocuments.id, line.documentId)).limit(1);
      if (!doc) return { ok: false, error: "Receiving document not found.", document: null };
      if (line.costChangeStatus !== "pending") return { ok: false, error: "That cost change has already been decided.", document: await presentReceivingDocument(ctx, doc) };
      if (line.productId === null) return { ok: false, error: "Match this line to a product before deciding its cost.", document: await presentReceivingDocument(ctx, doc) };
      const now = new Date();
      if (args.decision === "approved") {
        const [product] = await db.select().from(schema.products).where(eq(schema.products.id, line.productId)).limit(1);
        if (!product) return { ok: false, error: "That product no longer exists.", document: await presentReceivingDocument(ctx, doc) };
        const supplier: z.infer<typeof receivingSupplierSchema> = doc.supplier !== "unknown" ? doc.supplier : line.matchedBy.startsWith("National Oak") ? "oak" : line.matchedBy.startsWith("Medco") ? "medco" : "unknown";
        // Approving a new cost updates the cost ONLY. The markup % stays
        // exactly as it was — the recalculated customer price (new cost ×
        // (1 + fixed markup) from the markup rules chart) is proposed below
        // via maybeCreatePriceProposal and waits for approval there.
        await db.batch([
          db.update(schema.products).set({
            ...(supplier === "medco" ? { medcoCostCents: line.unitCostCents } : {}),
            ...(supplier === "oak" ? { oakCostCents: line.unitCostCents } : {}),
            costCents: line.unitCostCents,
            updatedAt: now,
          }).where(eq(schema.products.id, product.id)),
          db.update(schema.receivingLines).set({ costChangeStatus: "approved", currentCostCents: line.unitCostCents }).where(eq(schema.receivingLines.id, line.id)),
        ] as unknown as Parameters<typeof db.batch>[0]);
        await maybeCreatePriceProposal(ctx, product, line.unitCostCents).catch(() => null);
      } else {
        await db.update(schema.receivingLines).set({ costChangeStatus: "rejected" }).where(eq(schema.receivingLines.id, line.id));
      }
      await db.update(schema.receivingDocuments).set({ updatedAt: now }).where(eq(schema.receivingDocuments.id, doc.id));
      const [updated] = await db.select().from(schema.receivingDocuments).where(eq(schema.receivingDocuments.id, doc.id)).limit(1);
      ctx.invalidateQueries();
      return { ok: true, document: updated ? await presentReceivingDocument(ctx, updated) : null };
    },
  }),

  cancelReceivingDocument: defineAction({
    request: z.object({ document_id: z.string().min(1) }),
    response: receivingDocumentResponse,
    async handler(ctx, args): Promise<z.infer<typeof receivingDocumentResponse>> {
      const db = ctx.db<typeof schema>();
      const [doc] = await db.select().from(schema.receivingDocuments).where(eq(schema.receivingDocuments.id, args.document_id)).limit(1);
      if (!doc) return { ok: false, error: "Receiving document not found.", document: null };
      if (doc.status !== "needs_review") return { ok: false, error: "Only a shipment still waiting for review can be cancelled.", document: await presentReceivingDocument(ctx, doc) };
      await db.update(schema.receivingDocuments).set({ status: "cancelled", updatedAt: new Date() }).where(eq(schema.receivingDocuments.id, doc.id));
      const [updated] = await db.select().from(schema.receivingDocuments).where(eq(schema.receivingDocuments.id, doc.id)).limit(1);
      ctx.invalidateQueries();
      return { ok: true, document: updated ? await presentReceivingDocument(ctx, updated) : null };
    },
  }),

  listMarkupRules: defineAction({
    request: z.object({}),
    response: z.object({ rules: z.array(markupRuleSchema), vendors: z.array(z.object({ vendor: z.string(), product_count: z.number() })), pending_proposals: z.number() }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const ruleRows = await db.select().from(schema.markupRules).orderBy(asc(schema.markupRules.vendor));
      const productRows = await db.select({ vendor: schema.products.vendor }).from(schema.products);
      const countByVendor = new Map<string, number>();
      for (const p of productRows) countByVendor.set(p.vendor, (countByVendor.get(p.vendor) ?? 0) + 1);
      const totalProducts = productRows.length;
      const rules = ruleRows.map((r) => ({ id: r.id, vendor: r.vendor, is_default: r.vendor.trim() === "", markup_bps: r.markupBps, product_count: r.vendor.trim() === "" ? totalProducts : (countByVendor.get(r.vendor) ?? 0), updated_at: r.updatedAt.toISOString() }));
      // Ensure default rule is listed first even if not created yet is handled client-side
      const vendors = [...countByVendor.entries()].map(([vendor, count]) => ({ vendor, product_count: count })).sort((a, b) => a.vendor.localeCompare(b.vendor));
      const [pending] = await db.select({ count: sql<number>`count(*)` }).from(schema.priceProposals).where(eq(schema.priceProposals.status, "pending"));
      return { rules, vendors, pending_proposals: Number(pending?.count ?? 0) };
    },
  }),

  saveMarkupRule: defineAction({
    request: z.object({ vendor: z.string().trim().max(160).default(""), markup_bps: z.number().int().min(-5000).max(1000000) }),
    response: z.object({ ok: z.boolean(), error: z.string().optional(), rule: markupRuleSchema.nullable() }),
    async handler(ctx, args): Promise<{ ok: boolean; error?: string; rule: z.infer<typeof markupRuleSchema> | null }> {
      const db = ctx.db<typeof schema>();
      const vendor = args.vendor.trim();
      const now = new Date();
      const [existing] = await db.select().from(schema.markupRules).where(eq(schema.markupRules.vendor, vendor)).limit(1);
      let row: typeof schema.markupRules.$inferSelect | undefined;
      if (existing) {
        [row] = await db.update(schema.markupRules).set({ markupBps: args.markup_bps, updatedAt: now }).where(eq(schema.markupRules.id, existing.id)).returning();
      } else {
        [row] = await db.insert(schema.markupRules).values({ vendor, markupBps: args.markup_bps, createdAt: now, updatedAt: now }).returning();
      }
      if (!row) return { ok: false, error: "Could not save that rule.", rule: null };
      ctx.invalidateQueries();
      return { ok: true, rule: { id: row.id, vendor: row.vendor, is_default: row.vendor.trim() === "", markup_bps: row.markupBps, product_count: 0, updated_at: row.updatedAt.toISOString() } };
    },
  }),

  deleteMarkupRule: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.boolean(), error: z.string().optional() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db.delete(schema.markupRules).where(eq(schema.markupRules.id, args.id)).returning({ id: schema.markupRules.id });
      if (!row) return { ok: false, error: "Rule not found." };
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  setProductMarkupOverride: defineAction({
    request: z.object({ product_id: z.number().int().positive(), markup_bps: z.number().int().min(-5000).max(1000000).nullable() }),
    response: updateResponse,
    async handler(ctx, args): Promise<z.infer<typeof updateResponse>> {
      const db = ctx.db<typeof schema>();
      const [before] = await db.select().from(schema.products).where(eq(schema.products.id, args.product_id)).limit(1);
      if (!before) return { ok: false, error: "Product not found.", product: null };
      const [row] = await db.update(schema.products).set({ markupOverrideBps: args.markup_bps, updatedAt: new Date() }).where(eq(schema.products.id, args.product_id)).returning();
      if (!row) return { ok: false, error: "Product not found.", product: null };
      // If an override is set, propose a price from current cost right away for approval
      if (args.markup_bps !== null && before.costCents > 0) {
        const proposed = Math.round(before.costCents * (1 + args.markup_bps / 10000));
        if (proposed !== before.priceCents) {
          const [existing] = await db.select().from(schema.priceProposals).where(and(eq(schema.priceProposals.productId, before.id), eq(schema.priceProposals.status, "pending"))).limit(1);
          if (!existing) {
            await db.insert(schema.priceProposals).values({ productId: before.id, productTitle: before.title, vendor: before.vendor ?? "", oldCostCents: before.costCents, newCostCents: before.costCents, oldPriceCents: before.priceCents, proposedPriceCents: proposed, markupBps: args.markup_bps, ruleSource: "per-item override", status: "pending", createdAt: new Date(), decidedAt: null });
          }
        }
      }
      ctx.invalidateQueries();
      return { ok: true, product: await presentProduct(ctx, row) };
    },
  }),

  listPriceProposals: defineAction({
    request: z.object({ status: z.enum(["pending", "approved", "rejected", "all"]).default("all"), limit: z.number().int().min(1).max(100).default(50) }),
    response: z.object({ proposals: z.array(priceProposalSchema) }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const where = args.status === "all" ? undefined : eq(schema.priceProposals.status, args.status);
      const rows = await db.select().from(schema.priceProposals).where(where).orderBy(desc(schema.priceProposals.createdAt)).limit(args.limit);
      return { proposals: rows.map((r) => ({ id: r.id, product_id: r.productId, product_title: r.productTitle, vendor: r.vendor, old_cost_cents: r.oldCostCents, new_cost_cents: r.newCostCents, old_price_cents: r.oldPriceCents, proposed_price_cents: r.proposedPriceCents, markup_bps: r.markupBps, rule_source: r.ruleSource, status: r.status, created_at: r.createdAt.toISOString(), decided_at: r.decidedAt ? r.decidedAt.toISOString() : null })) };
    },
  }),

  decidePriceProposal: defineAction({
    request: z.object({ id: z.number().int().positive(), decision: z.enum(["approved", "rejected"]) }),
    response: z.object({ ok: z.boolean(), error: z.string().optional(), proposal: priceProposalSchema.nullable() }),
    async handler(ctx, args): Promise<{ ok: boolean; error?: string; proposal: z.infer<typeof priceProposalSchema> | null }> {
      const db = ctx.db<typeof schema>();
      const [proposal] = await db.select().from(schema.priceProposals).where(eq(schema.priceProposals.id, args.id)).limit(1);
      if (!proposal) return { ok: false, error: "Proposal not found.", proposal: null };
      if (proposal.status !== "pending") return { ok: false, error: "That proposal has already been decided.", proposal: null };
      const now = new Date();
      if (args.decision === "approved") {
        await db.batch([
          db.update(schema.products).set({ priceCents: proposal.proposedPriceCents, markupBps: proposal.markupBps, updatedAt: now }).where(eq(schema.products.id, proposal.productId)),
          db.update(schema.priceProposals).set({ status: "approved", decidedAt: now }).where(eq(schema.priceProposals.id, proposal.id)),
        ] as unknown as Parameters<typeof db.batch>[0]);
      } else {
        await db.update(schema.priceProposals).set({ status: "rejected", decidedAt: now }).where(eq(schema.priceProposals.id, proposal.id));
      }
      const [updated] = await db.select().from(schema.priceProposals).where(eq(schema.priceProposals.id, args.id)).limit(1);
      ctx.invalidateQueries();
      return { ok: true, proposal: updated ? { id: updated.id, product_id: updated.productId, product_title: updated.productTitle, vendor: updated.vendor, old_cost_cents: updated.oldCostCents, new_cost_cents: updated.newCostCents, old_price_cents: updated.oldPriceCents, proposed_price_cents: updated.proposedPriceCents, markup_bps: updated.markupBps, rule_source: updated.ruleSource, status: updated.status, created_at: updated.createdAt.toISOString(), decided_at: updated.decidedAt ? updated.decidedAt.toISOString() : null } : null };
    },
  }),

  listSalesTeam: defineAction({
    request: z.object({}),
    response: z.object({ members: z.array(salesTeamMemberSchema) }),
    async handler(ctx) {
      const rows = await ensureSalesTeam(ctx);
      return { members: rows.map((r) => ({ id: r.id, name: r.name, commission_bps: r.commissionBps, commission_percent: r.commissionBps / 100, active: r.active === 1, created_at: r.createdAt.toISOString() })) };
    },
  }),

  createSalesTeamMember: defineAction({
    request: z.object({ name: z.string().trim().min(1).max(80), commission_bps: z.number().int().min(0).max(10000).default(0) }),
    response: z.object({ ok: z.boolean(), error: z.string().optional(), member: salesTeamMemberSchema.nullable() }),
    async handler(ctx, args): Promise<{ ok: boolean; error?: string; member: z.infer<typeof salesTeamMemberSchema> | null }> {
      const db = ctx.db<typeof schema>();
      await ensureSalesTeam(ctx);
      const name = args.name.trim();
      const [existing] = await db.select().from(schema.salesTeam).where(eq(schema.salesTeam.name, name)).limit(1);
      if (existing) return { ok: false, error: `${name} is already on the team.`, member: null };
      const now = new Date();
      const [row] = await db.insert(schema.salesTeam).values({ name, commissionBps: args.commission_bps, active: 1, createdAt: now, updatedAt: now }).returning();
      if (!row) return { ok: false, error: "Could not add that team member.", member: null };
      ctx.invalidateQueries();
      return { ok: true, member: { id: row.id, name: row.name, commission_bps: row.commissionBps, commission_percent: row.commissionBps / 100, active: row.active === 1, created_at: row.createdAt.toISOString() } };
    },
  }),

  updateSalesTeamMember: defineAction({
    request: z.object({ id: z.number().int().positive(), commission_bps: z.number().int().min(0).max(10000), active: z.boolean().default(true) }),
    response: z.object({ ok: z.boolean(), error: z.string().optional(), member: salesTeamMemberSchema.nullable() }),
    async handler(ctx, args): Promise<{ ok: boolean; error?: string; member: z.infer<typeof salesTeamMemberSchema> | null }> {
      const db = ctx.db<typeof schema>();
      const [row] = await db.update(schema.salesTeam).set({ commissionBps: args.commission_bps, active: args.active ? 1 : 0, updatedAt: new Date() }).where(eq(schema.salesTeam.id, args.id)).returning();
      if (!row) return { ok: false, error: "Team member not found.", member: null };
      ctx.invalidateQueries();
      return { ok: true, member: { id: row.id, name: row.name, commission_bps: row.commissionBps, commission_percent: row.commissionBps / 100, active: row.active === 1, created_at: row.createdAt.toISOString() } };
    },
  }),

  getReturnsSummary: defineAction({
    request: analyticsRange,
    response: z.object({
      total_returns: z.number(),
      total_units: z.number(),
      total_cents: z.number(),
      refunded_cents: z.number(),
      credited_cents: z.number(),
      by_method: z.array(z.object({ method: z.enum(["cash", "card", "account_credit"]), count: z.number(), total_cents: z.number() })),
      by_reason: z.array(z.object({ reason: z.string(), count: z.number(), units: z.number(), total_cents: z.number() })),
      by_item: z.array(z.object({ product_id: z.number(), product_title: z.string(), units: z.number(), total_cents: z.number(), return_count: z.number() })),
      returns: z.array(z.object({
        id: z.string(),
        sale_id: z.string(),
        invoice_number: z.number().nullable(),
        customer_name: z.string(),
        refund_method: z.enum(["cash", "card", "account_credit"]),
        total_cents: z.number(),
        refunded_cents: z.number(),
        credited_cents: z.number(),
        created_at: z.string(),
        field_order_id: z.string().nullable(),
        items: z.array(z.object({ product_title: z.string(), quantity: z.number(), line_total_cents: z.number(), reason: z.string() })),
      })),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const { start, endExclusive } = rangeBounds(args);
      const conditions = [
        ...(start ? [gte(schema.returns.createdAt, start)] : []),
        ...(endExclusive ? [lt(schema.returns.createdAt, endExclusive)] : []),
      ];
      const where = conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : and(...conditions);
      const retRows = await db.select().from(schema.returns).where(where).orderBy(desc(schema.returns.createdAt)).limit(200);
      const retIds = retRows.map((r) => r.id);
      const itemRows = retIds.length > 0 ? await db.select().from(schema.returnItems).where(inArray(schema.returnItems.returnId, retIds)) : [];
      const saleIds = [...new Set(retRows.map((r) => r.saleId))];
      const saleRows = saleIds.length > 0 ? await db.select().from(schema.sales).where(inArray(schema.sales.id, saleIds)) : [];
      const saleById = new Map(saleRows.map((s) => [s.id, s]));
      const fieldRows = saleIds.length > 0 ? await db.select().from(schema.fieldOrders).where(inArray(schema.fieldOrders.saleId, saleIds)) : [];
      const fieldBySale = new Map(fieldRows.filter((f) => f.saleId).map((f) => [f.saleId as string, f.id]));
      const byMethodMap = new Map<string, { count: number; total: number }>();
      for (const r of retRows) { const cur = byMethodMap.get(r.refundMethod) ?? { count: 0, total: 0 }; cur.count += 1; cur.total += r.totalCents; byMethodMap.set(r.refundMethod, cur); }
      const byReasonMap = new Map<string, { count: number; units: number; total: number }>();
      const byItemMap = new Map<number, { title: string; units: number; total: number; count: number }>();
      for (const it of itemRows) {
        const reasonKey = it.reason.trim() || "(no reason given)";
        const rr = byReasonMap.get(reasonKey) ?? { count: 0, units: 0, total: 0 }; rr.count += 1; rr.units += it.quantity; rr.total += it.lineTotalCents; byReasonMap.set(reasonKey, rr);
        const pi = byItemMap.get(it.productId) ?? { title: it.productTitle, units: 0, total: 0, count: 0 }; pi.units += it.quantity; pi.total += it.lineTotalCents; pi.count += 1; byItemMap.set(it.productId, pi);
      }
      return {
        total_returns: retRows.length,
        total_units: itemRows.reduce((s, i) => s + i.quantity, 0),
        total_cents: retRows.reduce((s, r) => s + r.totalCents, 0),
        refunded_cents: retRows.reduce((s, r) => s + r.refundedCents, 0),
        credited_cents: retRows.reduce((s, r) => s + r.creditedCents, 0),
        by_method: (["cash", "card", "account_credit"] as const).map((m) => ({ method: m, count: byMethodMap.get(m)?.count ?? 0, total_cents: byMethodMap.get(m)?.total ?? 0 })),
        by_reason: [...byReasonMap.entries()].map(([reason, v]) => ({ reason, count: v.count, units: v.units, total_cents: v.total })).sort((a, b) => b.total_cents - a.total_cents),
        by_item: [...byItemMap.entries()].map(([pid, v]) => ({ product_id: pid, product_title: v.title, units: v.units, total_cents: v.total, return_count: v.count })).sort((a, b) => b.total_cents - a.total_cents).slice(0, 30),
        returns: retRows.map((r) => ({
          id: r.id,
          sale_id: r.saleId,
          invoice_number: saleById.get(r.saleId)?.invoiceNumber ?? null,
          customer_name: r.customerName,
          refund_method: r.refundMethod,
          total_cents: r.totalCents,
          refunded_cents: r.refundedCents,
          credited_cents: r.creditedCents,
          created_at: r.createdAt.toISOString(),
          field_order_id: fieldBySale.get(r.saleId) ?? null,
          items: itemRows.filter((i) => i.returnId === r.id).map((i) => ({ product_title: i.productTitle, quantity: i.quantity, line_total_cents: i.lineTotalCents, reason: i.reason })),
        })),
      };
    },
  }),
  listSalesOrders: defineAction({
    request: z.object({
      query: z.string().max(120).default(""),
      status: z.enum(["all", "paid", "due", "draft"]).default("all"),
      limit: z.number().int().min(1).max(200).default(100),
    }),
    response: z.object({
      orders: z.array(z.object({
        id: z.string(),
        kind: z.enum(["invoice", "draft"]),
        invoice_number: z.number().nullable(),
        customer_id: z.number().nullable(),
        customer_name: z.string(),
        customer_email: z.string(),
        customer_phone: z.string(),
        total_cents: z.number(),
        paid_cents: z.number(),
        balance_cents: z.number(),
        display_status: z.enum(["paid", "due", "draft"]),
        salesperson: z.string(),
        item_count: z.number(),
        created_at: z.string(),
      })),
      total: z.number(),
      paid_count: z.number(),
      due_count: z.number(),
      draft_count: z.number(),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const q = args.query.trim().toLowerCase();
      const saleRows = await db.select().from(schema.sales).orderBy(desc(schema.sales.createdAt)).limit(300);
      const draftRows = await db.select().from(schema.fieldOrders).where(eq(schema.fieldOrders.status, "draft")).orderBy(desc(schema.fieldOrders.createdAt)).limit(100);
      const customerIds = [...new Set([...saleRows.map((r) => r.customerId).filter((v): v is number => v !== null), ...draftRows.map((r) => r.customerId)])];
      const custRows = customerIds.length ? await db.select().from(schema.customers).where(inArray(schema.customers.id, customerIds)) : [];
      const custById = new Map(custRows.map((c) => [c.id, c]));
      const saleIds = saleRows.map((r) => r.id);
      const itemRows = saleIds.length ? await db.select().from(schema.saleItems).where(inArray(schema.saleItems.saleId, saleIds)) : [];
      const countBySale = new Map<string, number>();
      for (const it of itemRows) countBySale.set(it.saleId, (countBySale.get(it.saleId) ?? 0) + it.quantity);
      const draftIds = draftRows.map((r) => r.id);
      const draftItems = draftIds.length ? await db.select().from(schema.fieldOrderItems).where(inArray(schema.fieldOrderItems.fieldOrderId, draftIds)) : [];
      const draftTotal = new Map<string, number>();
      const draftCount = new Map<string, number>();
      for (const it of draftItems) { draftTotal.set(it.fieldOrderId, (draftTotal.get(it.fieldOrderId) ?? 0) + it.lineTotalCents); draftCount.set(it.fieldOrderId, (draftCount.get(it.fieldOrderId) ?? 0) + it.quantity); }
      const all: Array<{ id: string; kind: "invoice" | "draft"; invoice_number: number | null; customer_id: number | null; customer_name: string; customer_email: string; customer_phone: string; total_cents: number; paid_cents: number; balance_cents: number; display_status: "paid" | "due" | "draft"; salesperson: string; item_count: number; created_at: string }> = [];
      for (const s of saleRows) {
        const cust = s.customerId !== null ? custById.get(s.customerId) : undefined;
        const display = s.status === "paid" ? "paid" as const : "due" as const;
        all.push({ id: s.id, kind: "invoice", invoice_number: s.invoiceNumber, customer_id: s.customerId, customer_name: s.customerName, customer_email: cust?.email ?? cust?.apEmail ?? "", customer_phone: cust?.phone ?? cust?.apPhone ?? "", total_cents: s.totalCents, paid_cents: s.paidCents, balance_cents: s.totalCents - s.paidCents, display_status: display, salesperson: s.salesperson, item_count: countBySale.get(s.id) ?? 0, created_at: s.createdAt.toISOString() });
      }
      for (const d of draftRows) {
        const cust = custById.get(d.customerId);
        const total = draftTotal.get(d.id) ?? 0;
        all.push({ id: d.id, kind: "draft", invoice_number: null, customer_id: d.customerId, customer_name: d.customerName, customer_email: cust?.email ?? cust?.apEmail ?? "", customer_phone: cust?.phone ?? cust?.apPhone ?? "", total_cents: total, paid_cents: 0, balance_cents: total, display_status: "draft", salesperson: d.createdBy, item_count: draftCount.get(d.id) ?? 0, created_at: d.createdAt.toISOString() });
      }
      all.sort((a, b) => b.created_at.localeCompare(a.created_at));
      const paid_count = all.filter((o) => o.display_status === "paid").length;
      const due_count = all.filter((o) => o.display_status === "due").length;
      const draft_count = all.filter((o) => o.display_status === "draft").length;
      let filtered = all;
      if (args.status !== "all") filtered = filtered.filter((o) => o.display_status === args.status);
      if (q) filtered = filtered.filter((o) => o.customer_name.toLowerCase().includes(q) || String(o.invoice_number ?? "").includes(q) || o.id.toLowerCase().includes(q));
      return { orders: filtered.slice(0, args.limit), total: filtered.length, paid_count, due_count, draft_count };
    },
  }),

  getDepositReport: defineAction({
    request: analyticsRange,
    response: z.object({
      start_date: z.string().nullable(),
      end_date: z.string().nullable(),
      period_label: z.string(),
      days: z.array(z.object({
        date: z.string(),
        total_cents: z.number(),
        cash_cents: z.number(),
        card_cents: z.number(),
        check_cents: z.number(),
        payments_cents: z.number(),
        refunds_cents: z.number(),
        entry_count: z.number(),
        payment_count: z.number(),
        refund_count: z.number(),
        entries: z.array(z.object({
          id: z.number(),
          created_at: z.string(),
          day: z.string(),
          customer_id: z.number().nullable(),
          customer_name: z.string(),
          sale_id: z.string().nullable(),
          invoice_number: z.number().nullable(),
          method: z.enum(["cash", "card", "check"]),
          amount_cents: z.number(),
        })),
      })),
      by_method: z.array(z.object({
        method: z.enum(["cash", "card", "check"]),
        total_cents: z.number(),
        payments_cents: z.number(),
        refunds_cents: z.number(),
        count: z.number(),
      })),
      totals: z.object({
        total_cents: z.number(),
        cash_cents: z.number(),
        card_cents: z.number(),
        check_cents: z.number(),
        payments_cents: z.number(),
        refunds_cents: z.number(),
        entry_count: z.number(),
        payment_count: z.number(),
        refund_count: z.number(),
        day_count: z.number(),
      }),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const { start, endExclusive } = rangeBounds(args);
      const conditions = [
        ...(start ? [gte(schema.payments.createdAt, start)] : []),
        ...(endExclusive ? [lt(schema.payments.createdAt, endExclusive)] : []),
      ];
      const where = conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : and(...conditions);
      const paymentRows = await db.select().from(schema.payments).where(where).orderBy(asc(schema.payments.createdAt), asc(schema.payments.id));
      const saleIds = [...new Set(paymentRows.map((row) => row.saleId).filter((value): value is string => value !== null))];
      const saleRows = saleIds.length > 0 ? await db.select().from(schema.sales).where(inArray(schema.sales.id, saleIds)) : [];
      const saleById = new Map(saleRows.map((row) => [row.id, row]));
      const customerIds = [...new Set(paymentRows.map((row) => row.customerId).filter((value): value is number => value !== null))];
      const customerRows = customerIds.length > 0 ? await db.select().from(schema.customers).where(inArray(schema.customers.id, customerIds)) : [];
      const customerById = new Map(customerRows.map((row) => [row.id, row]));
      const entries = paymentRows.map((row) => {
        const sale = row.saleId ? saleById.get(row.saleId) : undefined;
        const customer = row.customerId !== null ? customerById.get(row.customerId) : undefined;
        return {
          id: row.id,
          created_at: row.createdAt.toISOString(),
          day: row.createdAt.toISOString().slice(0, 10),
          customer_id: row.customerId,
          customer_name: customer ? (customer.businessName || customer.name) : (sale?.customerName ?? "Walk-in"),
          sale_id: row.saleId,
          invoice_number: sale?.invoiceNumber ?? null,
          method: row.method,
          amount_cents: row.amountCents,
        };
      });
      type MethodKey = "cash" | "card" | "check";
      const methodTotals = (): Record<MethodKey, { total: number; payments: number; refunds: number; count: number }> => ({
        cash: { total: 0, payments: 0, refunds: 0, count: 0 },
        card: { total: 0, payments: 0, refunds: 0, count: 0 },
        check: { total: 0, payments: 0, refunds: 0, count: 0 },
      });
      const overall = methodTotals();
      const byDay = new Map<string, { entries: typeof entries; methods: ReturnType<typeof methodTotals>; payments: number; refunds: number; paymentCount: number; refundCount: number }>();
      for (const entry of entries) {
        const bucket = overall[entry.method];
        bucket.total += entry.amount_cents;
        bucket.count += 1;
        if (entry.amount_cents >= 0) bucket.payments += entry.amount_cents; else bucket.refunds += -entry.amount_cents;
        let day = byDay.get(entry.day);
        if (!day) { day = { entries: [], methods: methodTotals(), payments: 0, refunds: 0, paymentCount: 0, refundCount: 0 }; byDay.set(entry.day, day); }
        day.entries.push(entry);
        const dayBucket = day.methods[entry.method];
        dayBucket.total += entry.amount_cents;
        dayBucket.count += 1;
        if (entry.amount_cents >= 0) { dayBucket.payments += entry.amount_cents; day.payments += entry.amount_cents; day.paymentCount += 1; }
        else { dayBucket.refunds += -entry.amount_cents; day.refunds += -entry.amount_cents; day.refundCount += 1; }
      }
      const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, day]) => ({
        date,
        total_cents: day.entries.reduce((sum, entry) => sum + entry.amount_cents, 0),
        cash_cents: day.methods.cash.total,
        card_cents: day.methods.card.total,
        check_cents: day.methods.check.total,
        payments_cents: day.payments,
        refunds_cents: day.refunds,
        entry_count: day.entries.length,
        payment_count: day.paymentCount,
        refund_count: day.refundCount,
        entries: day.entries,
      }));
      const by_method = (["cash", "card", "check"] as const).map((method) => ({
        method,
        total_cents: overall[method].total,
        payments_cents: overall[method].payments,
        refunds_cents: overall[method].refunds,
        count: overall[method].count,
      }));
      const fmtDay = (value: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00.000Z`));
      const period_label = args.start_date && args.end_date
        ? `${fmtDay(args.start_date)} - ${fmtDay(args.end_date)}`
        : args.start_date
          ? `From ${fmtDay(args.start_date)}`
          : args.end_date
            ? `Through ${fmtDay(args.end_date)}`
            : "All time";
      return {
        start_date: args.start_date,
        end_date: args.end_date,
        period_label,
        days,
        by_method,
        totals: {
          total_cents: by_method.reduce((sum, row) => sum + row.total_cents, 0),
          cash_cents: overall.cash.total,
          card_cents: overall.card.total,
          check_cents: overall.check.total,
          payments_cents: by_method.reduce((sum, row) => sum + row.payments_cents, 0),
          refunds_cents: by_method.reduce((sum, row) => sum + row.refunds_cents, 0),
          entry_count: entries.length,
          payment_count: entries.filter((entry) => entry.amount_cents >= 0).length,
          refund_count: entries.filter((entry) => entry.amount_cents < 0).length,
          day_count: days.length,
        },
      };
    },
  }),

  getMonthlyStatement: defineAction({
    request: z.object({ customer_id: z.number().int().positive(), year: z.number().int().min(2020).max(2100), month: z.number().int().min(1).max(12) }),
    response: z.object({
      customer: customerSchema.nullable(),
      year: z.number(),
      month: z.number(),
      period_label: z.string(),
      invoices: z.array(saleSummarySchema),
      total_due_cents: z.number(),
      total_invoiced_cents: z.number(),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [customer] = await db.select().from(schema.customers).where(eq(schema.customers.id, args.customer_id)).limit(1);
      const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
      const period_label = `${monthNames[args.month - 1] ?? ""} ${args.year}`;
      if (!customer) return { customer: null, year: args.year, month: args.month, period_label, invoices: [], total_due_cents: 0, total_invoiced_cents: 0 };
      const rows = await db.select().from(schema.sales).where(eq(schema.sales.customerId, args.customer_id)).orderBy(asc(schema.sales.createdAt));
      const inPeriod = rows.filter((r) => {
        const d = r.createdAt;
        return d.getUTCFullYear() === args.year && d.getUTCMonth() + 1 === args.month;
      });
      const due = inPeriod.filter((r) => r.totalCents - r.paidCents > 0);
      const balance = rows.reduce((s, r) => s + r.totalCents - r.paidCents, 0);
      const wish = await openWishlistCount(ctx, args.customer_id);
      const presented = await presentSaleSummaries(ctx, due);
      return {
        customer: presentCustomer(customer, balance, wish),
        year: args.year,
        month: args.month,
        period_label,
        invoices: presented,
        total_due_cents: due.reduce((s, r) => s + (r.totalCents - r.paidCents), 0),
        total_invoiced_cents: inPeriod.reduce((s, r) => s + r.totalCents, 0),
      };
    },
  }),

  summarizeVoiceNote: defineAction({
    request: z.object({
      transcript: z.string().min(1).max(20000),
    }),
    response: z.object({
      ok: z.boolean(),
      summary: z.string().optional(),
      action_items: z.array(z.string()).optional(),
      error: z.string().optional(),
    }),
    async handler(ctx, args) {
      const voiceNoteSchema = z.object({
        summary: z.string(),
        action_items: z.array(z.string()),
      });
      try {
        const result = await ctx.inference.complete(
          `You are helping a field salesperson for RIMA Supply, an autobody supply distributor. The salesperson just recorded a voice note during a visit to a customer's body shop. Read the transcript below and produce:
1. A concise summary (2-4 sentences) of what was discussed or observed.
2. A list of concrete action items — products to order or quote, follow-ups, pricing questions, delivery notes, anything the store team needs to act on. Keep each item short and specific.

Transcript:
${args.transcript.slice(0, 15000)}`,
          { schema: voiceNoteSchema, timeout_secs: 60 },
        );
        return { ok: true, summary: result.summary, action_items: result.action_items };
      } catch {
        return { ok: false, error: "AI summaries need an API key — ask Randy." };
      }
    },
  }),
  // ── Tasks / Daily Ops ──────────────────────────────────────────────

  listTasks: defineAction({
    request: z.object({
      assigned_to: z.string().trim().max(100).optional(),
      due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      include_completed: z.boolean().default(false),
    }),
    response: z.object({ tasks: z.array(taskSchema) }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const conditions = [];
      if (args.assigned_to) conditions.push(eq(schema.tasks.assignedTo, args.assigned_to));
      if (args.due_date) conditions.push(eq(schema.tasks.dueDate, args.due_date));
      if (!args.include_completed) conditions.push(eq(schema.tasks.isCompleted, 0));
      const rows = await db.select().from(schema.tasks)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(asc(schema.tasks.dueDate), desc(schema.tasks.priority), asc(schema.tasks.createdAt));
      return { tasks: await Promise.all(rows.map((r) => presentTask(ctx, r))) };
    },
  }),

  createTask: defineAction({
    request: z.object({
      title: z.string().trim().min(1).max(300),
      description: z.string().trim().max(2000).default(""),
      assigned_to: z.string().trim().min(1).max(100),
      due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
      repeat_pattern: z.enum(["none", "daily", "weekly"]).default("none"),
      customer_id: z.number().int().positive().nullable().default(null),
      priority: z.enum(["low", "normal", "high"]).default("normal"),
      task_type: z.enum(["task", "sales_call", "visit"]).default("task"),
    }),
    response: taskResponse,
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      if (args.customer_id !== null) {
        const [customer] = await db.select({ id: schema.customers.id }).from(schema.customers).where(eq(schema.customers.id, args.customer_id)).limit(1);
        if (!customer) return { ok: false, error: "Customer not found.", task: null };
      }
      const [row] = await db.insert(schema.tasks).values({
        title: args.title.trim(),
        description: args.description.trim(),
        assignedTo: args.assigned_to.trim(),
        dueDate: args.due_date,
        repeatPattern: args.repeat_pattern,
        customerId: args.customer_id,
        priority: args.priority,
        taskType: args.task_type,
        createdBy: ctx.user?.displayName ?? ctx.user?.username ?? "",
        isCompleted: 0,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();
      if (!row) return { ok: false, error: "Could not save that task.", task: null };
      ctx.invalidateQueries();
      return { ok: true, task: await presentTask(ctx, row) };
    },
  }),

  updateTask: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      title: z.string().trim().min(1).max(300).optional(),
      description: z.string().trim().max(2000).optional(),
      assigned_to: z.string().trim().min(1).max(100).optional(),
      due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      repeat_pattern: z.enum(["none", "daily", "weekly"]).optional(),
      customer_id: z.number().int().positive().nullable().optional(),
      priority: z.enum(["low", "normal", "high"]).optional(),
      task_type: z.enum(["task", "sales_call", "visit"]).optional(),
    }),
    response: taskResponse,
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (args.title !== undefined) patch.title = args.title.trim();
      if (args.description !== undefined) patch.description = args.description.trim();
      if (args.assigned_to !== undefined) patch.assignedTo = args.assigned_to.trim();
      if (args.due_date !== undefined) patch.dueDate = args.due_date;
      if (args.repeat_pattern !== undefined) patch.repeatPattern = args.repeat_pattern;
      if (args.priority !== undefined) patch.priority = args.priority;
      if (args.task_type !== undefined) patch.taskType = args.task_type;
      if (args.customer_id !== undefined) {
        if (args.customer_id !== null) {
          const [customer] = await db.select({ id: schema.customers.id }).from(schema.customers).where(eq(schema.customers.id, args.customer_id)).limit(1);
          if (!customer) return { ok: false, error: "Customer not found.", task: null };
        }
        patch.customerId = args.customer_id;
      }
      const [row] = await db.update(schema.tasks).set(patch).where(eq(schema.tasks.id, args.id)).returning();
      if (!row) return { ok: false, error: "Task not found.", task: null };
      ctx.invalidateQueries();
      return { ok: true, task: await presentTask(ctx, row) };
    },
  }),

  completeTask: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.boolean(), error: z.string().optional() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db.update(schema.tasks).set({ isCompleted: 1, completedAt: new Date(), updatedAt: new Date() }).where(eq(schema.tasks.id, args.id)).returning({ id: schema.tasks.id });
      if (!row) return { ok: false, error: "Task not found." };
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  reopenTask: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.boolean(), error: z.string().optional() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db.update(schema.tasks).set({ isCompleted: 0, completedAt: null, updatedAt: new Date() }).where(eq(schema.tasks.id, args.id)).returning({ id: schema.tasks.id });
      if (!row) return { ok: false, error: "Task not found." };
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  deleteTask: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.boolean(), error: z.string().optional() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db.delete(schema.tasks).where(eq(schema.tasks.id, args.id)).returning({ id: schema.tasks.id });
      if (!row) return { ok: false, error: "Task not found." };
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  getDailyTasks: defineAction({
    request: z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      assigned_to: z.string().trim().max(100).optional(),
    }),
    response: z.object({ tasks: z.array(dailyTaskSchema) }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const target = args.date;
      const targetDow = new Date(target + "T12:00:00Z").getUTCDay();

      // Stored tasks: due on target date, not completed.
      const storedConds = [eq(schema.tasks.dueDate, target), eq(schema.tasks.isCompleted, 0)];
      if (args.assigned_to) storedConds.push(eq(schema.tasks.assignedTo, args.assigned_to));
      const stored = await db.select().from(schema.tasks).where(and(...storedConds))
        .orderBy(desc(schema.tasks.priority), asc(schema.tasks.createdAt));

      // Repeating tasks: compute virtual instances (no DB rows).
      const repeatConds = [eq(schema.tasks.isCompleted, 0), or(eq(schema.tasks.repeatPattern, "daily"), eq(schema.tasks.repeatPattern, "weekly"))];
      if (args.assigned_to) repeatConds.push(eq(schema.tasks.assignedTo, args.assigned_to));
      const repeaters = await db.select().from(schema.tasks).where(and(...repeatConds));
      const virtual: Array<{ row: TaskRow; label: string }> = [];
      for (const r of repeaters) {
        if (r.dueDate === target) continue; // already covered by stored query
        if (r.repeatPattern === "daily") {
          virtual.push({ row: r, label: "Repeats daily" });
        } else if (r.repeatPattern === "weekly") {
          const anchorDow = r.dueDate ? new Date(r.dueDate + "T12:00:00Z").getUTCDay() : null;
          // Weekly repeats on the anchor weekday; if no anchor, show every day.
          if (anchorDow === null || anchorDow === targetDow) virtual.push({ row: r, label: "Repeats weekly" });
        }
      }

      const out: z.infer<typeof dailyTaskSchema>[] = [];
      for (const r of stored) out.push({ ...(await presentTask(ctx, r)), is_auto: false, auto_label: null });
      for (const v of virtual) out.push({ ...(await presentTask(ctx, v.row)), is_auto: true, auto_label: v.label });

      // Smart follow-ups: stale wishlist items (>7 days old, still open).
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const staleWishes = await db.select({
        id: schema.wishlistItems.id,
        title: schema.wishlistItems.title,
        createdAt: schema.wishlistItems.createdAt,
        customerId: schema.customers.id,
        customerName: schema.customers.name,
        businessName: schema.customers.businessName,
      })
        .from(schema.wishlistItems)
        .innerJoin(schema.customers, eq(schema.wishlistItems.customerId, schema.customers.id))
        .where(and(eq(schema.wishlistItems.status, "open"), lt(schema.wishlistItems.createdAt, sevenDaysAgo)))
        .limit(50);
      for (const w of staleWishes) {
        const custLabel = w.businessName || w.customerName;
        out.push({
          id: -w.id, title: `Follow up: ${custLabel} wished for ${w.title}`,
          description: `Wishlist item from ${w.createdAt.toISOString().slice(0, 10)} — check stock or order it.`,
          assigned_to: args.assigned_to ?? "", due_date: target, repeat_pattern: "none",
          is_completed: 0, completed_at: null, customer_id: w.customerId,
          customer_name: custLabel, priority: "normal", task_type: "task",
          created_by: "", created_at: w.createdAt.toISOString(), updated_at: w.createdAt.toISOString(),
          is_auto: true, auto_label: "Wishlist follow-up",
        });
      }

      // Smart follow-ups: backordered receiving lines.
      const backorders = await db.select({
        productId: schema.receivingLines.productId,
        rawDescription: schema.receivingLines.rawDescription,
        backorderQty: schema.receivingLines.backorderQty,
      })
        .from(schema.receivingLines)
        .where(gt(schema.receivingLines.backorderQty, 0))
        .limit(50);
      const seenProducts = new Set<number>();
      for (const b of backorders) {
        let label = b.rawDescription || "Unknown product";
        if (b.productId !== null && !seenProducts.has(b.productId)) {
          seenProducts.add(b.productId);
          const [p] = await db.select({ title: schema.products.title }).from(schema.products).where(eq(schema.products.id, b.productId)).limit(1);
          if (p) label = p.title;
        } else if (b.productId !== null) {
          continue; // already listed this product
        }
        out.push({
          id: -(100000 + (b.productId ?? 0)), title: `Follow up on backorder: ${label} (${b.backorderQty} units)`,
          description: "Backordered from supplier — check status or notify waiting customers.",
          assigned_to: args.assigned_to ?? "", due_date: target, repeat_pattern: "none",
          is_completed: 0, completed_at: null, customer_id: null, customer_name: null,
          priority: "high", task_type: "task", created_by: "",
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          is_auto: true, auto_label: "Backorder follow-up",
        });
      }

      // Sort: high priority first, then by type (visits, calls, tasks), then title.
      const prioRank = { high: 0, normal: 1, low: 2 };
      const typeRank = { visit: 0, sales_call: 1, task: 2 };
      out.sort((a, b) => (prioRank[a.priority] - prioRank[b.priority]) || (typeRank[a.task_type] - typeRank[b.task_type]) || a.title.localeCompare(b.title));
      return { tasks: out };
    },
  }),

  // ── Accounting / Bills & Expenses (QuickBooks replacement) ──────────────
  // TEST-DATA NOTE: getProfitLoss EXCLUDES test invoices 1001-1010 (see schema.ts
  // comment). All bills default to is_test=0 (real).

  listBills: defineAction({
    request: z.object({
      start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      category: z.string().optional(),
      unpaid_only: z.boolean().default(false),
    }),
    response: z.object({
      bills: z.array(z.object({
        id: z.number(), vendor_name: z.string(), invoice_number: z.string(),
        bill_date: z.string(), due_date: z.string().nullable(),
        amount_cents: z.number(), category: z.string(),
        payment_method: z.string(), paid_at: z.string().nullable(),
        notes: z.string(), has_attachment: z.boolean(),
      })),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const conditions = [eq(schema.bills.isTest, 0)];
      if (args.start_date) conditions.push(gte(schema.bills.billDate, args.start_date));
      if (args.end_date) conditions.push(lte(schema.bills.billDate, args.end_date));
      if (args.category) conditions.push(eq(schema.bills.category, args.category));
      if (args.unpaid_only) conditions.push(eq(schema.bills.paymentMethod, "unpaid"));
      const rows = await db.select().from(schema.bills)
        .where(and(...conditions))
        .orderBy(desc(schema.bills.billDate))
        .limit(500);
      return {
        bills: rows.map((r) => ({
          id: r.id, vendor_name: r.vendorName, invoice_number: r.invoiceNumber,
          bill_date: r.billDate, due_date: r.dueDate,
          amount_cents: r.amountCents, category: r.category,
          payment_method: r.paymentMethod,
          paid_at: r.paidAt ? r.paidAt.toISOString() : null,
          notes: r.notes, has_attachment: !!r.attachmentBlobKey,
        })),
      };
    },
  }),

  createBill: defineAction({
    request: z.object({
      vendor_name: z.string().trim().min(1).max(200),
      invoice_number: z.string().trim().max(100).default(""),
      bill_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      amount_cents: z.number().int().min(0),
      category: z.string().trim().min(1).max(100),
      payment_method: z.enum(["unpaid", "cash", "check", "card", "ach"]).default("unpaid"),
      notes: z.string().max(2000).default(""),
    }),
    response: z.object({ ok: z.boolean(), error: z.string().optional(), bill_id: z.number().optional() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const now = new Date();
      const [row] = await db.insert(schema.bills).values({
        vendorName: args.vendor_name,
        invoiceNumber: args.invoice_number,
        billDate: args.bill_date,
        dueDate: args.due_date ?? null,
        amountCents: args.amount_cents,
        category: args.category,
        paymentMethod: args.payment_method,
        paidAt: args.payment_method === "unpaid" ? null : now,
        notes: args.notes,
        isTest: 0,
        createdBy: ctx.user?.displayName ?? "",
        createdAt: now,
        updatedAt: now,
      }).returning({ id: schema.bills.id });
      ctx.invalidateQueries();
      return { ok: true, bill_id: row.id };
    },
  }),

  updateBill: defineAction({
    request: z.object({
      id: z.number().int(),
      vendor_name: z.string().trim().min(1).max(200).optional(),
      invoice_number: z.string().trim().max(100).optional(),
      bill_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      amount_cents: z.number().int().min(0).optional(),
      category: z.string().trim().min(1).max(100).optional(),
      notes: z.string().max(2000).optional(),
    }),
    response: z.object({ ok: z.boolean(), error: z.string().optional() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const { id, ...fields } = args;
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (fields.vendor_name !== undefined) patch.vendorName = fields.vendor_name;
      if (fields.invoice_number !== undefined) patch.invoiceNumber = fields.invoice_number;
      if (fields.bill_date !== undefined) patch.billDate = fields.bill_date;
      if (fields.due_date !== undefined) patch.dueDate = fields.due_date;
      if (fields.amount_cents !== undefined) patch.amountCents = fields.amount_cents;
      if (fields.category !== undefined) patch.category = fields.category;
      if (fields.notes !== undefined) patch.notes = fields.notes;
      await db.update(schema.bills).set(patch).where(eq(schema.bills.id, id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  deleteBill: defineAction({
    request: z.object({ id: z.number().int() }),
    response: z.object({ ok: z.boolean() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      await db.delete(schema.bills).where(eq(schema.bills.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  markBillPaid: defineAction({
    request: z.object({
      id: z.number().int(),
      payment_method: z.enum(["cash", "check", "card", "ach"]),
    }),
    response: z.object({ ok: z.boolean() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      await db.update(schema.bills).set({
        paymentMethod: args.payment_method,
        paidAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(schema.bills.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  listExpenseCategories: defineAction({
    request: z.object({}),
    response: z.object({ categories: z.array(z.object({ id: z.number(), name: z.string() })) }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.expenseCategories).orderBy(asc(schema.expenseCategories.name));
      return { categories: rows.map((r) => ({ id: r.id, name: r.name })) };
    },
  }),

  getProfitLoss: defineAction({
    request: z.object({
      start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
    response: z.object({
      revenue_cents: z.number(),
      cogs_cents: z.number(),
      gross_profit_cents: z.number(),
      expenses_cents: z.number(),
      expenses_by_category: z.array(z.object({ category: z.string(), amount_cents: z.number() })),
      net_income_cents: z.number(),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      // TEST INVOICES 1001-1010 are excluded — they are Oct 11, 2026 test data.
      const TEST_INVOICE_MIN = 1001;
      const TEST_INVOICE_MAX = 1010;
      const startMs = new Date(args.start_date + "T00:00:00").getTime();
      const endMs = new Date(args.end_date + "T23:59:59.999").getTime();

      // Revenue: sum of sales totals in range, excluding test invoices.
      const salesRows = await db.select({
        invoiceNumber: schema.sales.invoiceNumber,
        totalCents: schema.sales.totalCents,
        createdAt: schema.sales.createdAt,
      }).from(schema.sales);
      let revenueCents = 0;
      const realSaleIds = new Set<string>();
      const saleIdByInvoice = new Map<number, string>();
      for (const s of salesRows) {
        const inv = s.invoiceNumber ?? 0;
        if (inv >= TEST_INVOICE_MIN && inv <= TEST_INVOICE_MAX) continue; // test data
        const t = s.createdAt instanceof Date ? s.createdAt.getTime() : Number(s.createdAt);
        if (t < startMs || t > endMs) continue;
        revenueCents += s.totalCents;
      }
      // COGS: need sale ids for real sales to sum line-item costs.
      const allSales = await db.select({ id: schema.sales.id, invoiceNumber: schema.sales.invoiceNumber }).from(schema.sales);
      const realIds = allSales.filter((s) => {
        const inv = s.invoiceNumber ?? 0;
        return !(inv >= TEST_INVOICE_MIN && inv <= TEST_INVOICE_MAX);
      }).map((s) => s.id);
      let cogsCents = 0;
      if (realIds.length > 0) {
        const items = await db.select({
          saleId: schema.saleItems.saleId,
          productId: schema.saleItems.productId,
          quantity: schema.saleItems.quantity,
        }).from(schema.saleItems).where(inArray(schema.saleItems.saleId, realIds));
        const productIds = [...new Set(items.map((i) => i.productId))];
        const costMap = new Map<number, number>();
        if (productIds.length > 0) {
          const prods = await db.select({ id: schema.products.id, costCents: schema.products.costCents })
            .from(schema.products).where(inArray(schema.products.id, productIds));
          for (const p of prods) costMap.set(p.id, p.costCents);
        }
        // Only count items from sales in the date range — need sale dates.
        const saleDates = new Map<string, number>();
        for (const s of salesRows) {
          const inv = s.invoiceNumber ?? 0;
          if (inv >= TEST_INVOICE_MIN && inv <= TEST_INVOICE_MAX) continue;
          const t = s.createdAt instanceof Date ? s.createdAt.getTime() : Number(s.createdAt);
          // find sale id via allSales
          const match = allSales.find((a) => a.invoiceNumber === inv);
          if (match) saleDates.set(match.id, t);
        }
        for (const item of items) {
          const t = saleDates.get(item.saleId);
          if (t === undefined || t < startMs || t > endMs) continue;
          cogsCents += (costMap.get(item.productId) ?? 0) * item.quantity;
        }
      }

      // Expenses: bills in range, excluding test bills.
      const billRows = await db.select().from(schema.bills)
        .where(and(
          eq(schema.bills.isTest, 0),
          gte(schema.bills.billDate, args.start_date),
          lte(schema.bills.billDate, args.end_date),
        ));
      const byCategory = new Map<string, number>();
      let expensesCents = 0;
      for (const b of billRows) {
        expensesCents += b.amountCents;
        byCategory.set(b.category, (byCategory.get(b.category) ?? 0) + b.amountCents);
      }
      const expensesByCategory = [...byCategory.entries()]
        .map(([category, amount_cents]) => ({ category, amount_cents }))
        .sort((a, b) => b.amount_cents - a.amount_cents);

      const grossProfit = revenueCents - cogsCents;
      return {
        revenue_cents: revenueCents,
        cogs_cents: cogsCents,
        gross_profit_cents: grossProfit,
        expenses_cents: expensesCents,
        expenses_by_category: expensesByCategory,
        net_income_cents: grossProfit - expensesCents,
      };
    },
  }),

  getUnpaidBills: defineAction({
    request: z.object({}),
    response: z.object({
      total_cents: z.number(),
      bills: z.array(z.object({
        id: z.number(), vendor_name: z.string(), invoice_number: z.string(),
        bill_date: z.string(), due_date: z.string().nullable(),
        amount_cents: z.number(), category: z.string(), notes: z.string(),
        is_overdue: z.boolean(),
      })),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const today = new Date().toISOString().slice(0, 10);
      const rows = await db.select().from(schema.bills)
        .where(and(eq(schema.bills.isTest, 0), eq(schema.bills.paymentMethod, "unpaid")))
        .orderBy(asc(schema.bills.dueDate));
      let total = 0;
      const bills = rows.map((r) => {
        total += r.amountCents;
        return {
          id: r.id, vendor_name: r.vendorName, invoice_number: r.invoiceNumber,
          bill_date: r.billDate, due_date: r.dueDate,
          amount_cents: r.amountCents, category: r.category, notes: r.notes,
          is_overdue: !!r.dueDate && r.dueDate < today,
        };
      });
      // Bills with no due date go last.
      bills.sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date.localeCompare(b.due_date);
      });
      return { total_cents: total, bills };
    },
  }),

  uploadBillPdf: defineAction({
    request: z.object({
      file_name: z.string().trim().min(1).max(255),
      data_base64: z.string().min(1).max(16000000),
      mime_type: z.literal("application/pdf"),
    }),
    response: z.object({
      ok: z.boolean(), error: z.string().optional(),
      extracted: z.object({
        vendor_name: z.string(), invoice_number: z.string(),
        bill_date: z.string(), due_date: z.string(),
        amount_cents: z.number(),
      }).nullable(),
      blob_key: z.string().nullable(),
    }),
    privileged: [privileged.extractPdfText],
    async handler(ctx, args): Promise<{
      ok: boolean; error?: string;
      extracted: { vendor_name: string; invoice_number: string; bill_date: string; due_date: string; amount_cents: number } | null;
      blob_key: string | null;
    }> {
      const raw = args.data_base64.includes(",") ? (args.data_base64.split(",")[1] ?? "") : args.data_base64;
      let bytes: Uint8Array;
      try {
        bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
      } catch {
        return { ok: false, error: "That PDF could not be decoded.", extracted: null, blob_key: null };
      }
      if (bytes.byteLength === 0) return { ok: false, error: "That PDF was empty.", extracted: null, blob_key: null };
      if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) {
        return { ok: false, error: "That file is not a PDF.", extracted: null, blob_key: null };
      }
      const blobKey = `bills/${crypto.randomUUID()}.pdf`;
      await ctx.blobs.put(blobKey, bytes, { contentType: "application/pdf" });

      let extracted: { vendor_name: string; invoice_number: string; bill_date: string; due_date: string; amount_cents: number } | null = null;
      try {
        const textResult = await ctx.executePrivileged(privileged.extractPdfText, { data_base64: raw });
        if (textResult.ok) {
          try {
            extracted = await ctx.inference.complete(
              `Read this bill or invoice PDF text and extract: vendor name, invoice number, bill date (YYYY-MM-DD), due date (YYYY-MM-DD, empty if none), and total amount in dollars. Document text:\n\n${textResult.text.slice(0, 60000)}`,
              {
                schema: z.object({
                  vendor_name: z.string(), invoice_number: z.string(),
                  bill_date: z.string(), due_date: z.string(),
                  amount_cents: z.number().int(),
                }),
              },
            );
          } catch {
            // AI extraction failed — fall back to regex.
            const text = textResult.text;
            const amtMatch = text.match(/(?:total|amount due|balance due)[:\s]*\$?([\d,]+\.\d{2})/i);
            const invMatch = text.match(/invoice\s*(?:#|no\.?|number)?[:\s]*([A-Za-z0-9-]+)/i);
            const dateMatch = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
            let billDate = "";
            if (dateMatch) {
              const [, m, d, y] = dateMatch;
              billDate = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
            }
            extracted = {
              vendor_name: "",
              invoice_number: invMatch ? invMatch[1] : "",
              bill_date: billDate,
              due_date: "",
              amount_cents: amtMatch ? Math.round(parseFloat(amtMatch[1].replace(/,/g, "")) * 100) : 0,
            };
          }
        }
      } catch {
        // PDF text extraction failed — still return the blob key so the user can attach manually.
      }
      return { ok: true, extracted, blob_key: blobKey };
    },
  }),
} satisfies ActionsModule;
