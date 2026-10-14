import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const products = sqliteTable(
  "products",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    seedKey: text("seed_key").notNull().unique(),
    title: text("title").notNull(),
    shortDescription: text("short_description").notNull().default(""),
    description: text("description").notNull().default(""),
    tags: text("tags").notNull().default("[]"),
    imageUrls: text("image_urls").notNull().default("[]"),
    vendor: text("vendor").notNull(),
    partNumber: text("part_number").notNull().default(""),
    sku: text("sku").notNull().default(""),
    medcoPartNumber: text("medco_part_number").notNull().default(""),
    oakPartNumber: text("oak_part_number").notNull().default(""),
    imageBlobKey: text("image_blob_key"),
    thumbnailUrl: text("thumbnail_url"),
    barcode: text("barcode"),
    quantity: integer("quantity").notNull().default(0),
    inboundQty: integer("inbound_qty").notNull().default(0),
    medcoCostCents: integer("medco_cost_cents").notNull().default(0),
    oakCostCents: integer("oak_cost_cents").notNull().default(0),
    medcoMoq: integer("medco_moq").notNull().default(1),
    oakMoq: integer("oak_moq").notNull().default(1),
    medcoAvailable: integer("medco_available").notNull().default(1),
    oakAvailable: integer("oak_available").notNull().default(1),
    parLevel: integer("par_level").notNull().default(0),
    msrpCents: integer("msrp_cents").notNull().default(0),
    priceCents: integer("price_cents").notNull().default(0),
    costCents: integer("cost_cents").notNull().default(0),
    markupBps: integer("markup_bps").notNull().default(0),
    markupOverrideBps: integer("markup_override_bps"),
    status: text("status", { enum: ["active", "draft"] }).notNull().default("active"),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("products_barcode_unique").on(table.barcode),
    index("products_title_index").on(table.title),
    index("products_vendor_index").on(table.vendor),
  ],
);

export const customers = sqliteTable(
  "customers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    businessName: text("business_name").notNull().default(""),
    phone: text("phone").notNull().default(""),
    email: text("email").notNull().default(""),
    taxId: text("tax_id").notNull().default(""),
    deliveryStreet: text("delivery_street").notNull().default(""),
    deliveryCity: text("delivery_city").notNull().default(""),
    deliveryState: text("delivery_state").notNull().default(""),
    deliveryZip: text("delivery_zip").notNull().default(""),
    apName: text("ap_name").notNull().default(""),
    apPhone: text("ap_phone").notNull().default(""),
    apEmail: text("ap_email").notNull().default(""),
    cardLast4: text("card_last4").notNull().default(""),
    cardExpiry: text("card_expiry").notNull().default(""),
    cardholderName: text("cardholder_name").notNull().default(""),
    printBalanceDue: integer("print_balance_due").notNull().default(1),
    taxStatus: text("tax_status", { enum: ["taxable", "exempt"] }).notNull().default("taxable"),
    taxRateBps: integer("tax_rate_bps").notNull().default(0),
    taxRateOverrideBps: integer("tax_rate_override_bps"),
    notes: text("notes").notNull().default(""),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index("customers_name_index").on(table.name),
    index("customers_phone_index").on(table.phone),
    index("customers_email_index").on(table.email),
  ],
);

export const appSettings = sqliteTable("app_settings", {
  id: integer("id").primaryKey(),
  nextInvoiceNumber: integer("next_invoice_number").notNull().default(1001),
  medcoMinOrderCents: integer("medco_min_order_cents").notNull().default(0),
  oakMinOrderCents: integer("oak_min_order_cents").notNull().default(0),
  nextPoNumber: integer("next_po_number").notNull().default(1001),
  autoBackupFrequency: text("auto_backup_frequency").notNull().default("off"),
  lastAutoBackupAt: integer("last_auto_backup_at", { mode: "timestamp_ms" }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const purchaseOrders = sqliteTable(
  "purchase_orders",
  {
    id: text("id").primaryKey(),
    poNumber: integer("po_number").unique(),
    supplier: text("supplier", { enum: ["medco", "oak"] }).notNull(),
    status: text("status", { enum: ["draft", "approved", "received", "cancelled"] }).notNull().default("draft"),
    notes: text("notes").notNull().default(""),
    totalCents: integer("total_cents").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    approvedAt: integer("approved_at", { mode: "timestamp_ms" }),
    receivedAt: integer("received_at", { mode: "timestamp_ms" }),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index("purchase_orders_status_index").on(table.status), index("purchase_orders_supplier_index").on(table.supplier)],
);

export const purchaseOrderItems = sqliteTable(
  "purchase_order_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    poId: text("po_id").notNull().references(() => purchaseOrders.id, { onDelete: "cascade" }),
    productId: integer("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
    productTitle: text("product_title").notNull(),
    supplierPartNumber: text("supplier_part_number").notNull().default(""),
    quantity: integer("quantity").notNull(),
    suggestedQuantity: integer("suggested_quantity").notNull(),
    unitCostCents: integer("unit_cost_cents").notNull(),
    lineTotalCents: integer("line_total_cents").notNull(),
    parLevel: integer("par_level").notNull(),
    onHand: integer("on_hand").notNull(),
    inboundQty: integer("inbound_qty").notNull(),
    needQty: integer("need_qty").notNull(),
    moq: integer("moq").notNull().default(1),
    choiceReason: text("choice_reason").notNull().default(""),
    altSupplier: text("alt_supplier").notNull().default(""),
    altPartNumber: text("alt_part_number").notNull().default(""),
    altCostCents: integer("alt_cost_cents").notNull().default(0),
    altAvailable: integer("alt_available").notNull().default(0),
    altMoq: integer("alt_moq").notNull().default(1),
  },
  (table) => [index("purchase_order_items_po_index").on(table.poId), index("purchase_order_items_product_index").on(table.productId)],
);

export const receivingDocuments = sqliteTable(
  "receiving_documents",
  {
    id: text("id").primaryKey(),
    fileName: text("file_name").notNull(),
    fileBlobKey: text("file_blob_key").notNull(),
    mimeType: text("mime_type").notNull().default("application/pdf"),
    supplier: text("supplier", { enum: ["medco", "oak", "unknown"] }).notNull().default("unknown"),
    supplierInvoiceNumber: text("supplier_invoice_number").notNull().default(""),
    documentType: text("document_type", { enum: ["invoice", "packing_list", "unknown"] }).notNull().default("unknown"),
    status: text("status", { enum: ["needs_review", "received", "cancelled"] }).notNull().default("needs_review"),
    parseNotes: text("parse_notes").notNull().default(""),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    appliedAt: integer("applied_at", { mode: "timestamp_ms" }),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index("receiving_documents_status_index").on(table.status),
    index("receiving_documents_supplier_index").on(table.supplier),
    index("receiving_documents_created_index").on(table.createdAt),
  ],
);

export const receivingLines = sqliteTable(
  "receiving_lines",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    documentId: text("document_id").notNull().references(() => receivingDocuments.id, { onDelete: "cascade" }),
    productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
    rawPartNumber: text("raw_part_number").notNull().default(""),
    rawDescription: text("raw_description").notNull().default(""),
    matchedBy: text("matched_by").notNull().default(""),
    orderedQty: integer("ordered_qty").notNull().default(0),
    shippedQty: integer("shipped_qty").notNull().default(0),
    backorderQty: integer("backorder_qty").notNull().default(0),
    unitCostCents: integer("unit_cost_cents").notNull().default(0),
    currentCostCents: integer("current_cost_cents").notNull().default(0),
    costChangeStatus: text("cost_change_status", { enum: ["none", "pending", "approved", "rejected"] }).notNull().default("none"),
    includeLine: integer("include_line").notNull().default(1),
    notes: text("notes").notNull().default(""),
  },
  (table) => [
    index("receiving_lines_document_index").on(table.documentId),
    index("receiving_lines_product_index").on(table.productId),
    index("receiving_lines_cost_status_index").on(table.costChangeStatus),
  ],
);

export const sales = sqliteTable(
  "sales",
  {
    id: text("id").primaryKey(),
    invoiceNumber: integer("invoice_number").unique(),
    customerId: integer("customer_id").references(() => customers.id, { onDelete: "restrict" }),
    customerName: text("customer_name").notNull(),
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0),
    taxRateBps: integer("tax_rate_bps").notNull().default(0),
    taxStatus: text("tax_status", { enum: ["taxable", "exempt"] }).notNull().default("taxable"),
    totalCents: integer("total_cents").notNull(),
    paidCents: integer("paid_cents").notNull(),
    status: text("status", { enum: ["paid", "partial", "unpaid"] }).notNull(),
    salesperson: text("salesperson").notNull().default("Randy"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index("sales_customer_index").on(table.customerId), index("sales_created_index").on(table.createdAt), index("sales_salesperson_index").on(table.salesperson)],
);

export const saleItems = sqliteTable(
  "sale_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    saleId: text("sale_id").notNull().references(() => sales.id, { onDelete: "cascade" }),
    productId: integer("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
    productTitle: text("product_title").notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    lineTotalCents: integer("line_total_cents").notNull(),
  },
  (table) => [index("sale_items_sale_index").on(table.saleId)],
);

export const fieldOrders = sqliteTable(
  "field_orders",
  {
    id: text("id").primaryKey(),
    customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "restrict" }),
    customerName: text("customer_name").notNull(),
    status: text("status", { enum: ["draft", "finalized", "cancelled"] }).notNull().default("draft"),
    notes: text("notes").notNull().default(""),
    createdBy: text("created_by").notNull().default("Randy"),
    saleId: text("sale_id").references(() => sales.id, { onDelete: "set null" }),
    finalizedAt: integer("finalized_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index("field_orders_customer_index").on(table.customerId), index("field_orders_status_index").on(table.status), index("field_orders_created_index").on(table.createdAt)],
);

export const fieldOrderItems = sqliteTable(
  "field_order_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fieldOrderId: text("field_order_id").notNull().references(() => fieldOrders.id, { onDelete: "cascade" }),
    productId: integer("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
    productTitle: text("product_title").notNull(),
    partNumber: text("part_number").notNull().default(""),
    quantity: integer("quantity").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    lineTotalCents: integer("line_total_cents").notNull(),
  },
  (table) => [index("field_order_items_order_index").on(table.fieldOrderId)],
);

export const returns = sqliteTable(
  "returns",
  {
    id: text("id").primaryKey(),
    saleId: text("sale_id").notNull().references(() => sales.id, { onDelete: "restrict" }),
    customerId: integer("customer_id").references(() => customers.id, { onDelete: "restrict" }),
    customerName: text("customer_name").notNull(),
    refundMethod: text("refund_method", { enum: ["cash", "card", "account_credit"] }).notNull(),
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    refundedCents: integer("refunded_cents").notNull().default(0),
    creditedCents: integer("credited_cents").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index("returns_sale_index").on(table.saleId), index("returns_customer_index").on(table.customerId), index("returns_created_index").on(table.createdAt)],
);

export const returnItems = sqliteTable(
  "return_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    returnId: text("return_id").notNull().references(() => returns.id, { onDelete: "cascade" }),
    saleItemId: integer("sale_item_id").notNull().references(() => saleItems.id, { onDelete: "restrict" }),
    productId: integer("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
    productTitle: text("product_title").notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    lineTotalCents: integer("line_total_cents").notNull(),
    reason: text("reason").notNull().default(""),
  },
  (table) => [index("return_items_return_index").on(table.returnId), index("return_items_sale_item_index").on(table.saleItemId)],
);

export const wishlistItems = sqliteTable(
  "wishlist_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
    productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    notes: text("notes").notNull().default(""),
    status: text("status", { enum: ["open", "done"] }).notNull().default("open"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    doneAt: integer("done_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("wishlist_items_customer_index").on(table.customerId),
    index("wishlist_items_status_index").on(table.status),
    index("wishlist_items_created_index").on(table.createdAt),
  ],
);

export const customerPreferences = sqliteTable(
  "customer_preferences",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
    productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    note: text("note").notNull().default(""),
    pinned: integer("pinned").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index("customer_preferences_customer_index").on(table.customerId),
    index("customer_preferences_product_index").on(table.productId),
    index("customer_preferences_pinned_index").on(table.pinned),
  ],
);

export const markupRules = sqliteTable(
  "markup_rules",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    vendor: text("vendor").notNull().default(""),
    markupBps: integer("markup_bps").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex("markup_rules_vendor_unique").on(table.vendor)],
);

export const priceProposals = sqliteTable(
  "price_proposals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    productTitle: text("product_title").notNull().default(""),
    vendor: text("vendor").notNull().default(""),
    oldCostCents: integer("old_cost_cents").notNull().default(0),
    newCostCents: integer("new_cost_cents").notNull().default(0),
    oldPriceCents: integer("old_price_cents").notNull().default(0),
    proposedPriceCents: integer("proposed_price_cents").notNull().default(0),
    markupBps: integer("markup_bps").notNull().default(0),
    ruleSource: text("rule_source").notNull().default("vendor"),
    status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
  },
  (table) => [index("price_proposals_status_index").on(table.status), index("price_proposals_product_index").on(table.productId)],
);

export const salesTeam = sqliteTable(
  "sales_team",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    commissionBps: integer("commission_bps").notNull().default(0),
    active: integer("active").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex("sales_team_name_unique").on(table.name)],
);

export const payments = sqliteTable(
  "payments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    customerId: integer("customer_id").references(() => customers.id, { onDelete: "restrict" }),
    saleId: text("sale_id").references(() => sales.id, { onDelete: "restrict" }),
    amountCents: integer("amount_cents").notNull(),
    method: text("method", { enum: ["cash", "card", "check"] }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index("payments_customer_index").on(table.customerId), index("payments_sale_index").on(table.saleId)],
);

export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: ["admin", "manager", "staff"] }).notNull().default("staff"),
    active: integer("active").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex("users_username_unique").on(table.username)],
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    assignedTo: text("assigned_to").notNull(),
    dueDate: text("due_date"),
    repeatPattern: text("repeat_pattern", { enum: ["none", "daily", "weekly"] }).notNull().default("none"),
    isCompleted: integer("is_completed").notNull().default(0),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
    priority: text("priority", { enum: ["low", "normal", "high"] }).notNull().default("normal"),
    taskType: text("task_type", { enum: ["task", "sales_call", "visit"] }).notNull().default("task"),
    createdBy: text("created_by").notNull().default(""),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index("tasks_assigned_index").on(table.assignedTo),
    index("tasks_due_index").on(table.dueDate),
    index("tasks_customer_index").on(table.customerId),
  ],
);

/**
 * Accounting (QuickBooks replacement).
 *
 * CRITICAL TEST-DATA NOTE (Oct 14, 2026): All sales invoices currently in the
 * app (invoice numbers 1001-1010, created Oct 11, 2026) are TEST DATA, confirmed
 * by Randy. The getProfitLoss action EXCLUDES those invoice numbers from revenue
 * and COGS. New bills get isTest=0 by default; only set isTest=1 for explicitly
 * marked test entries. When real books go live, Randy will clear the test sales.
 */
export const bills = sqliteTable(
  "bills",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    vendorName: text("vendor_name").notNull(),
    invoiceNumber: text("invoice_number").notNull().default(""),
    billDate: text("bill_date").notNull(),
    dueDate: text("due_date"),
    amountCents: integer("amount_cents").notNull(),
    category: text("category").notNull().default("Other"),
    paymentMethod: text("payment_method", { enum: ["unpaid", "cash", "check", "card", "ach"] }).notNull().default("unpaid"),
    paidAt: integer("paid_at", { mode: "timestamp_ms" }),
    notes: text("notes").notNull().default(""),
    attachmentBlobKey: text("attachment_blob_key"),
    isTest: integer("is_test").notNull().default(0),
    createdBy: text("created_by").notNull().default(""),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index("bills_date_index").on(table.billDate),
    index("bills_category_index").on(table.category),
    index("bills_payment_index").on(table.paymentMethod),
  ],
);

export const expenseCategories = sqliteTable(
  "expense_categories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    isDefault: integer("is_default").notNull().default(0),
  },
  (table) => [uniqueIndex("expense_categories_name_unique").on(table.name)],
);
