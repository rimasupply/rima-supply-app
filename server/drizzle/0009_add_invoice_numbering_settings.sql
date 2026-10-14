ALTER TABLE `sales` ADD `invoice_number` integer;
--> statement-breakpoint
UPDATE `sales`
SET `invoice_number` = 1000 + (
  SELECT count(*)
  FROM `sales` AS `ordered_sales`
  WHERE `ordered_sales`.`created_at` < `sales`.`created_at`
     OR (`ordered_sales`.`created_at` = `sales`.`created_at` AND `ordered_sales`.`rowid` <= `sales`.`rowid`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_invoice_number_unique` ON `sales` (`invoice_number`);
--> statement-breakpoint
CREATE TABLE `app_settings` (
  `id` integer PRIMARY KEY NOT NULL CHECK (`id` = 1),
  `next_invoice_number` integer NOT NULL DEFAULT 1001,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `app_settings` (`id`, `next_invoice_number`, `updated_at`)
VALUES (1, COALESCE((SELECT MAX(`invoice_number`) + 1 FROM `sales`), 1001), unixepoch('subsec') * 1000);
