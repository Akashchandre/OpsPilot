-- AlterTable
ALTER TABLE `inventory_adjustments` MODIFY `reason` ENUM('INITIAL', 'RESTOCK', 'CORRECTION', 'DAMAGE', 'ORDER_RESERVATION', 'ORDER_RELEASE') NOT NULL;

-- Seed the accepted Phase 4 permissions and assign them to OWNER and ADMIN.
INSERT INTO `permissions` (`id`, `code`, `description`, `updated_at`) VALUES
    ('00000000-0000-4000-8000-000000001010', 'orders:read', 'View business orders, fulfillment history, and shipping details.', CURRENT_TIMESTAMP(3)),
    ('00000000-0000-4000-8000-000000001011', 'orders:manage', 'Apply approved order fulfillment and cancellation transitions.', CURRENT_TIMESTAMP(3)),
    ('00000000-0000-4000-8000-000000001012', 'payments:read', 'View safe payment, attempt, refund, and reconciliation state.', CURRENT_TIMESTAMP(3)),
    ('00000000-0000-4000-8000-000000001013', 'payments:refund', 'Initiate idempotent full refunds for eligible captured payments.', CURRENT_TIMESTAMP(3)),
    ('00000000-0000-4000-8000-000000001014', 'payments:reconcile', 'Reconcile an identified local payment with the payment provider.', CURRENT_TIMESTAMP(3));

INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES
    ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001010'),
    ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001011'),
    ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001012'),
    ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001013'),
    ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001014'),
    ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000001010'),
    ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000001011'),
    ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000001012'),
    ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000001013'),
    ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000001014');

-- CreateTable
CREATE TABLE `carts` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `carts_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `carts`
    ADD CONSTRAINT `carts_version_check` CHECK (`version` >= 0);

-- CreateTable
CREATE TABLE `cart_items` (
    `cart_id` CHAR(36) NOT NULL,
    `product_id` CHAR(36) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `observed_unit_price` DECIMAL(12, 2) NOT NULL,
    `observed_currency` CHAR(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `cart_items_product_id_idx`(`product_id`),
    PRIMARY KEY (`cart_id`, `product_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `cart_items`
    ADD CONSTRAINT `cart_items_quantity_check` CHECK (`quantity` BETWEEN 1 AND 99),
    ADD CONSTRAINT `cart_items_price_check` CHECK (`observed_unit_price` >= 0),
    ADD CONSTRAINT `cart_items_currency_check` CHECK (`observed_currency` REGEXP '^[A-Z]{3}$');

-- CreateTable
CREATE TABLE `orders` (
    `id` CHAR(36) NOT NULL,
    `order_number` VARCHAR(24) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `status` ENUM('PENDING_PAYMENT', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'EXPIRED', 'PAYMENT_REVIEW') NOT NULL DEFAULT 'PENDING_PAYMENT',
    `subtotal` DECIMAL(14, 2) NOT NULL,
    `tax_total` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `discount_total` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `shipping_total` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(14, 2) NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `recipient_name` VARCHAR(100) NOT NULL,
    `phone` VARCHAR(16) NOT NULL,
    `address_line_1` VARCHAR(200) NOT NULL,
    `address_line_2` VARCHAR(200) NULL,
    `city` VARCHAR(100) NOT NULL,
    `state` VARCHAR(100) NOT NULL,
    `postal_code` CHAR(6) NOT NULL,
    `country_code` CHAR(2) NOT NULL DEFAULT 'IN',
    `carrier_name` VARCHAR(100) NULL,
    `tracking_number` VARCHAR(100) NULL,
    `reservation_expires_at` DATETIME(3) NOT NULL,
    `confirmed_at` DATETIME(3) NULL,
    `processing_at` DATETIME(3) NULL,
    `shipped_at` DATETIME(3) NULL,
    `delivered_at` DATETIME(3) NULL,
    `cancelled_at` DATETIME(3) NULL,
    `expired_at` DATETIME(3) NULL,
    `idempotency_key` CHAR(36) NOT NULL,
    `request_hash` CHAR(64) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `orders_order_number_key`(`order_number`),
    INDEX `orders_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `orders_status_created_at_idx`(`status`, `created_at`),
    INDEX `orders_status_reservation_expires_at_idx`(`status`, `reservation_expires_at`),
    UNIQUE INDEX `orders_user_id_idempotency_key_key`(`user_id`, `idempotency_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `orders`
    ADD CONSTRAINT `orders_subtotal_check` CHECK (`subtotal` >= 0),
    ADD CONSTRAINT `orders_tax_total_check` CHECK (`tax_total` >= 0),
    ADD CONSTRAINT `orders_discount_total_check` CHECK (`discount_total` >= 0),
    ADD CONSTRAINT `orders_shipping_total_check` CHECK (`shipping_total` >= 0),
    ADD CONSTRAINT `orders_total_check` CHECK (`total` >= 0),
    ADD CONSTRAINT `orders_total_math_check` CHECK (`total` = `subtotal` + `tax_total` + `shipping_total` - `discount_total`),
    ADD CONSTRAINT `orders_discount_bound_check` CHECK (`discount_total` <= `subtotal` + `tax_total` + `shipping_total`),
    ADD CONSTRAINT `orders_currency_check` CHECK (`currency` REGEXP '^[A-Z]{3}$'),
    ADD CONSTRAINT `orders_phone_check` CHECK (`phone` REGEXP '^\\+?[0-9]{8,15}$'),
    ADD CONSTRAINT `orders_postal_code_check` CHECK (`postal_code` REGEXP '^[0-9]{6}$'),
    ADD CONSTRAINT `orders_country_code_check` CHECK (`country_code` = 'IN'),
    ADD CONSTRAINT `orders_request_hash_check` CHECK (`request_hash` REGEXP '^[0-9a-f]{64}$'),
    ADD CONSTRAINT `orders_version_check` CHECK (`version` >= 0);

-- CreateTable
CREATE TABLE `order_items` (
    `id` CHAR(36) NOT NULL,
    `order_id` CHAR(36) NOT NULL,
    `product_id` CHAR(36) NOT NULL,
    `product_sku` VARCHAR(64) NOT NULL,
    `product_name` VARCHAR(160) NOT NULL,
    `unit_price` DECIMAL(12, 2) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `line_total` DECIMAL(14, 2) NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `order_items_order_id_idx`(`order_id`),
    INDEX `order_items_product_id_idx`(`product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `order_items`
    ADD CONSTRAINT `order_items_quantity_check` CHECK (`quantity` BETWEEN 1 AND 99),
    ADD CONSTRAINT `order_items_unit_price_check` CHECK (`unit_price` >= 0),
    ADD CONSTRAINT `order_items_line_total_check` CHECK (`line_total` = `unit_price` * `quantity`),
    ADD CONSTRAINT `order_items_currency_check` CHECK (`currency` REGEXP '^[A-Z]{3}$');

-- CreateTable
CREATE TABLE `inventory_reservations` (
    `id` CHAR(36) NOT NULL,
    `order_id` CHAR(36) NOT NULL,
    `order_item_id` CHAR(36) NOT NULL,
    `product_id` CHAR(36) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `status` ENUM('ACTIVE', 'CONSUMED', 'RELEASED') NOT NULL DEFAULT 'ACTIVE',
    `expires_at` DATETIME(3) NOT NULL,
    `consumed_at` DATETIME(3) NULL,
    `released_at` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `inventory_reservations_order_item_id_key`(`order_item_id`),
    INDEX `inventory_reservations_order_id_status_idx`(`order_id`, `status`),
    INDEX `inventory_reservations_status_expires_at_idx`(`status`, `expires_at`),
    INDEX `inventory_reservations_product_id_status_idx`(`product_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `inventory_reservations`
    ADD CONSTRAINT `inventory_reservations_quantity_check` CHECK (`quantity` BETWEEN 1 AND 99),
    ADD CONSTRAINT `inventory_reservations_version_check` CHECK (`version` >= 0),
    ADD CONSTRAINT `inventory_reservations_state_time_check` CHECK (
        (`status` = 'ACTIVE' AND `consumed_at` IS NULL AND `released_at` IS NULL)
        OR (`status` = 'CONSUMED' AND `consumed_at` IS NOT NULL AND `released_at` IS NULL)
        OR (`status` = 'RELEASED' AND `consumed_at` IS NULL AND `released_at` IS NOT NULL)
    );

-- CreateTable
CREATE TABLE `order_status_events` (
    `id` CHAR(36) NOT NULL,
    `order_id` CHAR(36) NOT NULL,
    `from_status` ENUM('PENDING_PAYMENT', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'EXPIRED', 'PAYMENT_REVIEW') NULL,
    `to_status` ENUM('PENDING_PAYMENT', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'EXPIRED', 'PAYMENT_REVIEW') NOT NULL,
    `source` ENUM('CUSTOMER', 'OPERATOR', 'PROVIDER', 'SYSTEM', 'RECONCILIATION') NOT NULL,
    `reason_code` VARCHAR(64) NOT NULL,
    `actor_user_id` CHAR(36) NULL,
    `request_id` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `order_status_events_order_id_created_at_idx`(`order_id`, `created_at`),
    INDEX `order_status_events_actor_user_id_created_at_idx`(`actor_user_id`, `created_at`),
    INDEX `order_status_events_request_id_idx`(`request_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payments` (
    `id` CHAR(36) NOT NULL,
    `order_id` CHAR(36) NOT NULL,
    `provider` ENUM('RAZORPAY') NOT NULL DEFAULT 'RAZORPAY',
    `status` ENUM('CREATING', 'OPEN', 'CAPTURED', 'REFUND_PENDING', 'REFUNDED', 'REVIEW_REQUIRED') NOT NULL DEFAULT 'CREATING',
    `amount` DECIMAL(14, 2) NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `provider_order_id` VARCHAR(64) NULL,
    `provider_receipt` VARCHAR(40) NOT NULL,
    `provider_order_status` VARCHAR(32) NULL,
    `last_provider_event_at` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `payments_order_id_key`(`order_id`),
    UNIQUE INDEX `payments_provider_order_id_key`(`provider_order_id`),
    UNIQUE INDEX `payments_provider_receipt_key`(`provider_receipt`),
    INDEX `payments_status_created_at_idx`(`status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `payments`
    ADD CONSTRAINT `payments_amount_check` CHECK (`amount` > 0),
    ADD CONSTRAINT `payments_currency_check` CHECK (`currency` REGEXP '^[A-Z]{3}$'),
    ADD CONSTRAINT `payments_receipt_check` CHECK (`provider_receipt` REGEXP '^op_[0-9a-f-]{36}$'),
    ADD CONSTRAINT `payments_version_check` CHECK (`version` >= 0);

-- CreateTable
CREATE TABLE `payment_attempts` (
    `id` CHAR(36) NOT NULL,
    `payment_id` CHAR(36) NOT NULL,
    `provider_payment_id` VARCHAR(64) NOT NULL,
    `status` ENUM('AUTHORIZED', 'CAPTURED', 'FAILED') NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `failure_code` VARCHAR(100) NULL,
    `provider_created_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `payment_attempts_provider_payment_id_key`(`provider_payment_id`),
    INDEX `payment_attempts_payment_id_status_created_at_idx`(`payment_id`, `status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `payment_attempts`
    ADD CONSTRAINT `payment_attempts_amount_check` CHECK (`amount` > 0),
    ADD CONSTRAINT `payment_attempts_currency_check` CHECK (`currency` REGEXP '^[A-Z]{3}$');

-- CreateTable
CREATE TABLE `refunds` (
    `id` CHAR(36) NOT NULL,
    `payment_id` CHAR(36) NOT NULL,
    `payment_attempt_id` CHAR(36) NOT NULL,
    `status` ENUM('PENDING', 'PROCESSED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `amount` DECIMAL(14, 2) NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `idempotency_key` CHAR(36) NOT NULL,
    `request_hash` CHAR(64) NOT NULL,
    `provider_refund_id` VARCHAR(64) NULL,
    `failure_code` VARCHAR(100) NULL,
    `actor_user_id` CHAR(36) NULL,
    `provider_created_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `refunds_provider_refund_id_key`(`provider_refund_id`),
    INDEX `refunds_payment_attempt_id_created_at_idx`(`payment_attempt_id`, `created_at`),
    INDEX `refunds_actor_user_id_created_at_idx`(`actor_user_id`, `created_at`),
    INDEX `refunds_status_created_at_idx`(`status`, `created_at`),
    UNIQUE INDEX `refunds_payment_id_idempotency_key_key`(`payment_id`, `idempotency_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `refunds`
    ADD CONSTRAINT `refunds_amount_check` CHECK (`amount` > 0),
    ADD CONSTRAINT `refunds_currency_check` CHECK (`currency` REGEXP '^[A-Z]{3}$'),
    ADD CONSTRAINT `refunds_request_hash_check` CHECK (`request_hash` REGEXP '^[0-9a-f]{64}$');

-- CreateTable
CREATE TABLE `provider_webhook_events` (
    `id` CHAR(36) NOT NULL,
    `provider` ENUM('RAZORPAY') NOT NULL,
    `provider_event_id` VARCHAR(100) NOT NULL,
    `event_type` VARCHAR(64) NOT NULL,
    `body_digest` CHAR(64) NOT NULL,
    `status` ENUM('PROCESSED', 'IGNORED', 'REVIEW_REQUIRED') NOT NULL,
    `payment_id` CHAR(36) NULL,
    `safe_code` VARCHAR(64) NULL,
    `provider_created_at` DATETIME(3) NULL,
    `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `processed_at` DATETIME(3) NOT NULL,

    INDEX `provider_webhook_events_payment_id_received_at_idx`(`payment_id`, `received_at`),
    INDEX `provider_webhook_events_event_type_received_at_idx`(`event_type`, `received_at`),
    UNIQUE INDEX `provider_webhook_events_provider_provider_event_id_key`(`provider`, `provider_event_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `provider_webhook_events`
    ADD CONSTRAINT `provider_webhook_events_body_digest_check` CHECK (`body_digest` REGEXP '^[0-9a-f]{64}$');

-- AddForeignKey
ALTER TABLE `carts` ADD CONSTRAINT `carts_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cart_items` ADD CONSTRAINT `cart_items_cart_id_fkey` FOREIGN KEY (`cart_id`) REFERENCES `carts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cart_items` ADD CONSTRAINT `cart_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_reservations` ADD CONSTRAINT `inventory_reservations_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_reservations` ADD CONSTRAINT `inventory_reservations_order_item_id_fkey` FOREIGN KEY (`order_item_id`) REFERENCES `order_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_reservations` ADD CONSTRAINT `inventory_reservations_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_status_events` ADD CONSTRAINT `order_status_events_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_status_events` ADD CONSTRAINT `order_status_events_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_attempts` ADD CONSTRAINT `payment_attempts_payment_id_fkey` FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_payment_id_fkey` FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_payment_attempt_id_fkey` FOREIGN KEY (`payment_attempt_id`) REFERENCES `payment_attempts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `provider_webhook_events` ADD CONSTRAINT `provider_webhook_events_payment_id_fkey` FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
