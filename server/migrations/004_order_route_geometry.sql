ALTER TABLE orders
  ADD COLUMN route_geometry JSON NULL AFTER duration_seconds;
