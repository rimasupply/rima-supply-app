DROP TABLE entries;
--> statement-breakpoint
CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seed_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  vendor TEXT NOT NULL,
  barcode TEXT,
  quantity INTEGER NOT NULL DEFAULT 0,
  par_level INTEGER NOT NULL DEFAULT 0,
  price_cents INTEGER NOT NULL DEFAULT 0,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX products_barcode_unique ON products (barcode) WHERE barcode IS NOT NULL;
--> statement-breakpoint
CREATE INDEX products_title_index ON products (title);
--> statement-breakpoint
CREATE INDEX products_vendor_index ON products (vendor);
