CREATE TABLE `customers` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `phone` text DEFAULT '' NOT NULL,
  `email` text DEFAULT '' NOT NULL,
  `notes` text DEFAULT '' NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `customers_name_index` ON `customers` (`name`);
--> statement-breakpoint
CREATE INDEX `customers_phone_index` ON `customers` (`phone`);
--> statement-breakpoint
CREATE INDEX `customers_email_index` ON `customers` (`email`);
--> statement-breakpoint
CREATE TABLE `sales` (
  `id` text PRIMARY KEY NOT NULL,
  `customer_id` integer,
  `customer_name` text NOT NULL,
  `total_cents` integer NOT NULL,
  `paid_cents` integer NOT NULL,
  `status` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `sales_customer_index` ON `sales` (`customer_id`);
--> statement-breakpoint
CREATE INDEX `sales_created_index` ON `sales` (`created_at`);
--> statement-breakpoint
CREATE TABLE `sale_items` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `sale_id` text NOT NULL,
  `product_id` integer NOT NULL,
  `product_title` text NOT NULL,
  `quantity` integer NOT NULL,
  `unit_price_cents` integer NOT NULL,
  `line_total_cents` integer NOT NULL,
  FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `sale_items_sale_index` ON `sale_items` (`sale_id`);
--> statement-breakpoint
CREATE TABLE `payments` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `customer_id` integer,
  `sale_id` text,
  `amount_cents` integer NOT NULL,
  `method` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `payments_customer_index` ON `payments` (`customer_id`);
--> statement-breakpoint
CREATE INDEX `payments_sale_index` ON `payments` (`sale_id`);
