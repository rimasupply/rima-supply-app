ALTER TABLE `products` ADD COLUMN `description` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `products` ADD COLUMN `image_urls` text DEFAULT '[]' NOT NULL;
