CREATE TABLE first_order_promotion_settings (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  discount_percent TINYINT UNSIGNED NOT NULL DEFAULT 30,
  message_template VARCHAR(600) NOT NULL,
  updated_by CHAR(36) NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT chk_first_order_discount_percent CHECK (discount_percent <= 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO first_order_promotion_settings (id, discount_percent, message_template)
VALUES (1, 30, 'Скидка {discount}% на первый заказ по Грахово и району. На межгород акция не действует.');
