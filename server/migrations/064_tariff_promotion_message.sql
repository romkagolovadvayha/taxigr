ALTER TABLE first_order_promotion_settings
  ADD COLUMN tariff_message_template VARCHAR(160) NOT NULL DEFAULT 'Первый заказ −{discount}%' AFTER message_template;
