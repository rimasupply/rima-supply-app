CREATE TABLE `returns` (
  `id` text PRIMARY KEY NOT NULL,
  `sale_id` text NOT NULL REFERENCES `sales`(`id`) ON DELETE RESTRICT,
  `customer_id` integer REFERENCES `customers`(`id`) ON DELETE RESTRICT,
  `customer_name` text NOT NULL,
  `refund_method` text NOT NULL,
  `subtotal_cents` integer DEFAULT 0 NOT NULL,
  `tax_cents` integer DEFAULT 0 NOT NULL,
  `total_cents` integer NOT NULL,
  `refunded_cents` integer DEFAULT 0 NOT NULL,
  `credited_cents` integer DEFAULT 0 NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `return_items` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `return_id` text NOT NULL REFERENCES `returns`(`id`) ON DELETE CASCADE,
  `sale_item_id` integer NOT NULL REFERENCES `sale_items`(`id`) ON DELETE RESTRICT,
  `product_id` integer NOT NULL REFERENCES `products`(`id`) ON DELETE RESTRICT,
  `product_title` text NOT NULL,
  `quantity` integer NOT NULL,
  `unit_price_cents` integer NOT NULL,
  `line_total_cents` integer NOT NULL,
  `reason` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `returns_sale_index` ON `returns` (`sale_id`);
--> statement-breakpoint
CREATE INDEX `returns_customer_index` ON `returns` (`customer_id`);
--> statement-breakpoint
CREATE INDEX `returns_created_index` ON `returns` (`created_at`);
--> statement-breakpoint
CREATE INDEX `return_items_return_index` ON `return_items` (`return_id`);
--> statement-breakpoint
CREATE INDEX `return_items_sale_item_index` ON `return_items` (`sale_item_id`);
