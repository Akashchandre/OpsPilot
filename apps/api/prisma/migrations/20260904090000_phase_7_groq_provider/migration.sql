-- Preserve xAI consent as historical evidence, but do not reuse it for a
-- different processor. Every Groq user must accept the new versioned notice.
UPDATE `ai_provider_consents`
SET
    `revoked_at` = CURRENT_TIMESTAMP(3),
    `updated_at` = CURRENT_TIMESTAMP(3)
WHERE `provider` = 'XAI' AND `revoked_at` IS NULL;

ALTER TABLE `ai_provider_consents`
    MODIFY `provider` ENUM('XAI', 'GROQ') NOT NULL;

ALTER TABLE `ai_usage_events`
    MODIFY `provider` ENUM('XAI', 'GROQ') NOT NULL,
    DROP CHECK `ai_usage_model_check`,
    ADD CONSTRAINT `ai_usage_model_check` CHECK (
        `model` REGEXP '^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$'
    );
