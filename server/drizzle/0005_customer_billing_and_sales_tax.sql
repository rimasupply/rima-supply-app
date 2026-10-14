ALTER TABLE `customers` ADD `business_name` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `customers` ADD `tax_id` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `customers` ADD `delivery_street` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `customers` ADD `delivery_city` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `customers` ADD `delivery_state` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `customers` ADD `delivery_zip` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `customers` ADD `ap_name` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `customers` ADD `ap_phone` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `customers` ADD `ap_email` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `customers` ADD `card_last4` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `customers` ADD `card_expiry` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `customers` ADD `cardholder_name` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `customers` ADD `tax_status` text DEFAULT 'taxable' NOT NULL;
--> statement-breakpoint
ALTER TABLE `customers` ADD `tax_rate_bps` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `sales` ADD `subtotal_cents` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `sales` ADD `tax_cents` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `sales` ADD `tax_rate_bps` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `sales` ADD `tax_status` text DEFAULT 'taxable' NOT NULL;
--> statement-breakpoint
UPDATE `sales` SET `subtotal_cents` = `total_cents`;