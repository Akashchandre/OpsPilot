CREATE TABLE `document_mutation_receipts` (
  `id` CHAR(36) NOT NULL,
  `actor_user_id` CHAR(36) NOT NULL,
  `idempotency_key` CHAR(36) NOT NULL,
  `operation` VARCHAR(64) NOT NULL,
  `request_hash` CHAR(64) NOT NULL,
  `document_id` CHAR(36) NULL,
  `document_version_id` CHAR(36) NULL,
  `job_id` CHAR(36) NULL,
  `target_index_version` INT UNSIGNED NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  CONSTRAINT `document_mutation_receipts_pkey` PRIMARY KEY (`id`),
  CONSTRAINT `document_mutation_operation_check` CHECK (
    `operation` IN (
      'CREATE_DOCUMENT',
      'CREATE_VERSION',
      'UPLOAD_CONTENT',
      'UPDATE_STATUS',
      'REQUEST_REINDEX',
      'REQUEST_DELETE'
    )
  ),
  CONSTRAINT `document_mutation_request_hash_check` CHECK (
    `request_hash` REGEXP '^[0-9a-f]{64}$'
  ),
  UNIQUE INDEX `document_mutation_actor_idempotency_key` (`actor_user_id`, `idempotency_key`),
  INDEX `document_mutation_document_created_idx` (`document_id`, `created_at`),
  INDEX `document_mutation_version_created_idx` (`document_version_id`, `created_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
