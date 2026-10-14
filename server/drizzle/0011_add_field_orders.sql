CREATE TABLE `field_orders` (
  `id` text PRIMARY KEY NOT NULL,
  `customer_id` integer NOT NULL REFERENCES `customers`(`id`) ON DELETE RESTRICT,
  `customer_name` text NOT NULL,
  `status` text DEFAULT 'draft' NOT NULL,
  `notes` text DEFAULT '' NOT NULL,
  `created_by` text DEFAULT 'Randy' NOT NULL,
  `sale_id` text REFERENCES `sales`(`id`) ON DELETE SET NULL,
  `finalized_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `field_order_items` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `field_order_id` text NOT NULL REFERENCES `field_orders`(`id`) ON DELETE CASCADE,
  `product_id` integer NOT NULL REFERENCES `products`(`id`) ON DELETE RESTRICT,
  `product_title` text NOT NULL,
  `part_number` text DEFAULT '' NOT NULL,
  `quantity` integer NOT NULL,
  `unit_price_cents` integer NOT NULL,
  `line_total_cents` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `field_orders_customer_index` ON `field_orders` (`customer_id`);
--> statement-breakpoint
CREATE INDEX `field_orders_status_index` ON `field_orders` (`status`);
--> statement-breakpoint
CREATE INDEX `field_orders_created_index` ON `field_orders` (`created_at`);
--> statement-breakpoint
CREATE INDEX `field_order_items_order_index` ON `field_order_items` (`field_order_id`);
