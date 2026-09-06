-- Seed the accepted Phase 8 document permissions with intentionally separate role mappings.
INSERT INTO `permissions` (`id`, `code`, `description`, `updated_at`) VALUES
    ('00000000-0000-4000-8000-000000001024', 'documents:read', 'List protected company document metadata and read authorized originals.', CURRENT_TIMESTAMP(3)),
    ('00000000-0000-4000-8000-000000001025', 'documents:manage', 'Create, version, archive, restore, and reindex protected company documents.', CURRENT_TIMESTAMP(3)),
    ('00000000-0000-4000-8000-000000001026', 'documents:delete', 'Request fail-closed lifecycle deletion of protected company documents.', CURRENT_TIMESTAMP(3));

INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES
    ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001024'),
    ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001025'),
    ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001026'),
    ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000001024'),
    ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000001025');

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
        'DOCUMENT_VERSION_REINDEX'
    ) NOT NULL;

ALTER TABLE `ai_usage_events`
    DROP CHECK `ai_usage_scope_check`,
    MODIFY `intent` ENUM(
        'CUSTOMER_HELP',
        'OWNER_OVERVIEW_EXPLAIN',
        'CUSTOMER_DOCUMENT_QA',
        'OWNER_DOCUMENT_QA'
    ) NOT NULL,
    MODIFY `outcome` ENUM(
        'ANSWER',
        'INSUFFICIENT_EVIDENCE',
        'REFUSAL',
        'ESCALATE'
    ) NULL,
    ADD CONSTRAINT `ai_usage_scope_check` CHECK (
        (`assistant` = 'CUSTOMER' AND `intent` IN ('CUSTOMER_HELP', 'CUSTOMER_DOCUMENT_QA'))
        OR (`assistant` = 'OWNER' AND `intent` IN ('OWNER_OVERVIEW_EXPLAIN', 'OWNER_DOCUMENT_QA'))
    );

CREATE TABLE `company_documents` (
    `id` CHAR(36) NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `status` ENUM('ACTIVE', 'ARCHIVED', 'DELETING', 'DELETED') NOT NULL DEFAULT 'ACTIVE',
    `active_version_id` CHAR(36) NULL,
    `version` INT UNSIGNED NOT NULL DEFAULT 0,
    `created_by_id` CHAR(36) NOT NULL,
    `updated_by_id` CHAR(36) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `company_documents_active_version_key`(`id`, `active_version_id`),
    INDEX `company_documents_status_updated_at_idx`(`status`, `updated_at`),
    INDEX `company_documents_created_by_id_created_at_idx`(`created_by_id`, `created_at`),
    INDEX `company_documents_updated_by_id_updated_at_idx`(`updated_by_id`, `updated_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `company_documents`
    ADD CONSTRAINT `company_documents_title_check` CHECK (
        CHAR_LENGTH(TRIM(`title`)) BETWEEN 1 AND 160
        AND `title` NOT REGEXP '[[:cntrl:]]'
    ),
    ADD CONSTRAINT `company_documents_lifecycle_check` CHECK (
        (`status` = 'DELETED' AND `active_version_id` IS NULL AND `deleted_at` IS NOT NULL)
        OR (`status` = 'DELETING' AND `active_version_id` IS NULL AND `deleted_at` IS NULL)
        OR (`status` IN ('ACTIVE', 'ARCHIVED') AND `deleted_at` IS NULL)
    );

CREATE TABLE `company_document_versions` (
    `id` CHAR(36) NOT NULL,
    `document_id` CHAR(36) NOT NULL,
    `version_number` INT UNSIGNED NOT NULL,
    `status` ENUM(
        'AWAITING_UPLOAD',
        'QUEUED',
        'PROCESSING',
        'STAGED',
        'READY',
        'FAILED',
        'SUPERSEDED',
        'DELETING',
        'DELETED'
    ) NOT NULL DEFAULT 'AWAITING_UPLOAD',
    `original_filename` VARCHAR(255) NOT NULL,
    `media_type` VARCHAR(64) NOT NULL,
    `language` VARCHAR(8) NOT NULL,
    `normalized_byte_length` INT UNSIGNED NULL,
    `content_sha256` CHAR(64) NULL,
    `storage_object_key` VARCHAR(128) NULL,
    `storage_key_id` VARCHAR(64) NULL,
    `embedding_model` VARCHAR(128) NULL,
    `embedding_model_revision` VARCHAR(128) NULL,
    `embedding_dimension` INT UNSIGNED NULL,
    `vector_collection` VARCHAR(64) NULL,
    `index_version` INT UNSIGNED NOT NULL DEFAULT 1,
    `chunk_count` INT UNSIGNED NULL,
    `failure_code` VARCHAR(64) NULL,
    `uploaded_by_id` CHAR(36) NOT NULL,
    `uploaded_at` DATETIME(3) NULL,
    `processing_started_at` DATETIME(3) NULL,
    `ready_at` DATETIME(3) NULL,
    `superseded_at` DATETIME(3) NULL,
    `deleted_at` DATETIME(3) NULL,
    `version` INT UNSIGNED NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `company_document_versions_number_key`(`document_id`, `version_number`),
    UNIQUE INDEX `company_document_versions_document_id_id_key`(`document_id`, `id`),
    UNIQUE INDEX `company_document_versions_storage_object_key_key`(`storage_object_key`),
    INDEX `company_document_versions_status_updated_at_idx`(`status`, `updated_at`),
    INDEX `company_document_versions_uploaded_by_id_created_at_idx`(`uploaded_by_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `company_document_versions`
    ADD CONSTRAINT `company_document_versions_format_check` CHECK (
        `language` = 'en'
        AND (
            (`media_type` = 'text/plain' AND LOWER(`original_filename`) LIKE '%.txt')
            OR (`media_type` = 'text/markdown' AND LOWER(`original_filename`) LIKE '%.md')
        )
    ),
    ADD CONSTRAINT `company_document_versions_content_check` CHECK (
        (`normalized_byte_length` IS NULL AND `content_sha256` IS NULL
            AND `storage_object_key` IS NULL AND `storage_key_id` IS NULL
            AND `uploaded_at` IS NULL)
        OR (`normalized_byte_length` BETWEEN 1 AND 262144
            AND `content_sha256` REGEXP '^[0-9a-f]{64}$'
            AND `storage_object_key` REGEXP '^[0-9a-f-]{36}\\.opdoc$'
            AND `storage_key_id` REGEXP '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
            AND `uploaded_at` IS NOT NULL)
    ),
    ADD CONSTRAINT `company_document_versions_index_check` CHECK (
        (`embedding_model` IS NULL AND `embedding_model_revision` IS NULL
            AND `embedding_dimension` IS NULL AND `vector_collection` IS NULL
            AND `chunk_count` IS NULL)
        OR (`embedding_model` IS NOT NULL AND `embedding_model_revision` IS NOT NULL
            AND `embedding_dimension` = 384
            AND `vector_collection` REGEXP '^[a-z][a-z0-9_]{0,63}$'
            AND `chunk_count` IS NOT NULL)
    ),
    ADD CONSTRAINT `company_document_versions_state_check` CHECK (
        (`status` = 'AWAITING_UPLOAD' AND `storage_object_key` IS NULL
            AND `embedding_model` IS NULL AND `failure_code` IS NULL)
        OR (`status` = 'QUEUED' AND `storage_object_key` IS NOT NULL
            AND `embedding_model` IS NULL AND `failure_code` IS NULL)
        OR (`status` = 'PROCESSING' AND `storage_object_key` IS NOT NULL
            AND `processing_started_at` IS NOT NULL AND `failure_code` IS NULL)
        OR (`status` = 'STAGED' AND `storage_object_key` IS NOT NULL
            AND `embedding_model` IS NOT NULL AND `ready_at` IS NULL
            AND `failure_code` IS NULL)
        OR (`status` = 'READY' AND `storage_object_key` IS NOT NULL
            AND `embedding_model` IS NOT NULL AND `ready_at` IS NOT NULL
            AND `failure_code` IS NULL)
        OR (`status` = 'FAILED' AND `failure_code` REGEXP '^[A-Z][A-Z0-9_]{0,63}$')
        OR (`status` = 'SUPERSEDED' AND `storage_object_key` IS NOT NULL
            AND `embedding_model` IS NOT NULL AND `ready_at` IS NOT NULL
            AND `superseded_at` IS NOT NULL AND `failure_code` IS NULL)
        OR (`status` = 'DELETING' AND `deleted_at` IS NULL)
        OR (`status` = 'DELETED' AND `storage_object_key` IS NULL
            AND `embedding_model` IS NULL AND `deleted_at` IS NOT NULL)
    ),
    ADD CONSTRAINT `company_document_versions_time_check` CHECK (
        (`uploaded_at` IS NULL OR `uploaded_at` >= `created_at`)
        AND (`processing_started_at` IS NULL OR `processing_started_at` >= `created_at`)
        AND (`ready_at` IS NULL OR `ready_at` >= `created_at`)
        AND (`superseded_at` IS NULL OR `superseded_at` >= `created_at`)
        AND (`deleted_at` IS NULL OR `deleted_at` >= `created_at`)
    );

CREATE TABLE `company_document_version_audiences` (
    `document_version_id` CHAR(36) NOT NULL,
    `audience` ENUM('CUSTOMER', 'OWNER') NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `doc_version_audience_lookup_idx`(`audience`, `document_version_id`),
    PRIMARY KEY (`document_version_id`, `audience`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `company_document_chunks` (
    `id` CHAR(36) NOT NULL,
    `document_version_id` CHAR(36) NOT NULL,
    `point_id` CHAR(36) NOT NULL,
    `ordinal` INT UNSIGNED NOT NULL,
    `byte_start` INT UNSIGNED NOT NULL,
    `byte_end` INT UNSIGNED NOT NULL,
    `content_sha256` CHAR(64) NOT NULL,
    `index_version` INT UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `company_document_chunks_point_id_key`(`point_id`),
    UNIQUE INDEX `company_document_chunks_ordinal_key`(`document_version_id`, `ordinal`),
    UNIQUE INDEX `company_document_chunks_version_id_id_key`(`document_version_id`, `id`),
    INDEX `doc_chunk_byte_range_idx`(`document_version_id`, `byte_start`, `byte_end`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `company_document_chunks`
    ADD CONSTRAINT `company_document_chunks_range_check` CHECK (
        `byte_end` > `byte_start`
        AND `content_sha256` REGEXP '^[0-9a-f]{64}$'
        AND `point_id` REGEXP '^[0-9a-f-]{36}$'
        AND `index_version` >= 1
    );

CREATE TABLE `ai_document_citations` (
    `id` CHAR(36) NOT NULL,
    `usage_event_id` CHAR(36) NOT NULL,
    `document_version_id` CHAR(36) NOT NULL,
    `chunk_id` CHAR(36) NOT NULL,
    `source_label` VARCHAR(16) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ai_document_citations_source_label_key`(`usage_event_id`, `source_label`),
    UNIQUE INDEX `ai_document_citations_chunk_key`(`usage_event_id`, `chunk_id`),
    INDEX `ai_document_citations_document_version_id_chunk_id_idx`(`document_version_id`, `chunk_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ai_document_citations`
    ADD CONSTRAINT `ai_document_citations_source_label_check` CHECK (
        `source_label` REGEXP '^S[1-5]$'
    );

ALTER TABLE `company_documents`
    ADD CONSTRAINT `company_documents_created_by_id_fkey`
    FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT `company_documents_updated_by_id_fkey`
    FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `company_document_versions`
    ADD CONSTRAINT `company_document_versions_document_id_fkey`
    FOREIGN KEY (`document_id`) REFERENCES `company_documents`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT `company_document_versions_uploaded_by_id_fkey`
    FOREIGN KEY (`uploaded_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `company_documents`
    ADD CONSTRAINT `company_documents_active_version_fkey`
    FOREIGN KEY (`id`, `active_version_id`)
    REFERENCES `company_document_versions`(`document_id`, `id`)
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `company_document_version_audiences`
    ADD CONSTRAINT `company_document_version_audiences_version_id_fkey`
    FOREIGN KEY (`document_version_id`) REFERENCES `company_document_versions`(`id`)
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `company_document_chunks`
    ADD CONSTRAINT `company_document_chunks_document_version_id_fkey`
    FOREIGN KEY (`document_version_id`) REFERENCES `company_document_versions`(`id`)
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `ai_document_citations`
    ADD CONSTRAINT `ai_document_citations_usage_event_id_fkey`
    FOREIGN KEY (`usage_event_id`) REFERENCES `ai_usage_events`(`id`)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT `ai_document_citations_version_chunk_fkey`
    FOREIGN KEY (`document_version_id`, `chunk_id`)
    REFERENCES `company_document_chunks`(`document_version_id`, `id`)
    ON DELETE RESTRICT ON UPDATE RESTRICT;
