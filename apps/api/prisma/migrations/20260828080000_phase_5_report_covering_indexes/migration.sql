-- The Phase 5 overview aggregates captured attempts and processed refunds by
-- status, INR currency, and a half-open UTC range. Including the summed amount
-- keeps these target-sized reads on covering indexes.
CREATE INDEX `payment_attempts_status_currency_created_at_amount_idx`
    ON `payment_attempts`(`status`, `currency`, `created_at`, `amount`);

CREATE INDEX `refunds_status_currency_updated_at_amount_idx`
    ON `refunds`(`status`, `currency`, `updated_at`, `amount`);
