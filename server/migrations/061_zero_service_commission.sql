-- Zero commission for all drivers, including past accruals, as approved by the operator.
START TRANSACTION;

UPDATE tariff_settings SET service_commission_bps = 0 WHERE service_commission_bps <> 0;
UPDATE drivers SET commission_bps = 0 WHERE commission_bps IS NOT NULL AND commission_bps <> 0;
UPDATE orders SET commission_bps = 0, commission_minor = 0
WHERE commission_bps <> 0 OR commission_minor <> 0;

COMMIT;
