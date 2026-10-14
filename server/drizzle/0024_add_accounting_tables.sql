CREATE TABLE IF NOT EXISTS bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_name TEXT NOT NULL,
  invoice_number TEXT NOT NULL DEFAULT '',
  bill_date TEXT NOT NULL,
  due_date TEXT,
  amount_cents INTEGER NOT NULL,
  category TEXT NOT NULL DEFAULT 'Other',
  payment_method TEXT NOT NULL DEFAULT 'unpaid',
  paid_at INTEGER,
  notes TEXT NOT NULL DEFAULT '',
  attachment_blob_key TEXT,
  is_test INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS bills_date_index ON bills(bill_date);
CREATE INDEX IF NOT EXISTS bills_category_index ON bills(category);
CREATE INDEX IF NOT EXISTS bills_payment_index ON bills(payment_method);

CREATE TABLE IF NOT EXISTS expense_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS expense_categories_name_unique ON expense_categories(name);

INSERT OR IGNORE INTO expense_categories (name, is_default) VALUES
  ('Rent', 1),
  ('Utilities', 1),
  ('Insurance', 1),
  ('Payroll', 1),
  ('Supplies', 1),
  ('Fuel/Vehicle', 1),
  ('Phone/Internet', 1),
  ('Professional Services', 1),
  ('Bank Fees', 1),
  ('Advertising', 1),
  ('Repairs/Maintenance', 1),
  ('Other', 1);
