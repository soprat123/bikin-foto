import { ensureDatabase, getUser } from "./db.js";

export const CHAT_MODELS = {
  "grok-4.3": { label: "Medium", price: 200 },
  "grok-4.5": { label: "Paling Pintar", price: 500 },
};

async function ensureChatSchema(env) {
  const db = await ensureDatabase(env);
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS chat_sessions (
        telegram_id TEXT PRIMARY KEY,
        model TEXT NOT NULL DEFAULT 'grok-4.3',
        active INTEGER NOT NULL DEFAULT 0,
        expires_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_chat_messages_user_created
       ON chat_messages(telegram_id, id DESC)`,
    ),
    db.prepare(
      `DELETE FROM chat_messages
       WHERE created_at < datetime('now', '-2 hours')`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS chat_requests (
        telegram_update_id TEXT PRIMARY KEY,
        telegram_id TEXT NOT NULL,
        model TEXT NOT NULL,
        price INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'processing',
        response_text TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    ),
  ]);
  return db;
}

export async function startChatSession(env, telegramId, model) {
  if (!CHAT_MODELS[model]) throw new Error("invalid_chat_model");
  const db = await ensureChatSchema(env);
  await db
    .prepare(
      `INSERT INTO chat_sessions (
        telegram_id, model, active, expires_at
      ) VALUES (?, ?, 1, datetime('now', '+2 hours'))
      ON CONFLICT(telegram_id) DO UPDATE SET
        model = excluded.model,
        active = 1,
        expires_at = datetime('now', '+2 hours'),
        updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(String(telegramId), model)
    .run();
  return getActiveChatSession(env, telegramId);
}

export async function getActiveChatSession(env, telegramId) {
  const db = await ensureChatSchema(env);
  await db
    .prepare(
      `UPDATE chat_sessions
       SET active = 0, updated_at = CURRENT_TIMESTAMP
       WHERE telegram_id = ? AND active = 1
         AND (expires_at IS NULL OR expires_at <= CURRENT_TIMESTAMP)`,
    )
    .bind(String(telegramId))
    .run();
  return db
    .prepare(
      `SELECT telegram_id, model, active, expires_at
       FROM chat_sessions
       WHERE telegram_id = ? AND active = 1
         AND expires_at > CURRENT_TIMESTAMP`,
    )
    .bind(String(telegramId))
    .first();
}

export async function endChatSession(env, telegramId) {
  const db = await ensureChatSchema(env);
  await db
    .prepare(
      `UPDATE chat_sessions
       SET active = 0, updated_at = CURRENT_TIMESTAMP
       WHERE telegram_id = ?`,
    )
    .bind(String(telegramId))
    .run();
}

export async function clearChatMemory(env, telegramId) {
  const db = await ensureChatSchema(env);
  await db
    .prepare("DELETE FROM chat_messages WHERE telegram_id = ?")
    .bind(String(telegramId))
    .run();
}

export async function getChatMemory(env, telegramId, limit = 20) {
  const db = await ensureChatSchema(env);
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 20));
  const result = await db
    .prepare(
      `SELECT role, content, created_at
       FROM (
         SELECT id, role, content, created_at
         FROM chat_messages
         WHERE telegram_id = ?
           AND created_at >= datetime('now', '-2 hours')
         ORDER BY id DESC
         LIMIT ?
       )
       ORDER BY id ASC`,
    )
    .bind(String(telegramId), safeLimit)
    .all();
  return result.results || [];
}

export async function saveChatExchange(env, telegramId, userText, assistantText) {
  const db = await ensureChatSchema(env);
  const id = String(telegramId);
  await db.batch([
    db
      .prepare(
        "INSERT INTO chat_messages (telegram_id, role, content) VALUES (?, 'user', ?)",
      )
      .bind(id, String(userText).slice(0, 8000)),
    db
      .prepare(
        "INSERT INTO chat_messages (telegram_id, role, content) VALUES (?, 'assistant', ?)",
      )
      .bind(id, String(assistantText).slice(0, 12000)),
    db
      .prepare(
        `UPDATE chat_sessions
         SET expires_at = datetime('now', '+2 hours'),
             updated_at = CURRENT_TIMESTAMP
         WHERE telegram_id = ?`,
      )
      .bind(id),
    db
      .prepare(
        `DELETE FROM chat_messages
         WHERE telegram_id = ?
           AND id NOT IN (
             SELECT id FROM chat_messages
             WHERE telegram_id = ?
             ORDER BY id DESC
             LIMIT 20
           )`,
      )
      .bind(id, id),
  ]);
}

export async function beginChatRequest(env, input) {
  const db = await ensureChatSchema(env);
  const updateId = String(input.telegramUpdateId);
  const telegramId = String(input.telegramId);
  const config = CHAT_MODELS[input.model];
  if (!config) throw new Error("invalid_chat_model");

  const insertResult = await db
    .prepare(
      `INSERT OR IGNORE INTO chat_requests (
        telegram_update_id, telegram_id, model, price, status
      ) VALUES (?, ?, ?, ?, 'processing')`,
    )
    .bind(updateId, telegramId, input.model, config.price)
    .run();

  const request = await db
    .prepare("SELECT * FROM chat_requests WHERE telegram_update_id = ?")
    .bind(updateId)
    .first();
  const user = await getUser(env, telegramId);
  return {
    duplicate:
      Number(insertResult?.meta?.changes || 0) === 0 ||
      request?.telegram_id !== telegramId,
    request,
    user,
    canAfford: Number(user?.balance || 0) >= config.price,
  };
}

export async function completeChatAndCharge(
  env,
  { telegramUpdateId, telegramId, model, responseText },
) {
  const db = await ensureChatSchema(env);
  const updateId = String(telegramUpdateId);
  const id = String(telegramId);
  const config = CHAT_MODELS[model];
  if (!config) throw new Error("invalid_chat_model");
  const referenceId = `chat:${updateId}`;
  const description = `Chat AI ${config.label} (${model})`;

  const existingTransaction = await db
    .prepare("SELECT id FROM transactions WHERE reference_id = ?")
    .bind(referenceId)
    .first();
  if (existingTransaction) {
    const request = await db
      .prepare("SELECT * FROM chat_requests WHERE telegram_update_id = ?")
      .bind(updateId)
      .first();
    return { charged: true, duplicate: true, request, user: await getUser(env, id) };
  }

  const results = await db.batch([
    db
      .prepare(
        `UPDATE users
         SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP
         WHERE telegram_id = ? AND balance >= ?
           AND EXISTS (
             SELECT 1 FROM chat_requests
             WHERE telegram_update_id = ? AND telegram_id = ?
               AND status = 'processing'
           )`,
      )
      .bind(config.price, id, config.price, updateId, id),
    db
      .prepare(
        `INSERT OR IGNORE INTO transactions (
          telegram_id, type, amount, balance_after, description, reference_id
        )
        SELECT telegram_id, 'debit', ?, balance, ?, ?
        FROM users
        WHERE telegram_id = ? AND changes() > 0`,
      )
      .bind(config.price, description, referenceId, id),
    db
      .prepare(
        `UPDATE chat_requests
         SET status = CASE
           WHEN EXISTS (
             SELECT 1 FROM transactions WHERE reference_id = ?
           ) THEN 'completed'
           ELSE 'insufficient'
         END,
         response_text = CASE
           WHEN EXISTS (
             SELECT 1 FROM transactions WHERE reference_id = ?
           ) THEN ?
           ELSE NULL
         END,
         updated_at = CURRENT_TIMESTAMP
         WHERE telegram_update_id = ? AND status = 'processing'`,
      )
      .bind(
        referenceId,
        referenceId,
        String(responseText).slice(0, 12000),
        updateId,
      ),
  ]);

  const changed = Number(results[0]?.meta?.changes || 0) > 0;
  const request = await db
    .prepare("SELECT * FROM chat_requests WHERE telegram_update_id = ?")
    .bind(updateId)
    .first();
  return {
    charged: changed && request?.status === "completed",
    duplicate: false,
    request,
    user: await getUser(env, id),
  };
}

export async function failChatRequest(env, telegramUpdateId, errorMessage) {
  const db = await ensureChatSchema(env);
  await db
    .prepare(
      `UPDATE chat_requests
       SET status = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP
       WHERE telegram_update_id = ? AND status = 'processing'`,
    )
    .bind(String(errorMessage || "chat_failed").slice(0, 1000), String(telegramUpdateId))
    .run();
}
