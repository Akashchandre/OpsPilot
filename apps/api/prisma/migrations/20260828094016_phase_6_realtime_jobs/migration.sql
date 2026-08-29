-- Seed the accepted Phase 6 owner-only job permissions.
INSERT INTO `permissions` (`id`, `code`, `description`, `updated_at`) VALUES
    ('00000000-0000-4000-8000-000000001019', 'jobs:read', 'View safe background-job, attempt, queue-health, and worker-heartbeat evidence.', CURRENT_TIMESTAMP(3)),
    ('00000000-0000-4000-8000-000000001020', 'jobs:replay', 'Replay an eligible dead-letter job through the reviewed idempotent workflow.', CURRENT_TIMESTAMP(3));

INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES
    ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001019'),
    ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001020');

-- CreateTable
CREATE TABLE `worker_heartbeats` (
    `id` CHAR(36) NOT NULL,
    `state` ENUM('STARTING', 'ACTIVE', 'STOPPING', 'STOPPED') NOT NULL DEFAULT 'STARTING',
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `stopped_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `worker_heartbeats_state_last_seen_at_idx`(`state`, `last_seen_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `worker_heartbeats`
    ADD CONSTRAINT `worker_heartbeats_time_check` CHECK (`last_seen_at` >= `started_at`),
    ADD CONSTRAINT `worker_heartbeats_state_check` CHECK (
        (`state` = 'STOPPED' AND `stopped_at` IS NOT NULL AND `stopped_at` >= `started_at`)
        OR (`state` IN ('STARTING', 'ACTIVE', 'STOPPING') AND `stopped_at` IS NULL)
    );

-- CreateTable
CREATE TABLE `background_jobs` (
    `id` CHAR(36) NOT NULL,
    `type` ENUM('NOTIFICATION_ORDER_PLACED', 'NOTIFICATION_ORDER_STATUS_CHANGED', 'NOTIFICATION_PAYMENT_STATUS_CHANGED', 'NOTIFICATION_REFUND_STATUS_CHANGED', 'NOTIFICATION_SUPPORT_TICKET_CREATED', 'NOTIFICATION_SUPPORT_PUBLIC_REPLY_CREATED', 'NOTIFICATION_SUPPORT_ASSIGNMENT_CHANGED', 'NOTIFICATION_SUPPORT_STATUS_CHANGED', 'NOTIFICATION_INVENTORY_LOW', 'ORDER_RESERVATION_EXPIRY_SWEEP', 'AUDIT_CHAIN_VERIFY') NOT NULL,
    `schema_version` INTEGER NOT NULL DEFAULT 1,
    `status` ENUM('PENDING', 'PROCESSING', 'SUCCEEDED', 'DEAD_LETTER') NOT NULL DEFAULT 'PENDING',
    `dedupe_key` VARCHAR(191) NOT NULL,
    `payload` JSON NOT NULL,
    `available_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `attempt_count` INTEGER NOT NULL DEFAULT 0,
    `max_attempts` INTEGER NOT NULL DEFAULT 8,
    `lease_token` CHAR(64) NULL,
    `lease_owner_id` CHAR(36) NULL,
    `lease_expires_at` DATETIME(3) NULL,
    `last_error_code` VARCHAR(64) NULL,
    `source_request_id` VARCHAR(64) NULL,
    `source_actor_user_id` CHAR(36) NULL,
    `replayed_from_job_id` CHAR(36) NULL,
    `replay_idempotency_key` CHAR(36) NULL,
    `completed_at` DATETIME(3) NULL,
    `dead_lettered_at` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `background_jobs_dedupe_key_key`(`dedupe_key`),
    INDEX `background_jobs_status_available_at_created_at_idx`(`status`, `available_at`, `created_at`),
    INDEX `background_jobs_status_lease_expires_at_idx`(`status`, `lease_expires_at`),
    INDEX `background_jobs_type_status_created_at_idx`(`type`, `status`, `created_at`),
    INDEX `background_jobs_lease_owner_id_status_idx`(`lease_owner_id`, `status`),
    INDEX `background_jobs_source_actor_user_id_created_at_idx`(`source_actor_user_id`, `created_at`),
    INDEX `background_jobs_replayed_from_job_id_idx`(`replayed_from_job_id`),
    UNIQUE INDEX `background_jobs_replay_idempotency_key`(`replayed_from_job_id`, `replay_idempotency_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `background_jobs`
    ADD CONSTRAINT `background_jobs_schema_version_check` CHECK (`schema_version` > 0),
    ADD CONSTRAINT `background_jobs_attempts_check` CHECK (
        `attempt_count` >= 0 AND `max_attempts` BETWEEN 1 AND 20 AND `attempt_count` <= `max_attempts`
    ),
    ADD CONSTRAINT `background_jobs_version_check` CHECK (`version` >= 0),
    ADD CONSTRAINT `background_jobs_dedupe_key_check` CHECK (CHAR_LENGTH(TRIM(`dedupe_key`)) BETWEEN 1 AND 191),
    ADD CONSTRAINT `background_jobs_payload_size_check` CHECK (OCTET_LENGTH(CAST(`payload` AS CHAR)) BETWEEN 2 AND 8192),
    ADD CONSTRAINT `background_jobs_error_code_check` CHECK (
        `last_error_code` IS NULL OR `last_error_code` REGEXP '^[A-Z][A-Z0-9_]{0,63}$'
    ),
    ADD CONSTRAINT `background_jobs_replay_pair_check` CHECK (
        (`replayed_from_job_id` IS NULL AND `replay_idempotency_key` IS NULL)
        OR (`replayed_from_job_id` IS NOT NULL AND `replay_idempotency_key` IS NOT NULL)
    ),
    ADD CONSTRAINT `background_jobs_state_check` CHECK (
        (`status` = 'PENDING' AND `lease_token` IS NULL AND `lease_expires_at` IS NULL AND `completed_at` IS NULL AND `dead_lettered_at` IS NULL)
        OR (`status` = 'PROCESSING' AND `lease_token` IS NOT NULL AND `lease_expires_at` IS NOT NULL AND `completed_at` IS NULL AND `dead_lettered_at` IS NULL)
        OR (`status` = 'SUCCEEDED' AND `lease_token` IS NULL AND `lease_expires_at` IS NULL AND `completed_at` IS NOT NULL AND `dead_lettered_at` IS NULL)
        OR (`status` = 'DEAD_LETTER' AND `lease_token` IS NULL AND `lease_expires_at` IS NULL AND `completed_at` IS NULL AND `dead_lettered_at` IS NOT NULL)
    );

-- CreateTable
CREATE TABLE `background_job_attempts` (
    `id` CHAR(36) NOT NULL,
    `job_id` CHAR(36) NOT NULL,
    `attempt_number` INTEGER NOT NULL,
    `worker_instance_id` CHAR(36) NOT NULL,
    `lease_token_hash` CHAR(64) NOT NULL,
    `outcome` ENUM('SUCCEEDED', 'RETRY_SCHEDULED', 'TERMINAL_FAILURE', 'DEAD_LETTER', 'LEASE_EXPIRED') NULL,
    `error_code` VARCHAR(64) NULL,
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finished_at` DATETIME(3) NULL,
    `duration_ms` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `background_job_attempts_worker_instance_id_started_at_idx`(`worker_instance_id`, `started_at`),
    INDEX `background_job_attempts_outcome_finished_at_idx`(`outcome`, `finished_at`),
    UNIQUE INDEX `background_job_attempts_job_id_attempt_number_key`(`job_id`, `attempt_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `background_job_attempts`
    ADD CONSTRAINT `background_job_attempts_number_check` CHECK (`attempt_number` > 0),
    ADD CONSTRAINT `background_job_attempts_lease_hash_check` CHECK (`lease_token_hash` REGEXP '^[0-9a-f]{64}$'),
    ADD CONSTRAINT `background_job_attempts_error_code_check` CHECK (
        `error_code` IS NULL OR `error_code` REGEXP '^[A-Z][A-Z0-9_]{0,63}$'
    ),
    ADD CONSTRAINT `background_job_attempts_outcome_check` CHECK (
        (`outcome` IS NULL AND `finished_at` IS NULL AND `duration_ms` IS NULL)
        OR (`outcome` IS NOT NULL AND `finished_at` IS NOT NULL AND `duration_ms` >= 0 AND `finished_at` >= `started_at`)
    );

-- CreateTable
CREATE TABLE `notifications` (
    `id` CHAR(36) NOT NULL,
    `sequence` BIGINT NOT NULL AUTO_INCREMENT,
    `recipient_id` CHAR(36) NOT NULL,
    `type` ENUM('ORDER_PLACED', 'ORDER_STATUS_CHANGED', 'PAYMENT_STATUS_CHANGED', 'REFUND_STATUS_CHANGED', 'SUPPORT_TICKET_CREATED', 'SUPPORT_PUBLIC_REPLY_CREATED', 'SUPPORT_ASSIGNMENT_CHANGED', 'SUPPORT_STATUS_CHANGED', 'INVENTORY_LOW') NOT NULL,
    `dedupe_key` VARCHAR(191) NOT NULL,
    `metadata` JSON NULL,
    `order_id` CHAR(36) NULL,
    `payment_id` CHAR(36) NULL,
    `refund_id` CHAR(36) NULL,
    `support_ticket_id` CHAR(36) NULL,
    `product_id` CHAR(36) NULL,
    `read_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `notifications_sequence_key`(`sequence`),
    UNIQUE INDEX `notifications_dedupe_key_key`(`dedupe_key`),
    INDEX `notifications_recipient_id_sequence_idx`(`recipient_id`, `sequence`),
    INDEX `notifications_recipient_id_read_at_sequence_idx`(`recipient_id`, `read_at`, `sequence`),
    INDEX `notifications_order_id_idx`(`order_id`),
    INDEX `notifications_payment_id_idx`(`payment_id`),
    INDEX `notifications_refund_id_idx`(`refund_id`),
    INDEX `notifications_support_ticket_id_idx`(`support_ticket_id`),
    INDEX `notifications_product_id_idx`(`product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `notifications`
    ADD CONSTRAINT `notifications_dedupe_key_check` CHECK (CHAR_LENGTH(TRIM(`dedupe_key`)) BETWEEN 1 AND 191),
    ADD CONSTRAINT `notifications_metadata_size_check` CHECK (
        `metadata` IS NULL OR OCTET_LENGTH(CAST(`metadata` AS CHAR)) <= 2048
    ),
    ADD CONSTRAINT `notifications_read_time_check` CHECK (`read_at` IS NULL OR `read_at` >= `created_at`),
    ADD CONSTRAINT `notifications_resource_check` CHECK (
        (`type` IN ('ORDER_PLACED', 'ORDER_STATUS_CHANGED') AND `order_id` IS NOT NULL AND `payment_id` IS NULL AND `refund_id` IS NULL AND `support_ticket_id` IS NULL AND `product_id` IS NULL)
        OR (`type` = 'PAYMENT_STATUS_CHANGED' AND `order_id` IS NOT NULL AND `payment_id` IS NOT NULL AND `refund_id` IS NULL AND `support_ticket_id` IS NULL AND `product_id` IS NULL)
        OR (`type` = 'REFUND_STATUS_CHANGED' AND `order_id` IS NOT NULL AND `payment_id` IS NOT NULL AND `refund_id` IS NOT NULL AND `support_ticket_id` IS NULL AND `product_id` IS NULL)
        OR (`type` IN ('SUPPORT_TICKET_CREATED', 'SUPPORT_PUBLIC_REPLY_CREATED', 'SUPPORT_ASSIGNMENT_CHANGED', 'SUPPORT_STATUS_CHANGED') AND `order_id` IS NULL AND `payment_id` IS NULL AND `refund_id` IS NULL AND `support_ticket_id` IS NOT NULL AND `product_id` IS NULL)
        OR (`type` = 'INVENTORY_LOW' AND `order_id` IS NULL AND `payment_id` IS NULL AND `refund_id` IS NULL AND `support_ticket_id` IS NULL AND `product_id` IS NOT NULL)
    );

-- AddForeignKey
ALTER TABLE `background_jobs` ADD CONSTRAINT `background_jobs_lease_owner_id_fkey` FOREIGN KEY (`lease_owner_id`) REFERENCES `worker_heartbeats`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `background_jobs` ADD CONSTRAINT `background_jobs_source_actor_user_id_fkey` FOREIGN KEY (`source_actor_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `background_jobs` ADD CONSTRAINT `background_jobs_replayed_from_job_id_fkey` FOREIGN KEY (`replayed_from_job_id`) REFERENCES `background_jobs`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `background_job_attempts` ADD CONSTRAINT `background_job_attempts_job_id_fkey` FOREIGN KEY (`job_id`) REFERENCES `background_jobs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `background_job_attempts` ADD CONSTRAINT `background_job_attempts_worker_instance_id_fkey` FOREIGN KEY (`worker_instance_id`) REFERENCES `worker_heartbeats`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_recipient_id_fkey` FOREIGN KEY (`recipient_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_payment_id_fkey` FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_refund_id_fkey` FOREIGN KEY (`refund_id`) REFERENCES `refunds`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_support_ticket_id_fkey` FOREIGN KEY (`support_ticket_id`) REFERENCES `support_tickets`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
