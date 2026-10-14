ALTER TABLE `products` ADD `medco_part_number` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `products` ADD `oak_part_number` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `products` ADD `image_blob_key` text;