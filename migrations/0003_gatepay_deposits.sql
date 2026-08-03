CREATE TABLE IF NOT EXISTS deposits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference TEXT NOT NULL UNIQUE,
  telegram_id TEXT NOT NULL,
  requested_amount INTEGER NOT NULL CHECK (requested_amount > 0),
  gatepay_order_id TEXT UNIQUE,
  unique_amount INTEGER,
  checkout_url TEXT,
  status TEXT NOT NULL DEFAULT 'creating',
  paid_at INTEGER,
  notification_sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_deposits_user_created
ON deposits(telegram_id, created_at DESC);
