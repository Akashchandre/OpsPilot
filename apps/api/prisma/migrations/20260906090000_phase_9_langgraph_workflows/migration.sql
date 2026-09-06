-- Seed the accepted Phase 9 workflow permissions with least-privilege role mappings.
INSERT INTO `permissions` (`id`, `code`, `description`, `updated_at`) VALUES
    ('00000000-0000-4000-8000-000000001027', 'ai:workflows:business:use', 'Start and read authorized owner business-brief workflows.', CURRENT_TIMESTAMP(3)),
    ('00000000-0000-4000-8000-000000001028', 'ai:workflows:support:use', 'Start and read authorized support reply-draft workflows.', CURRENT_TIMESTAMP(3)),
    ('00000000-0000-4000-8000-000000001029', 'ai:workflows:support:approve', 'Approve, edit-and-approve, or reject an eligible support reply draft.', CURRENT_TIMESTAMP(3));

INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES
    ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001027'),
    ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001028'),
    ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001029'),
    ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000001028'),
    ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000001029');

ALTER TABLE `background_jobs`
    MODIFY `type` ENUM(
        'NOTIFICATION_ORDER_PLACED',
        'NOTIFICATION_ORDER_STATUS_CHANGED',
        'NOTIFICATION_PAYMENT_STATUS_CHANGED',
        'NOTIFICATION_REFUND_STATUS_CHANGED',
        'NOTIFICATION_SUPPORT_TICKET_CREATED',
        'NOTIFICATION_SUPPORT_PUBLIC_REPLY_CREATED',
        'NOTIFICATION_SUPPORT_ASSIGNMENT_CHANGED',
        'NOTIFICATION_SUPPORT_STATUS_CHANGED',
        'NOTIFICATION_INVENTORY_LOW',
        'ORDER_RESERVATION_EXPIRY_SWEEP',
        'AUDIT_CHAIN_VERIFY',
        'DOCUMENT_VERSION_INGEST',
        'DOCUMENT_VERSION_DELETE',
        'DOCUMENT_VERSION_REINDEX',
        'AI_WORKFLOW_ADVANCE',
        'AI_WORKFLOW_RETENTION_SWEEP'
    ) NOT NULL;

ALTER TABLE `ai_provider_consents`
    MODIFY `assistant` ENUM('CUSTOMER', 'OWNER', 'SUPPORT') NOT NULL;

ALTER TABLE `ai_usage_events`
    DROP CHECK `ai_usage_scope_check`,
    MODIFY `assistant` ENUM('CUSTOMER', 'OWNER', 'SUPPORT') NOT NULL,
    MODIFY `intent` ENUM(
        'CUSTOMER_HELP',
        'OWNER_OVERVIEW_EXPLAIN',
        'CUSTOMER_DOCUMENT_QA',
        'OWNER_DOCUMENT_QA',
        'OWNER_BUSINESS_BRIEF',
        'SUPPORT_REPLY_DRAFT'
    ) NOT NULL,
    MODIFY `outcome` ENUM(
        'ANSWER',
        'READY_FOR_REVIEW',
        'INSUFFICIENT_EVIDENCE',
        'REFUSAL',
        'ESCALATE'
    ) NULL,
    ADD COLUMN `workflow_run_id` CHAR(36) NULL AFTER `user_id`,
    ADD COLUMN `model_step_id` CHAR(36) NULL AFTER `workflow_run_id`,
    ADD UNIQUE INDEX `ai_usage_workflow_model_step_key` (`workflow_run_id`, `model_step_id`),
    ADD CONSTRAINT `ai_usage_scope_check` CHECK (
        (`assistant` = 'CUSTOMER' AND `intent` IN ('CUSTOMER_HELP', 'CUSTOMER_DOCUMENT_QA'))
        OR (`assistant` = 'OWNER' AND `intent` IN ('OWNER_OVERVIEW_EXPLAIN', 'OWNER_DOCUMENT_QA', 'OWNER_BUSINESS_BRIEF'))
        OR (`assistant` = 'SUPPORT' AND `intent` = 'SUPPORT_REPLY_DRAFT')
    ),
    ADD CONSTRAINT `ai_usage_workflow_step_check` CHECK (
        (`workflow_run_id` IS NULL AND `model_step_id` IS NULL)
        OR (`workflow_run_id` IS NOT NULL AND `model_step_id` IS NOT NULL)
    );

CREATE TABLE `ai_workflow_runs` (
    `id` CHAR(36) NOT NULL,
    `workflow_code` ENUM('OWNER_BUSINESS_BRIEF_V1', 'SUPPORT_REPLY_DRAFT_V1') NOT NULL,
    `graph_version` VARCHAR(32) NOT NULL,
    `thread_id` CHAR(36) NOT NULL,
    `initiated_by_id` CHAR(36) NOT NULL,
    `submission_key` CHAR(36) NOT NULL,
    `request_hash` CHAR(64) NOT NULL,
    `ticket_id` CHAR(36) NULL,
    `range_from` DATETIME(3) NULL,
    `range_to` DATETIME(3) NULL,
    `focus` ENUM('GENERAL', 'REVENUE', 'INVENTORY', 'SUPPORT') NULL,
    `status` ENUM('QUEUED', 'RUNNING', 'AWAITING_APPROVAL', 'APPROVED', 'SUCCEEDED', 'FAILED', 'UNKNOWN', 'CANCELLED', 'EXPIRED') NOT NULL DEFAULT 'QUEUED',
    `context_digest` CHAR(64) NULL,
    `safe_error_code` VARCHAR(64) NULL,
    `version` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `approval_expires_at` DATETIME(3) NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `checkpoint_deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ai_workflow_runs_thread_id_key` (`thread_id`),
    UNIQUE INDEX `ai_workflow_runs_initiator_submission_key` (`initiated_by_id`, `submission_key`),
    INDEX `ai_workflow_runs_initiator_created_idx` (`initiated_by_id`, `created_at`),
    INDEX `ai_workflow_runs_status_expiry_idx` (`status`, `expires_at`),
    INDEX `ai_workflow_runs_code_status_created_idx` (`workflow_code`, `status`, `created_at`),
    INDEX `ai_workflow_runs_ticket_created_idx` (`ticket_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ai_workflow_runs`
    ADD CONSTRAINT `ai_workflow_runs_graph_version_check` CHECK (`graph_version` REGEXP '^v[1-9][0-9]{0,8}$'),
    ADD CONSTRAINT `ai_workflow_runs_hash_check` CHECK (
        `request_hash` REGEXP '^[0-9a-f]{64}$'
        AND (`context_digest` IS NULL OR `context_digest` REGEXP '^[0-9a-f]{64}$')
        AND (`safe_error_code` IS NULL OR `safe_error_code` REGEXP '^[A-Z][A-Z0-9_]{0,63}$')
    ),
    ADD CONSTRAINT `ai_workflow_runs_scope_check` CHECK (
        (`workflow_code` = 'OWNER_BUSINESS_BRIEF_V1' AND `ticket_id` IS NULL
            AND `range_from` IS NOT NULL AND `range_to` IS NOT NULL AND `range_from` < `range_to`
            AND `focus` IS NOT NULL)
        OR (`workflow_code` = 'SUPPORT_REPLY_DRAFT_V1' AND `ticket_id` IS NOT NULL
            AND `range_from` IS NULL AND `range_to` IS NULL AND `focus` IS NULL)
    ),
    ADD CONSTRAINT `ai_workflow_runs_time_check` CHECK (
        `expires_at` > `created_at`
        AND (`started_at` IS NULL OR `started_at` >= `created_at`)
        AND (`completed_at` IS NULL OR `completed_at` >= `created_at`)
        AND (`approval_expires_at` IS NULL OR `approval_expires_at` >= `created_at`)
        AND (`checkpoint_deleted_at` IS NULL OR `checkpoint_deleted_at` >= `created_at`)
    );

CREATE TABLE `ai_workflow_artifacts` (
    `id` CHAR(36) NOT NULL,
    `workflow_run_id` CHAR(36) NOT NULL,
    `kind` ENUM('TOOL_OUTPUT', 'MODEL_DRAFT', 'REVIEWER_EDIT', 'FINAL_RESULT') NOT NULL,
    `key_id` VARCHAR(64) NOT NULL,
    `initialization_vector` BINARY(12) NOT NULL,
    `authentication_tag` BINARY(16) NOT NULL,
    `ciphertext` LONGBLOB NULL,
    `plaintext_sha256` CHAR(64) NOT NULL,
    `byte_length` INTEGER UNSIGNED NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `cleared_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `ai_workflow_artifacts_run_kind_created_idx` (`workflow_run_id`, `kind`, `created_at`),
    INDEX `ai_workflow_artifacts_clear_expiry_idx` (`cleared_at`, `expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ai_workflow_artifacts`
    ADD CONSTRAINT `ai_workflow_artifacts_integrity_check` CHECK (
        `key_id` REGEXP '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
        AND `plaintext_sha256` REGEXP '^[0-9a-f]{64}$'
        AND `byte_length` BETWEEN 1 AND 65536
        AND ((`cleared_at` IS NULL AND `ciphertext` IS NOT NULL)
            OR (`cleared_at` IS NOT NULL AND `ciphertext` IS NULL))
    ),
    ADD CONSTRAINT `ai_workflow_artifacts_time_check` CHECK (
        `expires_at` > `created_at` AND (`cleared_at` IS NULL OR `cleared_at` >= `created_at`)
    );

CREATE TABLE `ai_workflow_tool_calls` (
    `id` CHAR(36) NOT NULL,
    `workflow_run_id` CHAR(36) NOT NULL,
    `tool_code` ENUM('REPORTS_OVERVIEW_V1', 'INVENTORY_ATTENTION_V1', 'SUPPORT_QUEUE_SUMMARY_V1', 'SUPPORT_TICKET_PUBLIC_CONTEXT_V1', 'DOCUMENTS_CUSTOMER_POLICY_CONTEXT_V1', 'SUPPORT_PUBLIC_REPLY_V1') NOT NULL,
    `ordinal` INTEGER UNSIGNED NOT NULL,
    `status` ENUM('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'UNKNOWN') NOT NULL DEFAULT 'PENDING',
    `input_digest` CHAR(64) NOT NULL,
    `output_artifact_id` CHAR(36) NULL,
    `safe_error_code` VARCHAR(64) NULL,
    `started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ai_workflow_tool_calls_output_artifact_id_key` (`output_artifact_id`),
    UNIQUE INDEX `ai_workflow_tool_calls_run_ordinal_key` (`workflow_run_id`, `ordinal`),
    UNIQUE INDEX `ai_workflow_tool_calls_run_tool_key` (`workflow_run_id`, `tool_code`),
    INDEX `ai_workflow_tool_calls_status_updated_idx` (`status`, `updated_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ai_workflow_tool_calls`
    ADD CONSTRAINT `ai_workflow_tool_calls_integrity_check` CHECK (
        `ordinal` BETWEEN 1 AND 5
        AND `input_digest` REGEXP '^[0-9a-f]{64}$'
        AND (`safe_error_code` IS NULL OR `safe_error_code` REGEXP '^[A-Z][A-Z0-9_]{0,63}$')
    );

CREATE TABLE `ai_workflow_approvals` (
    `id` CHAR(36) NOT NULL,
    `workflow_run_id` CHAR(36) NOT NULL,
    `draft_artifact_id` CHAR(36) NOT NULL,
    `decision_artifact_id` CHAR(36) NULL,
    `draft_digest` CHAR(64) NOT NULL,
    `context_digest` CHAR(64) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
    `reviewer_id` CHAR(36) NULL,
    `decision_key` CHAR(36) NULL,
    `request_hash` CHAR(64) NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `decided_at` DATETIME(3) NULL,
    `version` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ai_workflow_approvals_workflow_run_id_key` (`workflow_run_id`),
    UNIQUE INDEX `ai_workflow_approvals_draft_artifact_id_key` (`draft_artifact_id`),
    UNIQUE INDEX `ai_workflow_approvals_decision_artifact_id_key` (`decision_artifact_id`),
    UNIQUE INDEX `ai_workflow_approvals_run_decision_key` (`workflow_run_id`, `decision_key`),
    INDEX `ai_workflow_approvals_status_expiry_idx` (`status`, `expires_at`),
    INDEX `ai_workflow_approvals_reviewer_decided_idx` (`reviewer_id`, `decided_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ai_workflow_approvals`
    ADD CONSTRAINT `ai_workflow_approvals_digest_check` CHECK (
        `draft_digest` REGEXP '^[0-9a-f]{64}$'
        AND `context_digest` REGEXP '^[0-9a-f]{64}$'
        AND (`request_hash` IS NULL OR `request_hash` REGEXP '^[0-9a-f]{64}$')
    ),
    ADD CONSTRAINT `ai_workflow_approvals_state_check` CHECK (
        (`status` = 'PENDING' AND `reviewer_id` IS NULL AND `decision_key` IS NULL
            AND `request_hash` IS NULL AND `decided_at` IS NULL)
        OR (`status` <> 'PENDING' AND `decision_key` IS NOT NULL
            AND `request_hash` IS NOT NULL AND `decided_at` IS NOT NULL)
    ),
    ADD CONSTRAINT `ai_workflow_approvals_time_check` CHECK (
        `expires_at` > `created_at` AND (`decided_at` IS NULL OR `decided_at` >= `created_at`)
    );

ALTER TABLE `support_ticket_messages`
    ADD COLUMN `origin` ENUM('HUMAN', 'AI_ASSISTED') NOT NULL DEFAULT 'HUMAN' AFTER `visibility`,
    ADD COLUMN `workflow_run_id` CHAR(36) NULL AFTER `origin`,
    ADD UNIQUE INDEX `support_ticket_messages_workflow_run_id_key` (`workflow_run_id`),
    ADD CONSTRAINT `support_ticket_messages_ai_origin_check` CHECK (
        (`origin` = 'HUMAN' AND `workflow_run_id` IS NULL)
        OR (`origin` = 'AI_ASSISTED' AND `workflow_run_id` IS NOT NULL
            AND `visibility` = 'CUSTOMER_VISIBLE')
    );

ALTER TABLE `ai_workflow_runs`
    ADD CONSTRAINT `ai_workflow_runs_initiated_by_id_fkey`
    FOREIGN KEY (`initiated_by_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT `ai_workflow_runs_ticket_id_fkey`
    FOREIGN KEY (`ticket_id`) REFERENCES `support_tickets` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `ai_workflow_artifacts`
    ADD CONSTRAINT `ai_workflow_artifacts_workflow_run_id_fkey`
    FOREIGN KEY (`workflow_run_id`) REFERENCES `ai_workflow_runs` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `ai_workflow_tool_calls`
    ADD CONSTRAINT `ai_workflow_tool_calls_workflow_run_id_fkey`
    FOREIGN KEY (`workflow_run_id`) REFERENCES `ai_workflow_runs` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT `ai_workflow_tool_calls_output_artifact_id_fkey`
    FOREIGN KEY (`output_artifact_id`) REFERENCES `ai_workflow_artifacts` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `ai_workflow_approvals`
    ADD CONSTRAINT `ai_workflow_approvals_workflow_run_id_fkey`
    FOREIGN KEY (`workflow_run_id`) REFERENCES `ai_workflow_runs` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT `ai_workflow_approvals_draft_artifact_id_fkey`
    FOREIGN KEY (`draft_artifact_id`) REFERENCES `ai_workflow_artifacts` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT `ai_workflow_approvals_decision_artifact_id_fkey`
    FOREIGN KEY (`decision_artifact_id`) REFERENCES `ai_workflow_artifacts` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT `ai_workflow_approvals_reviewer_id_fkey`
    FOREIGN KEY (`reviewer_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `ai_usage_events`
    ADD CONSTRAINT `ai_usage_events_workflow_run_id_fkey`
    FOREIGN KEY (`workflow_run_id`) REFERENCES `ai_workflow_runs` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `support_ticket_messages`
    ADD CONSTRAINT `support_ticket_messages_workflow_run_id_fkey`
    FOREIGN KEY (`workflow_run_id`) REFERENCES `ai_workflow_runs` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
