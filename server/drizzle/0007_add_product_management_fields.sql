ALTER TABLE `products` ADD `short_description` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `products` ADD `part_number` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `products` ADD `sku` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `products` ADD `msrp_cents` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `products` ADD `markup_bps` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE `products` SET `short_description` = `title`, `msrp_cents` = `price_cents`, `markup_bps` = CASE WHEN `cost_cents` > 0 THEN CAST(ROUND(((`price_cents` - `cost_cents`) * 10000.0) / `cost_cents`) AS INTEGER) ELSE 0 END;