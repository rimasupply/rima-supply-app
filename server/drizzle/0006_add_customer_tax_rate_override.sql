ALTER TABLE `customers` ADD `tax_rate_override_bps` integer;
--> statement-breakpoint
UPDATE `customers`
SET `tax_rate_override_bps` = `tax_rate_bps`
WHERE `tax_status` = 'taxable' AND `tax_rate_bps` > 0;