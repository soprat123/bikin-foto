ALTER TABLE orders ADD COLUMN xai_request_id TEXT;
ALTER TABLE orders ADD COLUMN xai_model TEXT;
ALTER TABLE orders ADD COLUMN error_message TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_xai_status
ON orders(kind, status, xai_request_id);
