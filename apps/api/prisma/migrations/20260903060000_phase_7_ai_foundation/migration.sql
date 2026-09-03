-- Seed the accepted Phase 7 assistant permissions with intentionally separate role mappings.
INSERT INTO `permissions` (`id`, `code`, `description`, `updated_at`) VALUES
    ('00000000-0000-4000-8000-000000001021', 'ai:customer:use', 'Use the stateless customer help assistant with reviewed public product and navigation facts.', CURRENT_TIMESTAMP(3)),
    ('00000000-0000-4000-8000-000000001022', 'ai:owner:use', 'Use the stateless owner assistant with the approved aggregate overview projection.', CURRENT_TIMESTAMP(3)),
    ('00000000-0000-4000-8000-000000001023', 'ai:usage:read', 'View aggregate AI request, token, confirmed-cost, and reserved-exposure evidence.', CURRENT_TIMESTAMP(3));

INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES
    ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001022'),
    ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001023'),
    ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000001021');

-- CreateTable
CREATE TABLE `ai_provider_consents` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `provider` ENUM('XAI') NOT NULL,
    `assistant` ENUM('CUSTOMER', 'OWNER') NOT NULL,
    `notice_version` VARCHAR(64) NOT NULL,
    `consented_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revoked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ai_consents_user_provider_assistant_notice`(`user_id`, `provider`, `assistant`, `notice_version`),
    INDEX `ai_consents_active_lookup_idx`(`user_id`, `provider`, `assistant`, `revoked_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ai_provider_consents`
    ADD CONSTRAINT `ai_consents_notice_version_check` CHECK (
        `notice_version` REGEXP '^[a-z][a-z0-9-]{0,63}$'
    ),
    ADD CONSTRAINT `ai_consents_revocation_time_check` CHECK (
        `revoked_at` IS NULL OR `revoked_at` >= `consented_at`
    );

-- CreateTable
CREATE TABLE `ai_usage_events` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `submission_key` CHAR(36) NOT NULL,
    `provider` ENUM('XAI') NOT NULL,
    `assistant` ENUM('CUSTOMER', 'OWNER') NOT NULL,
    `intent` ENUM('CUSTOMER_HELP', 'OWNER_OVERVIEW_EXPLAIN') NOT NULL,
    `status` ENUM('PENDING', 'SUCCEEDED', 'FAILED', 'UNKNOWN') NOT NULL DEFAULT 'PENDING',
    `prompt_version` VARCHAR(64) NOT NULL,
    `model` VARCHAR(64) NOT NULL,
    `provider_request_id` VARCHAR(128) NULL,
    `safe_error_code` VARCHAR(64) NULL,
    `outcome` ENUM('ANSWER', 'REFUSAL', 'ESCALATE') NULL,
    `reserved_cost_ticks` BIGINT UNSIGNED NOT NULL,
    `exact_cost_ticks` BIGINT UNSIGNED NULL,
    `input_tokens` INTEGER UNSIGNED NULL,
    `output_tokens` INTEGER UNSIGNED NULL,
    `total_tokens` INTEGER UNSIGNED NULL,
    `duration_ms` INTEGER UNSIGNED NULL,
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ai_usage_user_submission_key`(`user_id`, `submission_key`),
    INDEX `ai_usage_user_assistant_created_idx`(`user_id`, `assistant`, `created_at`),
    INDEX `ai_usage_status_created_idx`(`status`, `created_at`),
    INDEX `ai_usage_assistant_created_idx`(`assistant`, `created_at`),
    INDEX `ai_usage_provider_created_idx`(`provider`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ai_usage_events`
    ADD CONSTRAINT `ai_usage_scope_check` CHECK (
        (`assistant` = 'CUSTOMER' AND `intent` = 'CUSTOMER_HELP')
        OR (`assistant` = 'OWNER' AND `intent` = 'OWNER_OVERVIEW_EXPLAIN')
    ),
    ADD CONSTRAINT `ai_usage_prompt_version_check` CHECK (
        `prompt_version` REGEXP '^[a-z][a-z0-9-]{0,63}$'
    ),
    ADD CONSTRAINT `ai_usage_model_check` CHECK (
        `model` REGEXP '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
    ),
    ADD CONSTRAINT `ai_usage_provider_request_id_check` CHECK (
        `provider_request_id` IS NULL
        OR `provider_request_id` REGEXP '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    ),
    ADD CONSTRAINT `ai_usage_error_code_check` CHECK (
        `safe_error_code` IS NULL
        OR `safe_error_code` REGEXP '^[A-Z][A-Z0-9_]{0,63}$'
    ),
    ADD CONSTRAINT `ai_usage_token_total_check` CHECK (
        `total_tokens` IS NULL
        OR (`input_tokens` IS NOT NULL AND `output_tokens` IS NOT NULL
            AND `total_tokens` = `input_tokens` + `output_tokens`)
    ),
    ADD CONSTRAINT `ai_usage_completion_time_check` CHECK (
        `completed_at` IS NULL OR `completed_at` >= `started_at`
    ),
    ADD CONSTRAINT `ai_usage_state_check` CHECK (
        (`status` = 'PENDING'
            AND `provider_request_id` IS NULL AND `safe_error_code` IS NULL
            AND `outcome` IS NULL AND `exact_cost_ticks` IS NULL
            AND `input_tokens` IS NULL AND `output_tokens` IS NULL
            AND `total_tokens` IS NULL AND `duration_ms` IS NULL
            AND `completed_at` IS NULL)
        OR (`status` = 'SUCCEEDED'
            AND `provider_request_id` IS NOT NULL AND `safe_error_code` IS NULL
            AND `outcome` IS NOT NULL AND `exact_cost_ticks` IS NOT NULL
            AND `input_tokens` IS NOT NULL AND `output_tokens` IS NOT NULL
            AND `total_tokens` IS NOT NULL AND `duration_ms` IS NOT NULL
            AND `completed_at` IS NOT NULL)
        OR (`status` IN ('FAILED', 'UNKNOWN')
            AND `safe_error_code` IS NOT NULL AND `outcome` IS NULL
            AND `exact_cost_ticks` IS NULL AND `input_tokens` IS NULL
            AND `output_tokens` IS NULL AND `total_tokens` IS NULL
            AND `duration_ms` IS NOT NULL AND `completed_at` IS NOT NULL)
    );

-- AddForeignKey
ALTER TABLE `ai_provider_consents`
    ADD CONSTRAINT `ai_provider_consents_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ai_usage_events`
    ADD CONSTRAINT `ai_usage_events_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
