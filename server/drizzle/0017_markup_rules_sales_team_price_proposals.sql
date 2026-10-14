ALTER TABLE `products` ADD `markup_override_bps` integer;
--> statement-breakpoint
CREATE TABLE `markup_rules` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `vendor` text DEFAULT '' NOT NULL,
  `markup_bps` integer DEFAULT 0 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `markup_rules_vendor_unique` ON `markup_rules` (`vendor`);
--> statement-breakpoint
CREATE TABLE `price_proposals` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `product_id` integer NOT NULL REFERENCES `products`(`id`) ON DELETE CASCADE,
  `product_title` text DEFAULT '' NOT NULL,
  `vendor` text DEFAULT '' NOT NULL,
  `old_cost_cents` integer DEFAULT 0 NOT NULL,
  `new_cost_cents` integer DEFAULT 0 NOT NULL,
  `old_price_cents` integer DEFAULT 0 NOT NULL,
  `proposed_price_cents` integer DEFAULT 0 NOT NULL,
  `markup_bps` integer DEFAULT 0 NOT NULL,
  `rule_source` text DEFAULT 'vendor' NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `created_at` integer NOT NULL,
  `decided_at` integer
);
--> statement-breakpoint
CREATE INDEX `price_proposals_status_index` ON `price_proposals` (`status`);
--> statement-breakpoint
CREATE INDEX `price_proposals_product_index` ON `price_proposals` (`product_id`);
--> statement-breakpoint
CREATE TABLE `sales_team` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `commission_bps` integer DEFAULT 0 NOT NULL,
  `active` integer DEFAULT 1 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_team_name_unique` ON `sales_team` (`name`);
