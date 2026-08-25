ALTER TABLE orders
  ADD COLUMN payment_confirmed_at TIMESTAMP(3) NULL AFTER payment_method;
