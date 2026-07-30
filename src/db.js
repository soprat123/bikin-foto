let schemaPromise;

const SCHEMA_SQL = `
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
`;

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("Binding database D1 dengan nama DB belum dipasang.");
    this.name = "DatabaseNotConfiguredError";
  }
}

export async function ensureDatabase(env) {
  if (!env.DB) throw new DatabaseNotConfiguredError();

  if (!schemaPromise) {
    schemaPromise = env.DB.exec(SCHEMA_SQL).catch((error) => {
      schemaPromise = undefined;
      throw error;
    });
  }

  await schemaPromise;
  return env.DB;
}

export async function upsertUser(env, from) {
  const db = await ensureDatabase(env);
  const telegramId = String(from.id);

  await db
    .prepare(
      `INSERT INTO users (
        telegram_id, username, first_name, last_name
      ) VALUES (?, ?, ?, ?)
      ON CONFLICT(telegram_id) DO UPDATE SET
        username = excluded.username,
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      telegramId,
      from.username || null,
      from.first_name || null,
      from.last_name || null,
    )
    .run();

  return getUser(env, telegramId);
}

export async function getUser(env, telegramId) {
  const db = await ensureDatabase(env);
  return db
    .prepare(
      `SELECT telegram_id, username, first_name, last_name, balance,
              is_blocked, created_at, updated_at
       FROM users
       WHERE telegram_id = ?`,
    )
    .bind(String(telegramId))
    .first();
}

export async function getUserByTarget(env, target) {
  const db = await ensureDatabase(env);
  const value = String(target || "").trim();
  if (!value) return null;

  if (/^-?\d+$/.test(value)) {
    return getUser(env, value);
  }

  const username = value.replace(/^@/, "");
  return db
    .prepare(
      `SELECT telegram_id, username, first_name, last_name, balance,
              is_blocked, created_at, updated_at
       FROM users
       WHERE username = ? COLLATE NOCASE
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
    .bind(username)
    .first();
}

export async function listUsers(env, limit = 20) {
  const db = await ensureDatabase(env);
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 50));
  const result = await db
    .prepare(
      `SELECT telegram_id, username, first_name, balance, created_at
       FROM users
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .bind(safeLimit)
    .all();

  return result.results || [];
}

export async function getTransactions(env, telegramId, limit = 10) {
  const db = await ensureDatabase(env);
  const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 30));
  const result = await db
    .prepare(
      `SELECT id, type, amount, balance_after, description,
              reference_id, created_at
       FROM transactions
       WHERE telegram_id = ?
       ORDER BY id DESC
       LIMIT ?`,
    )
    .bind(String(telegramId), safeLimit)
    .all();

  return result.results || [];
}

export async function addBalance(
  env,
  telegramId,
  amount,
  description = "Penambahan saldo oleh admin",
) {
  const db = await ensureDatabase(env);
  const id = String(telegramId);
  const value = toPositiveInteger(amount);
  const referenceId = `admin-credit:${crypto.randomUUID()}`;

  const results = await db.batch([
    db
      .prepare(
        `UPDATE users
         SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP
         WHERE telegram_id = ?`,
      )
      .bind(value, id),
    db
      .prepare(
        `INSERT INTO transactions (
          telegram_id, type, amount, balance_after, description, reference_id
        )
        SELECT telegram_id, 'credit', ?, balance, ?, ?
        FROM users
        WHERE telegram_id = ? AND changes() > 0`,
      )
      .bind(value, description, referenceId, id),
  ]);

  const changed = Number(results[0]?.meta?.changes || 0) > 0;
  return changed ? getUser(env, id) : null;
}

export async function subtractBalance(
  env,
  telegramId,
  amount,
  description = "Pengurangan saldo oleh admin",
) {
  const db = await ensureDatabase(env);
  const id = String(telegramId);
  const value = toPositiveInteger(amount);
  const referenceId = `admin-debit:${crypto.randomUUID()}`;

  const results = await db.batch([
    db
      .prepare(
        `UPDATE users
         SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP
         WHERE telegram_id = ? AND balance >= ?`,
      )
      .bind(value, id, value),
    db
      .prepare(
        `INSERT INTO transactions (
          telegram_id, type, amount, balance_after, description, reference_id
        )
        SELECT telegram_id, 'debit', ?, balance, ?, ?
        FROM users
        WHERE telegram_id = ? AND changes() > 0`,
      )
      .bind(value, description, referenceId, id),
  ]);

  const changed = Number(results[0]?.meta?.changes || 0) > 0;
  return {
    success: changed,
    user: await getUser(env, id),
  };
}

export async function createOrderAndCharge(env, orderInput) {
  const db = await ensureDatabase(env);
  const updateId = String(orderInput.telegramUpdateId);
  const telegramId = String(orderInput.telegramId);
  const price = toPositiveInteger(orderInput.price);
  const referenceId = `order:${updateId}`;
  const description = `${orderInput.kind} ${orderInput.quality || ""} ${
    orderInput.resolution || ""
  }${orderInput.duration ? ` ${orderInput.duration}` : ""}`.trim();

  const results = await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO orders (
          telegram_update_id, telegram_id, kind, quality, resolution,
          duration, price, prompt, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'checking_balance')`,
      )
      .bind(
        updateId,
        telegramId,
        orderInput.kind,
        orderInput.quality || null,
        orderInput.resolution || null,
        orderInput.duration || null,
        price,
        orderInput.prompt || null,
      ),
    db
      .prepare(
        `UPDATE users
         SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP
         WHERE telegram_id = ?
           AND balance >= ?
           AND changes() > 0`,
      )
      .bind(price, telegramId, price),
    db
      .prepare(
        `INSERT OR IGNORE INTO transactions (
          telegram_id, type, amount, balance_after, description, reference_id
        )
        SELECT telegram_id, 'debit', ?, balance, ?, ?
        FROM users
        WHERE telegram_id = ? AND changes() > 0`,
      )
      .bind(price, description, referenceId, telegramId),
    db
      .prepare(
        `UPDATE orders
         SET status = CASE
           WHEN EXISTS (
             SELECT 1 FROM transactions WHERE reference_id = ?
           ) THEN 'pending'
           WHEN status = 'checking_balance' THEN 'rejected_insufficient'
           ELSE status
         END,
         updated_at = CURRENT_TIMESTAMP
         WHERE telegram_update_id = ?`,
      )
      .bind(referenceId, updateId),
  ]);

  const duplicate = Number(results[0]?.meta?.changes || 0) === 0;
  const order = await db
    .prepare(
      `SELECT o.id, o.telegram_update_id, o.telegram_id, o.kind,
              o.quality, o.resolution, o.duration, o.price, o.prompt,
              o.status, o.result_url, o.created_at, o.updated_at,
              u.balance
       FROM orders o
       JOIN users u ON u.telegram_id = o.telegram_id
       WHERE o.telegram_update_id = ?`,
    )
    .bind(updateId)
    .first();

  return {
    duplicate,
    charged: order?.status === "pending",
    order,
  };
}

export async function getDatabaseStats(env) {
  const db = await ensureDatabase(env);
  return db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT COALESCE(SUM(balance), 0) FROM users) AS total_balance,
        (SELECT COUNT(*) FROM orders) AS orders,
        (SELECT COUNT(*) FROM orders WHERE status = 'pending') AS pending_orders`,
    )
    .first();
}

function toPositiveInteger(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error("Nominal harus berupa bilangan bulat positif.");
  }
  return number;
}
