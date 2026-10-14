ALTER TABLE `products` ADD `inbound_qty` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `products` ADD `medco_cost_cents` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `products` ADD `oak_cost_cents` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `products` ADD `medco_moq` integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `products` ADD `oak_moq` integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `products` ADD `medco_available` integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `products` ADD `oak_available` integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `app_settings` ADD `medco_min_order_cents` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `app_settings` ADD `oak_min_order_cents` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `app_settings` ADD `next_po_number` integer NOT NULL DEFAULT 1001;
--> statement-breakpoint
CREATE TABLE `purchase_orders` (
  `id` text PRIMARY KEY NOT NULL,
  `po_number` integer,
  `supplier` text NOT NULL,
  `status` text DEFAULT 'draft' NOT NULL,
  `notes` text DEFAULT '' NOT NULL,
  `total_cents` integer DEFAULT 0 NOT NULL,
  `created_at` integer NOT NULL,
  `approved_at` integer,
  `received_at` integer,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_orders_po_number_unique` ON `purchase_orders` (`po_number`);
--> statement-breakpoint
CREATE INDEX `purchase_orders_status_index` ON `purchase_orders` (`status`);
--> statement-breakpoint
CREATE INDEX `purchase_orders_supplier_index` ON `purchase_orders` (`supplier`);
--> statement-breakpoint
CREATE TABLE `purchase_order_items` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `po_id` text NOT NULL REFERENCES `purchase_orders`(`id`) ON DELETE CASCADE,
  `product_id` integer NOT NULL REFERENCES `products`(`id`) ON DELETE RESTRICT,
  `product_title` text NOT NULL,
  `supplier_part_number` text DEFAULT '' NOT NULL,
  `quantity` integer NOT NULL,
  `suggested_quantity` integer NOT NULL,
  `unit_cost_cents` integer NOT NULL,
  `line_total_cents` integer NOT NULL,
  `par_level` integer NOT NULL,
  `on_hand` integer NOT NULL,
  `inbound_qty` integer NOT NULL,
  `need_qty` integer NOT NULL,
  `moq` integer DEFAULT 1 NOT NULL,
  `choice_reason` text DEFAULT '' NOT NULL,
  `alt_supplier` text DEFAULT '' NOT NULL,
  `alt_part_number` text DEFAULT '' NOT NULL,
  `alt_cost_cents` integer DEFAULT 0 NOT NULL,
  `alt_available` integer DEFAULT 0 NOT NULL,
  `alt_moq` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `purchase_order_items_po_index` ON `purchase_order_items` (`po_id`);
--> statement-breakpoint
CREATE INDEX `purchase_order_items_product_index` ON `purchase_order_items` (`product_id`);
