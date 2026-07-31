CREATE TABLE IF NOT EXISTS users (
  telegram_id TEXT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  is_blocked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_username
ON users(username COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT NOT NULL,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  balance_after INTEGER NOT NULL,
  description TEXT,
  reference_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_created
ON transactions(telegram_id, created_at DESC);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_update_id TEXT NOT NULL UNIQUE,
  telegram_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  quality TEXT,
  resolution TEXT,
  duration TEXT,
  price INTEGER NOT NULL CHECK (price > 0),
  prompt TEXT,
  status TEXT NOT NULL DEFAULT 'checking_balance',
  result_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_orders_user_created
ON orders(telegram_id, created_at DESC);
