CREATE TABLE `customer_preferences` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `customer_id` integer NOT NULL REFERENCES `customers`(`id`) ON DELETE CASCADE,
  `product_id` integer REFERENCES `products`(`id`) ON DELETE SET NULL,
  `title` text NOT NULL,
  `note` text DEFAULT '' NOT NULL,
  `pinned` integer DEFAULT 1 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `customer_preferences_customer_index` ON `customer_preferences` (`customer_id`);
--> statement-breakpoint
CREATE INDEX `customer_preferences_product_index` ON `customer_preferences` (`product_id`);
--> statement-breakpoint
CREATE INDEX `customer_preferences_pinned_index` ON `customer_preferences` (`pinned`);
