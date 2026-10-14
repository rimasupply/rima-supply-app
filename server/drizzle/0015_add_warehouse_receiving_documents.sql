CREATE TABLE `receiving_documents` (
  `id` text PRIMARY KEY NOT NULL,
  `file_name` text NOT NULL,
  `file_blob_key` text NOT NULL,
  `mime_type` text DEFAULT 'application/pdf' NOT NULL,
  `supplier` text DEFAULT 'unknown' NOT NULL,
  `supplier_invoice_number` text DEFAULT '' NOT NULL,
  `document_type` text DEFAULT 'unknown' NOT NULL,
  `status` text DEFAULT 'needs_review' NOT NULL,
  `parse_notes` text DEFAULT '' NOT NULL,
  `created_at` integer NOT NULL,
  `applied_at` integer,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `receiving_documents_status_index` ON `receiving_documents` (`status`);
--> statement-breakpoint
CREATE INDEX `receiving_documents_supplier_index` ON `receiving_documents` (`supplier`);
--> statement-breakpoint
CREATE INDEX `receiving_documents_created_index` ON `receiving_documents` (`created_at`);
--> statement-breakpoint
CREATE TABLE `receiving_lines` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `document_id` text NOT NULL REFERENCES `receiving_documents`(`id`) ON DELETE CASCADE,
  `product_id` integer REFERENCES `products`(`id`) ON DELETE SET NULL,
  `raw_part_number` text DEFAULT '' NOT NULL,
  `raw_description` text DEFAULT '' NOT NULL,
  `matched_by` text DEFAULT '' NOT NULL,
  `ordered_qty` integer DEFAULT 0 NOT NULL,
  `shipped_qty` integer DEFAULT 0 NOT NULL,
  `backorder_qty` integer DEFAULT 0 NOT NULL,
  `unit_cost_cents` integer DEFAULT 0 NOT NULL,
  `current_cost_cents` integer DEFAULT 0 NOT NULL,
  `cost_change_status` text DEFAULT 'none' NOT NULL,
  `include_line` integer DEFAULT 1 NOT NULL,
  `notes` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `receiving_lines_document_index` ON `receiving_lines` (`document_id`);
--> statement-breakpoint
CREATE INDEX `receiving_lines_product_index` ON `receiving_lines` (`product_id`);
--> statement-breakpoint
CREATE INDEX `receiving_lines_cost_status_index` ON `receiving_lines` (`cost_change_status`);
