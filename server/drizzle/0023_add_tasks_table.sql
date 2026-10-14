CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  assigned_to TEXT NOT NULL,
  due_date TEXT,
  repeat_pattern TEXT NOT NULL DEFAULT 'none',
  is_completed INTEGER NOT NULL DEFAULT 0,
  completed_at INTEGER,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  task_type TEXT NOT NULL DEFAULT 'task',
  created_by TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tasks_assigned_index ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS tasks_due_index ON tasks(due_date);
CREATE INDEX IF NOT EXISTS tasks_customer_index ON tasks(customer_id);
