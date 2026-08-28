CREATE INDEX `users_created_at_idx` ON `users`(`created_at`);
CREATE INDEX `payment_attempts_status_created_at_idx` ON `payment_attempts`(`status`, `created_at`);
CREATE INDEX `refunds_status_updated_at_idx` ON `refunds`(`status`, `updated_at`);
CREATE INDEX `support_tickets_created_at_status_priority_idx` ON `support_tickets`(`created_at`, `status`, `priority`);
