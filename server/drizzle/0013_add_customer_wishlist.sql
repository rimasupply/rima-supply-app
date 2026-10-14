CREATE TABLE `wishlist_items` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `customer_id` integer NOT NULL REFERENCES `customers`(`id`) ON DELETE CASCADE,
  `product_id` integer REFERENCES `products`(`id`) ON DELETE SET NULL,
  `title` text NOT NULL,
  `notes` text DEFAULT '' NOT NULL,
  `status` text DEFAULT 'open' NOT NULL,
  `created_at` integer NOT NULL,
  `done_at` integer
);
--> statement-breakpoint
CREATE INDEX `wishlist_items_customer_index` ON `wishlist_items` (`customer_id`);
--> statement-breakpoint
CREATE INDEX `wishlist_items_status_index` ON `wishlist_items` (`status`);
--> statement-breakpoint
CREATE INDEX `wishlist_items_created_index` ON `wishlist_items` (`created_at`);
