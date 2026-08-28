-- Seed the accepted Phase 5 permissions.
INSERT INTO `permissions` (`id`, `code`, `description`, `updated_at`) VALUES
    ('00000000-0000-4000-8000-000000001015', 'support:tickets:read', 'View all business support tickets, messages, internal notes, and history.', CURRENT_TIMESTAMP(3)),
    ('00000000-0000-4000-8000-000000001016', 'support:tickets:manage', 'Assign and transition support tickets and add staff replies or internal notes.', CURRENT_TIMESTAMP(3)),
    ('00000000-0000-4000-8000-000000001017', 'reports:read', 'View the approved authoritative operational overview report.', CURRENT_TIMESTAMP(3)),
    ('00000000-0000-4000-8000-000000001018', 'audit:read', 'View and verify restricted application audit evidence.', CURRENT_TIMESTAMP(3));

INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES
    ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001015'),
    ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001016'),
    ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001017'),
    ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001018'),
    ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000001015'),
    ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000001016'),
    ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000001017');

-- CreateTable
CREATE TABLE `support_tickets` (
    `id` CHAR(36) NOT NULL,
    `ticket_number` VARCHAR(24) NOT NULL,
    `requester_id` CHAR(36) NOT NULL,
    `order_id` CHAR(36) NULL,
    `assignee_id` CHAR(36) NULL,
    `category` ENUM('GENERAL', 'ORDER', 'PAYMENT', 'PRODUCT', 'ACCOUNT') NOT NULL,
    `subject` VARCHAR(160) NOT NULL,
    `priority` ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT') NOT NULL DEFAULT 'NORMAL',
    `status` ENUM('OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `version` INTEGER NOT NULL DEFAULT 0,
    `idempotency_key` CHAR(36) NOT NULL,
    `request_hash` CHAR(64) NOT NULL,
    `resolved_at` DATETIME(3) NULL,
    `closed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `support_tickets_ticket_number_key`(`ticket_number`),
    UNIQUE INDEX `support_tickets_requester_id_idempotency_key_key`(`requester_id`, `idempotency_key`),
    INDEX `support_tickets_requester_id_updated_at_idx`(`requester_id`, `updated_at`),
    INDEX `support_tickets_status_priority_updated_at_idx`(`status`, `priority`, `updated_at`),
    INDEX `support_tickets_assignee_id_status_updated_at_idx`(`assignee_id`, `status`, `updated_at`),
    INDEX `support_tickets_order_id_idx`(`order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `support_tickets`
    ADD CONSTRAINT `support_tickets_subject_check` CHECK (CHAR_LENGTH(TRIM(`subject`)) BETWEEN 5 AND 160),
    ADD CONSTRAINT `support_tickets_version_check` CHECK (`version` >= 0),
    ADD CONSTRAINT `support_tickets_request_hash_check` CHECK (`request_hash` REGEXP '^[0-9a-f]{64}$'),
    ADD CONSTRAINT `support_tickets_state_time_check` CHECK (
        (`status` = 'RESOLVED' AND `resolved_at` IS NOT NULL AND `closed_at` IS NULL)
        OR (`status` = 'CLOSED' AND `closed_at` IS NOT NULL)
        OR (`status` IN ('OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER') AND `resolved_at` IS NULL AND `closed_at` IS NULL)
    );

-- CreateTable
CREATE TABLE `support_ticket_messages` (
    `id` CHAR(36) NOT NULL,
    `ticket_id` CHAR(36) NOT NULL,
    `author_user_id` CHAR(36) NOT NULL,
    `visibility` ENUM('CUSTOMER_VISIBLE', 'INTERNAL') NOT NULL DEFAULT 'CUSTOMER_VISIBLE',
    `body` TEXT NOT NULL,
    `idempotency_key` CHAR(36) NOT NULL,
    `request_hash` CHAR(64) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `support_messages_author_idempotency_key`(`ticket_id`, `author_user_id`, `idempotency_key`),
    INDEX `support_ticket_messages_ticket_id_created_at_idx`(`ticket_id`, `created_at`),
    INDEX `support_ticket_messages_author_user_id_created_at_idx`(`author_user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `support_ticket_messages`
    ADD CONSTRAINT `support_ticket_messages_body_check` CHECK (CHAR_LENGTH(TRIM(`body`)) BETWEEN 1 AND 4000),
    ADD CONSTRAINT `support_ticket_messages_request_hash_check` CHECK (`request_hash` REGEXP '^[0-9a-f]{64}$');

-- CreateTable
CREATE TABLE `support_ticket_events` (
    `id` CHAR(36) NOT NULL,
    `ticket_id` CHAR(36) NOT NULL,
    `event_type` ENUM('CREATED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'ASSIGNEE_CHANGED') NOT NULL,
    `source` ENUM('CUSTOMER', 'OPERATOR', 'SYSTEM') NOT NULL,
    `from_status` ENUM('OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED') NULL,
    `to_status` ENUM('OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED') NULL,
    `from_priority` ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT') NULL,
    `to_priority` ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT') NULL,
    `previous_assignee_id` CHAR(36) NULL,
    `next_assignee_id` CHAR(36) NULL,
    `reason_code` VARCHAR(64) NOT NULL,
    `actor_user_id` CHAR(36) NULL,
    `request_id` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `support_ticket_events_ticket_id_created_at_idx`(`ticket_id`, `created_at`),
    INDEX `support_ticket_events_actor_user_id_created_at_idx`(`actor_user_id`, `created_at`),
    INDEX `support_ticket_events_request_id_idx`(`request_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_chain_heads` (
    `id` INTEGER NOT NULL,
    `head_sequence` BIGINT NOT NULL DEFAULT 0,
    `head_hash` CHAR(64) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `audit_chain_heads`
    ADD CONSTRAINT `audit_chain_heads_id_check` CHECK (`id` = 1),
    ADD CONSTRAINT `audit_chain_heads_sequence_check` CHECK (`head_sequence` >= 0),
    ADD CONSTRAINT `audit_chain_heads_hash_check` CHECK (`head_hash` REGEXP '^[0-9a-f]{64}$');

INSERT INTO `audit_chain_heads` (`id`, `head_sequence`, `head_hash`, `updated_at`)
VALUES (1, 0, REPEAT('0', 64), CURRENT_TIMESTAMP(3));

-- CreateTable
CREATE TABLE `audit_events` (
    `id` CHAR(36) NOT NULL,
    `sequence` BIGINT NOT NULL,
    `action` VARCHAR(100) NOT NULL,
    `outcome` ENUM('SUCCESS', 'FAILURE') NOT NULL,
    `actor_kind` ENUM('USER', 'SYSTEM', 'PROVIDER') NOT NULL,
    `actor_user_id` CHAR(36) NULL,
    `target_type` VARCHAR(64) NOT NULL,
    `target_id` VARCHAR(100) NULL,
    `request_id` VARCHAR(64) NULL,
    `metadata` JSON NULL,
    `occurred_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `previous_hash` CHAR(64) NOT NULL,
    `key_id` VARCHAR(64) NOT NULL,
    `event_hash` CHAR(64) NOT NULL,

    UNIQUE INDEX `audit_events_sequence_key`(`sequence`),
    UNIQUE INDEX `audit_events_event_hash_key`(`event_hash`),
    INDEX `audit_events_actor_user_id_occurred_at_idx`(`actor_user_id`, `occurred_at`),
    INDEX `audit_events_target_type_target_id_occurred_at_idx`(`target_type`, `target_id`, `occurred_at`),
    INDEX `audit_events_action_occurred_at_idx`(`action`, `occurred_at`),
    INDEX `audit_events_request_id_idx`(`request_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `audit_events`
    ADD CONSTRAINT `audit_events_sequence_check` CHECK (`sequence` > 0),
    ADD CONSTRAINT `audit_events_previous_hash_check` CHECK (`previous_hash` REGEXP '^[0-9a-f]{64}$'),
    ADD CONSTRAINT `audit_events_event_hash_check` CHECK (`event_hash` REGEXP '^[0-9a-f]{64}$');

-- AddForeignKey
ALTER TABLE `support_tickets` ADD CONSTRAINT `support_tickets_requester_id_fkey` FOREIGN KEY (`requester_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_tickets` ADD CONSTRAINT `support_tickets_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_tickets` ADD CONSTRAINT `support_tickets_assignee_id_fkey` FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_ticket_messages` ADD CONSTRAINT `support_ticket_messages_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `support_tickets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_ticket_messages` ADD CONSTRAINT `support_ticket_messages_author_user_id_fkey` FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_ticket_events` ADD CONSTRAINT `support_ticket_events_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `support_tickets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_ticket_events` ADD CONSTRAINT `support_ticket_events_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_events` ADD CONSTRAINT `audit_events_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
