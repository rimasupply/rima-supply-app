-- Auto-backup settings for scheduled database backups.
ALTER TABLE app_settings ADD COLUMN auto_backup_frequency TEXT NOT NULL DEFAULT 'off';
ALTER TABLE app_settings ADD COLUMN last_auto_backup_at INTEGER;
