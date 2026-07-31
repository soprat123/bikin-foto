import { pollPendingVideos, processPaidOrder } from "./xai.js";
import worker from "./index.js";
import {
  DatabaseNotConfiguredError,
  addBalance,
  createOrderAndCharge,
  ensureDatabase,
  getDatabaseStats,
  getTransactions,
  getUser,
  getUserByTarget,
  listUsers,
  subtractBalance,
  upsertUser,
} from "./db.js";

const MAIN_MENU = {
  keyboard: [
    [
      { text: "🖼 Generate Foto" },
      { text: "🎬 Generate Video" },
    ],
    [
      { text: "💰 Harga" },
      { text: "✏️ Edit Foto" },
    ],
    [
      { text: "👛 Saldo" },
      { text: "➕ Top Up" },
    ],
    [{ text: "📜 Riwayat Transaksi" }],
    [{ text: "🆘 Bantuan" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: "Pilih layanan...",
};

const ADMIN_COMMANDS = new Set([
  "adminhelp",
  "addsaldo",
  "kurangsaldo",
  "cekuser",
  "listuser",
  "mutasi",
  "stats",
  "refund",
]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/db-status") {
      return databaseStatus(url, env);
    }

    if (!isVerifiedTelegramWebhook(request, url, env)) {
      return worker.fetch(request, env, ctx);
    }

    let update;
    try {
      update = await request.clone().json();
    } catch {
      return worker.fetch(request, env, ctx);
    }

    const message = update.message;
    if (!message?.chat?.id || !message.from?.id) {
      return worker.fetch(request, env, ctx);
    }

    const chatId = message.chat.id;
    const telegramId = String(message.from.id);
    const text = (message.text || "").trim();
    const command = parseCommand(text);

    let registeredUser = null;
    let databaseError = null;

    try {
      registeredUser = await upsertUser(env, message.from);
    } catch (error) {
      databaseError = error;
      console.error("Gagal mendaftarkan user ke D1:", error);
    }

    if (text === "🆘 Bantuan" || command.name === "bantuan") {
      await sendMessage(
        env,
        chatId,
        "🆘 BANTUAN\n\nHubungi admin pemilik bot @Abdulgoib jika ingin top up manual dan ada kendala atau error pada bot",
        MAIN_MENU,
      );
      return new Response("OK");
    }

    if (command.name === "id") {
      const username = message.from.username
        ? `@${message.from.username}`
        : "Tidak memiliki username";
      await sendMessage(
        env,
        chatId,
        `🪪 IDENTITAS TELEGRAM\n\nID: ${telegramId}\nUsername: ${username}`,
        MAIN_MENU,
      );
      return new Response("OK");
    }

    if (text === "👛 Saldo" || command.name === "saldo") {
      if (databaseError || !registeredUser) {
        await sendDatabaseUnavailable(env, chatId, databaseError);
      } else {
        await sendMessage(
          env,
          chatId,
          `👛 SALDO ANDA\n\nSaldo tersedia: ${formatRupiah(
            registeredUser.balance,
          )}\nID Telegram: ${telegramId}`,
          MAIN_MENU,
        );
      }
      return new Response("OK");
    }

    if (
      text === "📜 Riwayat Transaksi" ||
      command.name === "riwayat"
    ) {
      if (databaseError || !registeredUser) {
        await sendDatabaseUnavailable(env, chatId, databaseError);
      } else {
        const transactions = await getTransactions(env, telegramId, 15);
        const body = transactions.length
          ? transactions
              .map((item, index) => {
                const isCredit =
                  item.type === "credit" || item.type === "refund";
                const sign = isCredit ? "+" : "-";
                const label = transactionTypeLabel(item.type);
                return `${index + 1}. ${label}\n${sign}${formatRupiah(
                  item.amount,
                )} • Saldo: ${formatRupiah(
                  item.balance_after,
                )}\n${item.description || label}\n${formatTransactionDate(
                  item.created_at,
                )}`;
              })
              .join("\n\n")
          : "Belum ada transaksi.";

        await sendMessage(
          env,
          chatId,
          `📜 RIWAYAT TRANSAKSI\n\n${body}\n\nMenampilkan maksimal 15 transaksi terbaru.`,
          MAIN_MENU,
        );
      }
      return new Response("OK");
    }

    if (ADMIN_COMMANDS.has(command.name)) {
      if (databaseError) {
        await sendDatabaseUnavailable(env, chatId, databaseError);
        return new Response("OK");
      }

      if (!isAdmin(message.from, env)) {
        await sendMessage(env, chatId, "Perintah ini hanya dapat digunakan admin.");
        return new Response("OK");
      }

      await handleAdminCommand(env, chatId, telegramId, command);
      return new Response("OK");
    }

    const replyContext = parseReplyContext(message.reply_to_message?.text || "");
    const orderPrompt = getValidOrderPrompt(message, replyContext);

    if (replyContext && orderPrompt !== null) {
      if (databaseError) {
        await sendDatabaseUnavailable(env, chatId, databaseError);
        return new Response("OK");
      }

      const price = parseRupiah(replyContext.price);
      if (!price) {
        await sendMessage(
          env,
          chatId,
          "Harga layanan tidak dapat dibaca. Silakan kembali ke menu dan pilih paket lagi.",
          MAIN_MENU,
        );
        return new Response("OK");
      }

      try {
        const result = await createOrderAndCharge(env, {
          telegramUpdateId: update.update_id,
          telegramId,
          kind: replyContext.kind,
          quality: replyContext.quality,
          resolution: replyContext.resolution,
          duration: replyContext.duration,
          price,
          prompt: orderPrompt,
        });

        if (result.duplicate) {
          return new Response("OK");
        }

        if (result.blocked) {
          const notice =
            result.blockReason === "active"
              ? `⏳ PESANAN MASIH DIPROSES\n\nTunggu pesanan sebelumnya selesai terlebih dahulu.${
                  result.activeOrderId
                    ? `\nNomor pesanan aktif: #${result.activeOrderId}`
                    : ""
                }`
              : `⏱ TUNGGU SEBENTAR\n\nJeda antar pesanan adalah 30 detik. Silakan tunggu sekitar ${Math.max(
                  1,
                  Number(result.cooldownRemaining || 1),
                )} detik sebelum membuat pesanan berikutnya.`;

          await sendMessage(env, chatId, notice, MAIN_MENU);
          return new Response("OK");
        }

        if (!result.charged) {
          await sendMessage(
            env,
            chatId,
            `❌ SALDO TIDAK CUKUP\n\nHarga layanan: ${formatRupiah(
              price,
            )}\nSaldo Anda: ${formatRupiah(
              result.order?.balance || 0,
            )}\n\nSilakan lakukan top up terlebih dahulu.`,
            MAIN_MENU,
          );
          return new Response("OK");
        }

        await sendMessage(
          env,
          chatId,
          `✅ PESANAN DITERIMA\n\nNomor pesanan: #${result.order.id}\nBiaya: ${formatRupiah(
            result.order.price,
          )}\nSisa saldo: ${formatRupiah(
            result.order.balance,
          )}\n\nPermintaan sedang dikirim ke xAI. Hasil akan dikirim otomatis ke chat ini.`,
          MAIN_MENU,
        );

        ctx.waitUntil(
          processPaidOrder(env, {
            order: result.order,
            message,
            chatId,
          }),
        );
      } catch (error) {
        console.error("Gagal memproses pesanan bersaldo:", error);
        await sendMessage(
          env,
          chatId,
          "Terjadi error saat memproses pesanan. Saldo tidak akan dipotong jika pencatatan database gagal. Hubungi @Abdulgoib.",
          MAIN_MENU,
        );
      }

      return new Response("OK");
    }

    return worker.fetch(request, env, ctx);
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(pollPendingVideos(env));
  },
};

function isVerifiedTelegramWebhook(request, url, env) {
  return (
    request.method === "POST" &&
    url.pathname === "/webhook" &&
    env.TELEGRAM_BOT_TOKEN &&
    env.TELEGRAM_WEBHOOK_SECRET &&
    request.headers.get("X-Telegram-Bot-Api-Secret-Token") ===
      env.TELEGRAM_WEBHOOK_SECRET
  );
}

async function databaseStatus(url, env) {
  if (!env.SETUP_KEY || url.searchParams.get("key") !== env.SETUP_KEY) {
    return Response.json({ ok: false, error: "Tidak diizinkan." }, { status: 401 });
  }

  try {
    const stats = await getDatabaseStats(env);
    return Response.json({ ok: true, database: "connected", stats });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        database: "not_ready",
        error:
          error instanceof DatabaseNotConfiguredError
            ? error.message
            : "Database gagal diakses.",
      },
      { status: 500 },
    );
  }
}

function parseCommand(text) {
  if (!text.startsWith("/")) return { name: "", args: [] };

  const parts = text.split(/\s+/);
  return {
    name: parts[0].slice(1).split("@")[0].toLowerCase(),
    args: parts.slice(1),
  };
}

function isAdmin(from, env) {
  const configuredId = String(env.ADMIN_TELEGRAM_ID || "").trim();
  if (configuredId && configuredId === String(from.id)) return true;

  const configuredUsername = String(
    env.ADMIN_TELEGRAM_USERNAME || "Abdulgoib",
  )
    .replace(/^@/, "")
    .toLowerCase();

  return Boolean(
    from.username && from.username.toLowerCase() === configuredUsername,
  );
}

async function handleAdminCommand(env, chatId, adminId, command) {
  if (command.name === "adminhelp") {
    await sendMessage(
      env,
      chatId,
      `🛠 PERINTAH ADMIN\n\n/addsaldo <ID|@username> <nominal> [catatan]\n/kurangsaldo <ID|@username> <nominal> [catatan]\n/cekuser <ID|@username>\n/listuser\n/mutasi <ID|@username>\n/refund <nomor_order>\n/stats\n/id`,
      MAIN_MENU,
    );
    return;
  }

  if (command.name === "stats") {
    const stats = await getDatabaseStats(env);
    await sendMessage(
      env,
      chatId,
      `📊 STATISTIK BOT\n\nUser terdaftar: ${stats.users}\nTotal saldo user: ${formatRupiah(
        stats.total_balance,
      )}\nTotal pesanan: ${stats.orders}\nPesanan pending: ${
        stats.pending_orders
      }`,
      MAIN_MENU,
    );
    return;
  }

  if (command.name === "listuser") {
    const users = await listUsers(env, 20);
    const body = users.length
      ? users
          .map(
            (user, index) =>
              `${index + 1}. ${displayUser(user)}\n   ID: ${
                user.telegram_id
              } | ${formatRupiah(user.balance)}`,
          )
          .join("\n")
      : "Belum ada user terdaftar.";

    await sendMessage(
      env,
      chatId,
      `👥 20 USER TERBARU\n\n${body}`,
      MAIN_MENU,
    );
    return;
  }

  if (command.name === "refund") {
    const orderId = Number(command.args[0]);
    if (!Number.isSafeInteger(orderId) || orderId <= 0) {
      await sendMessage(env, chatId, "Format: /refund <nomor_order>");
      return;
    }

    const result = await refundOrder(env, orderId, adminId);
    if (!result.success) {
      await sendMessage(
        env,
        chatId,
        result.message || "Pesanan tidak ditemukan atau sudah pernah direfund.",
      );
      return;
    }

    await sendMessage(
      env,
      chatId,
      `✅ REFUND BERHASIL\n\nOrder: #${orderId}\nUser: ${displayUser(
        result.user,
      )}\nNominal: ${formatRupiah(result.amount)}\nSaldo sekarang: ${formatRupiah(
        result.user.balance,
      )}`,
      MAIN_MENU,
    );
    return;
  }

  const target = command.args[0];
  if (!target) {
    await sendMessage(env, chatId, "Target user belum diisi. Gunakan ID atau @username.");
    return;
  }

  const user = await getUserByTarget(env, target);
  if (!user) {
    await sendMessage(
      env,
      chatId,
      "User tidak ditemukan. Minta user membuka bot dan mengirim /start terlebih dahulu.",
    );
    return;
  }

  if (command.name === "cekuser") {
    await sendMessage(env, chatId, formatUserDetail(user), MAIN_MENU);
    return;
  }

  if (command.name === "mutasi") {
    const transactions = await getTransactions(env, user.telegram_id, 15);
    const body = transactions.length
      ? transactions
          .map((item) => {
            const sign = item.type === "credit" || item.type === "refund" ? "+" : "-";
            return `${sign}${formatRupiah(item.amount)} → ${formatRupiah(
              item.balance_after,
            )}\n${item.description || item.type} | ${item.created_at}`;
          })
          .join("\n\n")
      : "Belum ada transaksi.";

    await sendMessage(
      env,
      chatId,
      `📒 MUTASI ${displayUser(user)}\n\n${body}`,
      MAIN_MENU,
    );
    return;
  }

  const amount = parseAdminAmount(command.args[1]);
  if (!amount) {
    const example =
      command.name === "addsaldo"
        ? "/addsaldo 123456789 10000"
        : "/kurangsaldo 123456789 500";
    await sendMessage(env, chatId, `Nominal tidak valid. Contoh: ${example}`);
    return;
  }

  const customNote = command.args.slice(2).join(" ").trim();

  if (command.name === "addsaldo") {
    const updated = await addBalance(
      env,
      user.telegram_id,
      amount,
      customNote || `Top up manual oleh admin ${adminId}`,
    );

    await sendMessage(
      env,
      chatId,
      `✅ SALDO DITAMBAHKAN\n\nUser: ${displayUser(
        updated,
      )}\nNominal: ${formatRupiah(amount)}\nSaldo sekarang: ${formatRupiah(
        updated.balance,
      )}`,
      MAIN_MENU,
    );
    return;
  }

  if (command.name === "kurangsaldo") {
    const result = await subtractBalance(
      env,
      user.telegram_id,
      amount,
      customNote || `Pengurangan manual oleh admin ${adminId}`,
    );

    if (!result.success) {
      await sendMessage(
        env,
        chatId,
        `Saldo user tidak cukup. Saldo saat ini: ${formatRupiah(
          result.user?.balance || 0,
        )}`,
      );
      return;
    }

    await sendMessage(
      env,
      chatId,
      `✅ SALDO DIKURANGI\n\nUser: ${displayUser(
        result.user,
      )}\nNominal: ${formatRupiah(amount)}\nSaldo sekarang: ${formatRupiah(
        result.user.balance,
      )}`,
      MAIN_MENU,
    );
  }
}

async function refundOrder(env, orderId, adminId) {
  const db = await ensureDatabase(env);
  const referenceId = `refund:${orderId}`;
  const description = `Refund order #${orderId} oleh admin ${adminId}`;

  const results = await db.batch([
    db
      .prepare(
        `UPDATE orders
         SET status = 'refunding', updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status IN ('pending', 'processing', 'failed')`,
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
      .bind(description, referenceId, orderId),
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

  const success = Number(results[0]?.meta?.changes || 0) > 0;
  if (!success) {
    return {
      success: false,
      message: "Order tidak ditemukan, belum dibayar, atau sudah direfund.",
    };
  }

  const order = await db
    .prepare("SELECT telegram_id, price FROM orders WHERE id = ?")
    .bind(orderId)
    .first();
  const user = order ? await getUser(env, order.telegram_id) : null;

  return {
    success: Boolean(user),
    amount: order?.price || 0,
    user,
  };
}

function parseReplyContext(text) {
  if (!text) return null;

  const kind = extractField(text, "Jenis");
  if (!kind || !["Generate Foto", "Generate Video", "Edit Foto"].includes(kind)) {
    return null;
  }

  return {
    kind,
    quality: extractField(text, "Kualitas"),
    resolution: extractField(text, "Resolusi"),
    duration: extractField(text, "Durasi"),
    price: extractField(text, "Harga"),
  };
}

function getValidOrderPrompt(message, context) {
  if (!context) return null;

  if (context.kind === "Edit Foto") {
    if (!message.photo?.length) return null;
    const caption = (message.caption || "").trim();
    return caption || null;
  }

  const prompt = (message.text || "").trim();
  return prompt || null;
}

function extractField(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^${escaped}:\\s*(.+)$`, "m"));
  return match ? match[1].trim() : "";
}

function parseRupiah(value) {
  const digits = String(value || "").replace(/\D/g, "");
  const amount = Number(digits);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : 0;
}

function parseAdminAmount(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^rp\s*/, "");

  let amount;
  if (raw.endsWith("k")) {
    const number = Number(raw.slice(0, -1).replace(",", "."));
    amount = Math.round(number * 1000);
  } else {
    amount = Number(raw.replace(/[.,\s]/g, ""));
  }

  return Number.isSafeInteger(amount) && amount > 0 && amount <= 1_000_000_000
    ? amount
    : 0;
}

function formatRupiah(value) {
  return `Rp${Number(value || 0).toLocaleString("id-ID")}`;
}

function transactionTypeLabel(type) {
  const labels = {
    credit: "✅ Saldo masuk",
    debit: "🛒 Pembayaran layanan",
    refund: "↩️ Refund",
    adjustment: "⚙️ Penyesuaian saldo",
  };

  return labels[type] || "🧾 Transaksi";
}

function formatTransactionDate(value) {
  if (!value) return "-";

  const normalized = String(value).includes("T")
    ? String(value)
    : `${String(value).replace(" ", "T")}Z`;
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function displayUser(user) {
  if (!user) return "User";
  if (user.username) return `@${user.username}`;
  return user.first_name || `ID ${user.telegram_id}`;
}

function formatUserDetail(user) {
  return `👤 DATA USER\n\nNama: ${user.first_name || "-"}\nUsername: ${
    user.username ? `@${user.username}` : "-"
  }\nID Telegram: ${user.telegram_id}\nSaldo: ${formatRupiah(
    user.balance,
  )}\nTerdaftar: ${user.created_at}`;
}

async function sendDatabaseUnavailable(env, chatId, error) {
  const missingBinding = error instanceof DatabaseNotConfiguredError;
  const detail = missingBinding
    ? "Database D1 belum dihubungkan ke Worker dengan nama binding DB."
    : "Database sedang tidak dapat diakses.";

  await sendMessage(
    env,
    chatId,
    `⚠️ SISTEM SALDO BELUM AKTIF\n\n${detail}\n\nHubungi admin @Abdulgoib.`,
    MAIN_MENU,
  );
}

async function sendMessage(env, chatId, text, replyMarkup) {
  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
    },
  );

  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(
      result.description || `Telegram API error ${response.status}`,
    );
  }

  return result;
}
