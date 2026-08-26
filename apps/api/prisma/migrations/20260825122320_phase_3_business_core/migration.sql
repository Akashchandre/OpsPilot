-- CreateTable
CREATE TABLE `categories` (
    `id` CHAR(36) NOT NULL,
    `slug` VARCHAR(100) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `description` VARCHAR(500) NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `version` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `categories_slug_key`(`slug`),
    INDEX `categories_status_name_idx`(`status`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `categories`
    ADD CONSTRAINT `categories_version_check` CHECK (`version` >= 0);

-- CreateTable
CREATE TABLE `products` (
    `id` CHAR(36) NOT NULL,
    `sku` VARCHAR(64) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `description` TEXT NOT NULL,
    `price` DECIMAL(12, 2) NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `status` ENUM('DRAFT', 'ACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `version` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `products_sku_key`(`sku`),
    INDEX `products_status_created_at_idx`(`status`, `created_at`),
    INDEX `products_status_name_idx`(`status`, `name`),
    INDEX `products_status_price_idx`(`status`, `price`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `products`
    ADD CONSTRAINT `products_price_check` CHECK (`price` >= 0),
    ADD CONSTRAINT `products_version_check` CHECK (`version` >= 0),
    ADD CONSTRAINT `products_currency_check` CHECK (`currency` REGEXP '^[A-Z]{3}$');

-- CreateTable
CREATE TABLE `product_categories` (
    `product_id` CHAR(36) NOT NULL,
    `category_id` CHAR(36) NOT NULL,
    `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `product_categories_category_id_product_id_idx`(`category_id`, `product_id`),
    PRIMARY KEY (`product_id`, `category_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory_balances` (
    `product_id` CHAR(36) NOT NULL,
    `on_hand` INTEGER NOT NULL DEFAULT 0,
    `low_stock_threshold` INTEGER NOT NULL DEFAULT 0,
    `version` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `inventory_balances_on_hand_idx`(`on_hand`),
    PRIMARY KEY (`product_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `inventory_balances`
    ADD CONSTRAINT `inventory_balances_on_hand_check` CHECK (`on_hand` >= 0),
    ADD CONSTRAINT `inventory_balances_low_stock_check` CHECK (`low_stock_threshold` >= 0),
    ADD CONSTRAINT `inventory_balances_version_check` CHECK (`version` >= 0);

-- Seed the accepted Phase 3 permissions and assign them to OWNER and ADMIN.
INSERT INTO `permissions` (`id`, `code`, `description`, `updated_at`) VALUES
    ('00000000-0000-4000-8000-000000001006', 'products:manage', 'Create and maintain catalog products and lifecycle state.', CURRENT_TIMESTAMP(3)),
    ('00000000-0000-4000-8000-000000001007', 'categories:manage', 'Create and maintain catalog categories and lifecycle state.', CURRENT_TIMESTAMP(3)),
    ('00000000-0000-4000-8000-000000001008', 'inventory:read', 'View exact stock balances and adjustment history.', CURRENT_TIMESTAMP(3)),
    ('00000000-0000-4000-8000-000000001009', 'inventory:adjust', 'Apply controlled stock adjustments with an immutable ledger entry.', CURRENT_TIMESTAMP(3));

INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES
    ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001006'),
    ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001007'),
    ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001008'),
    ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001009'),
    ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000001006'),
    ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000001007'),
    ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000001008'),
    ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000001009');

-- CreateTable
CREATE TABLE `inventory_adjustments` (
    `id` CHAR(36) NOT NULL,
    `product_id` CHAR(36) NOT NULL,
    `delta` INTEGER NOT NULL,
    `quantity_before` INTEGER NOT NULL,
    `quantity_after` INTEGER NOT NULL,
    `reason` ENUM('INITIAL', 'RESTOCK', 'CORRECTION', 'DAMAGE') NOT NULL,
    `note` VARCHAR(500) NULL,
    `actor_user_id` CHAR(36) NULL,
    `request_id` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `inventory_adjustments_product_id_created_at_idx`(`product_id`, `created_at`),
    INDEX `inventory_adjustments_actor_user_id_created_at_idx`(`actor_user_id`, `created_at`),
    INDEX `inventory_adjustments_request_id_idx`(`request_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `inventory_adjustments`
    ADD CONSTRAINT `inventory_adjustments_delta_check` CHECK (`delta` <> 0),
    ADD CONSTRAINT `inventory_adjustments_before_check` CHECK (`quantity_before` >= 0),
    ADD CONSTRAINT `inventory_adjustments_after_check` CHECK (`quantity_after` >= 0),
    ADD CONSTRAINT `inventory_adjustments_math_check` CHECK (`quantity_after` = `quantity_before` + `delta`);

-- AddForeignKey
ALTER TABLE `product_categories` ADD CONSTRAINT `product_categories_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_categories` ADD CONSTRAINT `product_categories_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_balances` ADD CONSTRAINT `inventory_balances_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_adjustments` ADD CONSTRAINT `inventory_adjustments_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_adjustments` ADD CONSTRAINT `inventory_adjustments_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
