-- Migration 0021: users table for standalone authentication
CREATE TABLE IF NOT EXISTS `users` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `username` text NOT NULL,
  `display_name` text NOT NULL,
  `password_hash` text NOT NULL,
  `role` text DEFAULT 'staff' NOT NULL,
  `active` integer DEFAULT 1 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS `users_username_unique` ON `users` (`username`);
