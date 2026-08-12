export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("Binding database D1 dengan nama DB belum dipasang.");
    this.name = "DatabaseNotConfiguredError";
  }
}

export async function ensureDatabase(env) {
  if (!env.DB) throw new DatabaseNotConfiguredError();
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

export async function setUserBlocked(env, telegramId, blocked = true) {
  const db = await ensureDatabase(env);
  await db
    .prepare(
      `UPDATE users
       SET is_blocked = ?, updated_at = CURRENT_TIMESTAMP
       WHERE telegram_id = ?`,
    )
    .bind(blocked ? 1 : 0, String(telegramId))
    .run();
  return getUser(env, telegramId);
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

export async function ensurePaymentSchema(env) {
  const db = await ensureDatabase(env);
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS deposits (
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
      )`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_deposits_user_created
       ON deposits(telegram_id, created_at DESC)`,
    ),
  ]);
  return db;
}

export async function createPendingDeposit(env, telegramId, updateId, amount) {
  const db = await ensurePaymentSchema(env);
  const id = String(telegramId);
  const reference = `deposit:${id}:${String(updateId)}`;
  const value = toPositiveInteger(amount);

  await db
    .prepare(
      `INSERT OR IGNORE INTO deposits (
        reference, telegram_id, requested_amount, status
      ) VALUES (?, ?, ?, 'creating')`,
    )
    .bind(reference, id, value)
    .run();

  return db.prepare("SELECT * FROM deposits WHERE reference = ?").bind(reference).first();
}

export async function attachGatePayOrder(env, reference, order) {
  const db = await ensurePaymentSchema(env);
  await db
    .prepare(
      `UPDATE deposits
       SET gatepay_order_id = ?, unique_amount = ?, checkout_url = ?,
           status = 'pending', updated_at = CURRENT_TIMESTAMP
       WHERE reference = ? AND status = 'creating'`,
    )
    .bind(String(order.id), toPositiveInteger(order.unique_amount), String(order.checkout_url), reference)
    .run();
  return db.prepare("SELECT * FROM deposits WHERE reference = ?").bind(reference).first();
}

export async function markDepositFailed(env, reference) {
  const db = await ensurePaymentSchema(env);
  await db
    .prepare(
      `UPDATE deposits SET status = 'failed', updated_at = CURRENT_TIMESTAMP
       WHERE reference = ? AND status = 'creating'`,
    )
    .bind(reference)
    .run();
}

export async function settleGatePayDeposit(env, event) {
  const db = await ensurePaymentSchema(env);
  const orderId = String(event.order_id || "");
  const uniqueAmount = toPositiveInteger(event.unique_amount);
  const referenceId = `gatepay:${orderId}`;

  const current = await db
    .prepare(
      `SELECT d.*, u.balance, u.username, u.first_name
       FROM deposits d JOIN users u ON u.telegram_id = d.telegram_id
       WHERE d.gatepay_order_id = ?`,
    )
    .bind(orderId)
    .first();
  if (!current) return { success: false, reason: "deposit_not_found" };
  if (Number(current.unique_amount) !== uniqueAmount) {
    return { success: false, reason: "amount_mismatch" };
  }
  if (current.status === "paid") {
    return { success: true, duplicate: true, deposit: current };
  }
  if (current.status !== "pending") return { success: false, reason: "deposit_not_pending" };
  const creditAmount = toPositiveInteger(current.requested_amount);

  await db.batch([
    db
      .prepare(
        `UPDATE deposits SET status = 'processing', paid_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE gatepay_order_id = ? AND status = 'pending' AND unique_amount = ?`,
      )
      .bind(Number(event.paid_at), orderId, uniqueAmount),
    db
      .prepare(
        `UPDATE users SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP
         WHERE telegram_id = ? AND changes() > 0`,
      )
      .bind(creditAmount, current.telegram_id),
    db
      .prepare(
        `INSERT OR IGNORE INTO transactions (
          telegram_id, type, amount, balance_after, description, reference_id
        )
        SELECT telegram_id, 'credit', ?, balance, 'Top up QRIS', ?
        FROM users WHERE telegram_id = ? AND changes() > 0`,
      )
      .bind(creditAmount, referenceId, current.telegram_id),
    db
      .prepare(
        `UPDATE deposits SET status = 'paid', updated_at = CURRENT_TIMESTAMP
         WHERE gatepay_order_id = ? AND status = 'processing'
           AND EXISTS (SELECT 1 FROM transactions WHERE reference_id = ?)`,
      )
      .bind(orderId, referenceId),
  ]);

  const deposit = await db
    .prepare(
      `SELECT d.*, u.balance, u.username, u.first_name
       FROM deposits d JOIN users u ON u.telegram_id = d.telegram_id
       WHERE d.gatepay_order_id = ?`,
    )
    .bind(orderId)
    .first();
  return {
    success: deposit?.status === "paid",
    duplicate: false,
    reason: deposit?.status === "paid" ? null : "settlement_failed",
    deposit,
  };
}

export async function markDepositNotificationSent(env, orderId) {
  const db = await ensurePaymentSchema(env);
  await db
    .prepare(
      `UPDATE deposits SET notification_sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE gatepay_order_id = ? AND notification_sent_at IS NULL`,
    )
    .bind(String(orderId))
    .run();
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
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'checking_balance'
        WHERE NOT EXISTS (
          SELECT 1
          FROM orders
          WHERE telegram_id = ?
            AND status IN ('pending', 'processing')
        )
        AND NOT EXISTS (
          SELECT 1
          FROM orders
          WHERE telegram_id = ?
            AND created_at >= datetime('now', '-30 seconds')
        )`,
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
        telegramId,
        telegramId,
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

  const inserted = Number(results[0]?.meta?.changes || 0) > 0;
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

  if (!inserted && !order) {
    const activeOrder = await db
      .prepare(
        `SELECT id, status
         FROM orders
         WHERE telegram_id = ?
           AND status IN ('pending', 'processing')
         ORDER BY id DESC
         LIMIT 1`,
      )
      .bind(telegramId)
      .first();

    if (activeOrder) {
      return {
        duplicate: false,
        blocked: true,
        blockReason: "active",
        activeOrderId: activeOrder.id,
        charged: false,
        order: null,
      };
    }

    const latestOrder = await db
      .prepare(
        `SELECT MAX(
           0,
           30 - (unixepoch('now') - unixepoch(created_at))
         ) AS cooldown_remaining
         FROM (
           SELECT created_at
           FROM orders
           WHERE telegram_id = ?
           ORDER BY id DESC
           LIMIT 1
         )`,
      )
      .bind(telegramId)
      .first();

    return {
      duplicate: false,
      blocked: true,
      blockReason: "cooldown",
      cooldownRemaining: Math.max(
        1,
        Number(latestOrder?.cooldown_remaining || 1),
      ),
      charged: false,
      order: null,
    };
  }

  return {
    duplicate: !inserted && Boolean(order),
    blocked: false,
    blockReason: null,
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
        (SELECT COUNT(*) FROM orders WHERE status = 'pending') AS pending_orders,
        (SELECT COUNT(*) FROM orders WHERE status = 'completed') AS completed_orders,
        (SELECT COUNT(*) FROM orders WHERE status = 'failed') AS failed_orders`,
    )
    .first();
}

export async function getPendingVideoOrders(env, limit = 5) {
  const db = await ensureDatabase(env);
  const safeLimit = Math.max(1, Math.min(Number(limit) || 5, 10));
  const result = await db
    .prepare(
      `SELECT id, telegram_id, kind, quality, resolution, duration, price,
              prompt, external_id, status, created_at, updated_at
       FROM orders
       WHERE kind IN ('Generate Video', 'Foto ke Video') AND status = 'processing'
       ORDER BY updated_at ASC
       LIMIT ?`,
    )
    .bind(safeLimit)
    .all();
  return result.results || [];
}

export async function markOrderProcessing(env, orderId, externalId = null) {
  const db = await ensureDatabase(env);
  await db
    .prepare(
      `UPDATE orders
       SET status = 'processing', external_id = COALESCE(?, external_id),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'pending'`,
    )
    .bind(externalId, orderId)
    .run();
}

export async function markOrderCompleted(env, orderId, resultUrl) {
  const db = await ensureDatabase(env);
  await db
    .prepare(
      `UPDATE orders
       SET status = 'completed', result_url = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status IN ('pending', 'processing')`,
    )
    .bind(resultUrl, orderId)
    .run();
}

export async function markOrderFailed(env, orderId) {
  const db = await ensureDatabase(env);
  await db
    .prepare(
      `UPDATE orders
       SET status = 'failed', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status IN ('pending', 'processing')`,
    )
    .bind(orderId)
    .run();
}

export async function refundOrderBalance(
  env,
  orderId,
  reason = "Refund otomatis karena proses gagal",
) {
  const db = await ensureDatabase(env);
  const referenceId = `refund:${orderId}`;

  const results = await db.batch([
    db
      .prepare(
        `UPDATE orders
         SET status = 'refunding', updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'failed'`,
      )
      .bind(orderId),
    db
      .prepare(
        `UPDATE users
         SET balance = balance + (
           SELECT price FROM orders WHERE id = ?
         ), updated_at = CURRENT_TIMESTAMP
         WHERE telegram_id = (
           SELECT telegram_id FROM orders WHERE id = ?
         ) AND changes() > 0`,
      )
      .bind(orderId, orderId),
    db
      .prepare(
        `INSERT OR IGNORE INTO transactions (
          telegram_id, type, amount, balance_after, description, reference_id
        )
        SELECT o.telegram_id, 'refund', o.price, u.balance, ?, ?
        FROM orders o
        JOIN users u ON u.telegram_id = o.telegram_id
        WHERE o.id = ? AND changes() > 0`,
      )
      .bind(reason, referenceId, orderId),
    db
      .prepare(
        `UPDATE orders
         SET status = CASE
           WHEN EXISTS (
             SELECT 1 FROM transactions WHERE reference_id = ?
           ) THEN 'refunded'
           ELSE status
         END,
         updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(referenceId, orderId),
  ]);

  const user = await db
    .prepare(
      `SELECT u.telegram_id, u.username, u.first_name, u.balance, o.price
       FROM orders o
       JOIN users u ON u.telegram_id = o.telegram_id
       WHERE o.id = ?`,
    )
    .bind(orderId)
    .first();

  return {
    refunded: Number(results[0]?.meta?.changes || 0) > 0,
    user,
  };
}

function toPositiveInteger(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error("Nominal harus berupa bilangan bulat positif.");
  }
  return number;
}
