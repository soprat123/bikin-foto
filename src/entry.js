import { pollPendingVideos, processPaidOrder } from "./xai.js";
import worker from "./index.js";
import {
  appendChatMemoryToImagePrompt,
  handleChatControl,
  handlePaidChat,
} from "./chat.js";
import { detectBlockedRequest } from "./moderation.js";
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
  markDepositNotificationSent,
  settleGatePayDeposit,
  setUserBlocked,
  subtractBalance,
  upsertUser,
} from "./db.js";
import {
  readInternalJson,
  buildManualTopupInvoice,
  notifyTransactionBot,
  requestDynamicQris,
  verifyInternalSecret,
} from "./payments.js";

const MAIN_MENU = {
  keyboard: [
    [
      { text: "🖼 Generate Foto" },
      { text: "🎬 Generate Video" },
    ],
    [{ text: "📸 Foto ke Video" }],
    [
      { text: "💰 Harga" },
      { text: "✏️ Edit Foto" },
    ],
    [
      { text: "👛 Saldo" },
      { text: "➕ Top Up" },
    ],
    [{ text: "💬 Chat AI" }],
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

const TOPUP_PROMPT =
  "➕ TOP UP SALDO\n\nBalas pesan ini dengan nominal top up.\nMinimal Rp1.000 dan maksimal Rp1.000.000.";

const TOPUP_FORCE_REPLY = {
  force_reply: true,
  input_field_placeholder: "Contoh: 10000",
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/internal/admin-command") {
      if (request.method !== "POST") {
        return Response.json({ ok: false, error: "method_not_allowed" }, { status: 405 });
      }
      return handleInternalAdminCommand(request, env);
    }

    if (url.pathname === "/internal/payment-paid") {
      if (request.method !== "POST") {
        return Response.json({ ok: false, error: "method_not_allowed" }, { status: 405 });
      }
      return handleInternalPayment(request, env);
    }

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

    if (update.callback_query?.id && update.callback_query?.from?.id) {
      await handleTopupCallback(env, update.callback_query);
      return new Response("OK");
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

    if (registeredUser?.is_blocked) {
      await sendMessage(
        env,
        chatId,
        "⛔ Akun Anda diblokir oleh admin. Hubungi @Abdulgoib untuk bantuan.",
      );
      return new Response("OK");
    }

    const chatControl =
      text === "💬 Chat AI" ||
      text === "⚡ Medium — Rp200/pesan" ||
      text === "🧠 Paling Pintar — Rp500/pesan" ||
      text === "🧾 Lihat Ingatan" ||
      text === "🗑 Hapus Ingatan" ||
      text === "⛔ Akhiri Chat AI" ||
      ["chat", "model", "memory", "clearmemory", "endchat"].includes(command.name);

    if (chatControl) {
      if (databaseError || !registeredUser) {
        await sendDatabaseUnavailable(env, chatId, databaseError);
      } else {
        await handleChatControl(env, {
          chatId,
          telegramId,
          text,
          commandName: command.name,
          mainMenu: MAIN_MENU,
        });
      }
      return new Response("OK");
    }

    if (text === "🆘 Bantuan" || command.name === "bantuan") {
      await sendMessage(
        env,
        chatId,
        "🆘 BANTUAN\n\nHubungi admin pemilik bot jika ada eror dan keterlambatan top up saldo bot masih diproses manual @Abdulgoib",
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

    if (text === "➕ Top Up" || command.name === "topup") {
      if (databaseError || !registeredUser) {
        await sendDatabaseUnavailable(env, chatId, databaseError);
      } else {
        await sendMessage(env, chatId, TOPUP_PROMPT, TOPUP_FORCE_REPLY);
      }
      return new Response("OK");
    }

    if (isTopUpReply(message)) {
      if (databaseError || !registeredUser) {
        await sendDatabaseUnavailable(env, chatId, databaseError);
        return new Response("OK");
      }

      const amount = parseAdminAmount(text);
      if (amount < 1_000 || amount > 1_000_000) {
        await sendMessage(
          env,
          chatId,
          "Nominal top up harus Rp1.000 sampai Rp1.000.000. Balas kembali dengan angka, contoh: 10000.",
        );
        return new Response("OK");
      }

      try {
        await ensureTelegramCallbackWebhook(env, url.origin);
        const qrisImage = await requestDynamicQris(env, amount);
        const orderId = String(update.update_id);
        const expiresAt = Date.now() + 60 * 60 * 1000;
        const callbackSuffix = `${amount}:${orderId}:${Math.floor(expiresAt / 60_000).toString(36)}`;
        await sendPhoto(
          env,
          chatId,
          qrisImage,
          buildManualTopupInvoice({ amount, orderId, expiresAt }),
          {
            inline_keyboard: [
              [{ text: "✅ Saya Sudah Bayar", callback_data: `topup_paid:${callbackSuffix}` }],
              [{ text: "❌ Batalkan Pesanan", callback_data: `topup_cancel:${callbackSuffix}` }],
            ],
          },
        );
      } catch (error) {
        console.error(
          JSON.stringify({
            event: "manual_qris_create_failed",
            message: error.message,
          }),
        );
        let userMessage =
          "⚠️ Gagal membuat pembayaran QRIS. Silakan coba kembali beberapa saat lagi atau hubungi @Abdulgoib.";
        const errorCode = String(error.message || "unknown_error");
        if (errorCode === "missing_qris_payment_url") {
          userMessage =
            "⚠️ QRIS_PAYMENT_URL belum terbaca di deployment aktif Worker bikin-foto.";
        } else if (errorCode === "missing_qris_api_key") {
          userMessage =
            "⚠️ QRIS_API_KEY belum dipasang pada Worker bikin-foto.";
        } else if (errorCode === "invalid_payment_service_url") {
          userMessage =
            "⚠️ QRIS_PAYMENT_URL tidak valid atau tidak menggunakan HTTPS.";
        } else if (errorCode === "unauthorized") {
          userMessage =
            "⚠️ QRIS_API_KEY pada Worker bikin-foto tidak sama dengan Worker QRIS.";
        } else if (errorCode === "server_not_configured") {
          userMessage =
            "⚠️ QRIS_API_KEY atau QRIS_STATIC_PAYLOAD belum terbaca di Worker QRIS.";
        } else {
          userMessage = `⚠️ Layanan QRIS gagal: ${errorCode.slice(0, 160)}`;
        }
        await sendMessage(
          env,
          chatId,
          userMessage,
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
    let orderPrompt = getValidOrderPrompt(message, replyContext);

    if (replyContext && orderPrompt !== null) {
      if (databaseError) {
        await sendDatabaseUnavailable(env, chatId, databaseError);
        return new Response("OK");
      }

      if (replyContext.kind === "Generate Foto") {
        orderPrompt = await appendChatMemoryToImagePrompt(
          env,
          telegramId,
          orderPrompt,
        );
      }

      const moderationCategory = detectBlockedRequest(orderPrompt);
      if (moderationCategory) {
        console.warn(
          JSON.stringify({
            message: "Permintaan melanggar filter konten",
            category: moderationCategory,
            telegram_id: telegramId,
            kind: replyContext.kind,
          }),
        );
        await sendMessage(
          env,
          chatId,
          "🚫 PERMINTAAN DITOLAK\n\nPermintaan mengandung kata atau tema yang dilarang oleh filter keamanan bot. Ini mencakup konten seksual, anak/remaja, kekerasan atau menyakiti diri, kebencian/terorisme, narkoba, perjudian, pemalsuan/deepfake, politik/agama sensitif, serta dokumen identitas atau medis sensitif.\n\nSaldo Anda tidak dipotong. Silakan ubah deskripsi menjadi konten yang aman.",
          MAIN_MENU,
        );
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

    if (!databaseError) {
      try {
        const handledChat = await handlePaidChat(env, {
          updateId: update.update_id,
          chatId,
          telegramId,
          text,
          mainMenu: MAIN_MENU,
        });
        if (handledChat) return new Response("OK");
      } catch (error) {
        console.error("Gagal menangani Chat AI:", error);
        await sendDatabaseUnavailable(env, chatId, error);
        return new Response("OK");
      }
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

function isTopUpReply(message) {
  return String(message.reply_to_message?.text || "").startsWith("➕ TOP UP SALDO");
}

async function handleInternalAdminCommand(request, env) {
  if (!env.QRIS_INTERNAL_SECRET) {
    return Response.json({ ok: false, error: "server_not_configured" }, { status: 500 });
  }
  if (!(await verifyInternalSecret(request.headers.get("x-internal-secret"), env.QRIS_INTERNAL_SECRET))) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let input;
  try {
    input = await readInternalJson(request);
  } catch (error) {
    return Response.json({ ok: false, error: error.message || "invalid_json" }, { status: 400 });
  }

  const action = String(input.action || "").toLowerCase();
  const target = String(input.target || "").trim();
  const adminId = String(input.admin_id || "transaksiqrisbot");
  const user = await getUserByTarget(env, target);
  if (!user) {
    return Response.json({ ok: false, error: "user_not_found" }, { status: 404 });
  }

  if (action === "addcredit") {
    const amount = parseAdminAmount(input.amount);
    if (!amount) return Response.json({ ok: false, error: "invalid_amount" }, { status: 400 });
    const updated = await addBalance(
      env,
      user.telegram_id,
      amount,
      `Top up melalui @transaksiqrisbot oleh admin ${adminId}`,
    );
    return Response.json({ ok: true, action, user: updated });
  }

  if (action === "minuscredit") {
    const amount = parseAdminAmount(input.amount);
    if (!amount) return Response.json({ ok: false, error: "invalid_amount" }, { status: 400 });
    const result = await subtractBalance(
      env,
      user.telegram_id,
      amount,
      `Pengurangan melalui @transaksiqrisbot oleh admin ${adminId}`,
    );
    if (!result.success) {
      return Response.json(
        { ok: false, error: "insufficient_balance", user: result.user },
        { status: 409 },
      );
    }
    return Response.json({ ok: true, action, user: result.user });
  }

  if (action === "blokir") {
    const updated = await setUserBlocked(env, user.telegram_id, true);
    return Response.json({ ok: true, action, user: updated });
  }

  return Response.json({ ok: false, error: "invalid_action" }, { status: 400 });
}

async function handleInternalPayment(request, env) {
  if (!env.QRIS_INTERNAL_SECRET || !env.TELEGRAM_BOT_TOKEN) {
    return Response.json({ ok: false, error: "server_not_configured" }, { status: 500 });
  }
  if (!(await verifyInternalSecret(request.headers.get("x-internal-secret"), env.QRIS_INTERNAL_SECRET))) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let event;
  try {
    event = await readInternalJson(request);
  } catch (error) {
    const status = error.message === "payload_too_large" ? 413 : 400;
    return Response.json({ ok: false, error: error.message }, { status });
  }
  if (
    event.event !== "order.paid" ||
    !event.order_id ||
    !Number.isSafeInteger(Number(event.unique_amount)) ||
    !Number.isFinite(Number(event.paid_at))
  ) {
    return Response.json({ ok: false, error: "invalid_event" }, { status: 400 });
  }

  try {
    const result = await settleGatePayDeposit(env, event);
    if (!result.success || !result.deposit) {
      return Response.json(
        { ok: false, error: result.reason || "settlement_failed" },
        { status: 409 },
      );
    }

    if (!result.deposit.notification_sent_at) {
      await sendMessage(
        env,
        result.deposit.telegram_id,
        `✅ TOP UP BERHASIL\n\nPembayaran: ${formatRupiah(
          result.deposit.unique_amount,
        )}\nSaldo ditambahkan: ${formatRupiah(
          result.deposit.requested_amount,
        )}\nSaldo sekarang: ${formatRupiah(
          result.deposit.balance,
        )}\n\nSaldo sudah dapat digunakan untuk membuat foto atau video.`,
        MAIN_MENU,
      );
      await markDepositNotificationSent(env, event.order_id);
    }

    return Response.json(
      {
        ok: true,
        duplicate: Boolean(result.duplicate),
        user: {
          telegram_id: String(result.deposit.telegram_id),
          username: result.deposit.username ? String(result.deposit.username) : null,
          first_name: result.deposit.first_name ? String(result.deposit.first_name) : null,
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error(JSON.stringify({ event: "deposit_settlement_failed", message: error.message }));
    return Response.json({ ok: false, error: "settlement_failed" }, { status: 500 });
  }
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
  if (
    !kind ||
    !["Generate Foto", "Generate Video", "Edit Foto", "Foto ke Video"].includes(kind)
  ) {
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

  if (context.kind === "Edit Foto" || context.kind === "Foto ke Video") {
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

async function sendPhoto(env, chatId, image, caption, replyMarkup) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("photo", new Blob([image], { type: "image/png" }), "qris.png");
  form.append("caption", caption);
  if (replyMarkup) form.append("reply_markup", JSON.stringify(replyMarkup));

  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`,
    { method: "POST", body: form },
  );
  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(result.description || `Telegram API error ${response.status}`);
  }
  return result;
}

function parseTopupCallback(value) {
  const match = String(value || "").match(
    /^topup_(paid|cancel):(\d{1,7}):(\d{1,16}):([0-9a-z]+)$/,
  );
  if (!match) return null;
  const amount = Number(match[2]);
  const expiresAt = Number.parseInt(match[4], 36) * 60_000;
  if (!Number.isSafeInteger(amount) || amount < 1_000 || amount > 1_000_000) return null;
  if (!Number.isSafeInteger(expiresAt)) return null;
  return { action: match[1], amount, orderId: match[3], expiresAt };
}

async function telegramMethod(env, method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(result.description || `Telegram API error ${response.status}`);
  }
  return result;
}

async function ensureTelegramCallbackWebhook(env, origin) {
  if (!env.TELEGRAM_WEBHOOK_SECRET) {
    throw new Error("missing_telegram_webhook_secret");
  }
  const webhookUrl = new URL("/webhook", origin);
  if (webhookUrl.protocol !== "https:") {
    throw new Error("invalid_telegram_webhook_url");
  }
  await telegramMethod(env, "setWebhook", {
    url: webhookUrl.toString(),
    secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message", "callback_query"],
  });
  console.log(JSON.stringify({
    event: "telegram_callback_webhook_confirmed",
    webhook_url: webhookUrl.toString(),
  }));
}

async function handleTopupCallback(env, callback) {
  const parsed = parseTopupCallback(callback.data);
  if (!parsed) {
    await telegramMethod(env, "answerCallbackQuery", {
      callback_query_id: callback.id,
      text: "Tombol pembayaran tidak valid.",
      show_alert: true,
    });
    return;
  }

  if (Date.now() > parsed.expiresAt) {
    await telegramMethod(env, "answerCallbackQuery", {
      callback_query_id: callback.id,
      text: "Invoice sudah melewati batas konfirmasi 60 menit.",
      show_alert: true,
    });
    return;
  }

  const message = callback.message;
  if (!message?.chat?.id || !message.message_id) return;
  if (String(message.chat.id) !== String(callback.from.id)) {
    await telegramMethod(env, "answerCallbackQuery", {
      callback_query_id: callback.id,
      text: "Tombol invoice hanya dapat digunakan oleh pemilik pesanan.",
      show_alert: true,
    });
    return;
  }
  const username = callback.from.username ? `@${callback.from.username}` : "-";
  const name = callback.from.first_name || "Pengguna";
  const currentCaption = String(message.caption || "").replace(/\n\n(?:🟡|❌).+$/s, "");

  if (parsed.action === "cancel") {
    await telegramMethod(env, "answerCallbackQuery", {
      callback_query_id: callback.id,
      text: "Pesanan dibatalkan.",
    });
    await telegramMethod(env, "editMessageCaption", {
      chat_id: message.chat.id,
      message_id: message.message_id,
      caption: `${currentCaption}\n\n❌ Pesanan dibatalkan oleh pengguna.`,
      reply_markup: { inline_keyboard: [] },
    });
    return;
  }

  await telegramMethod(env, "answerCallbackQuery", {
    callback_query_id: callback.id,
    text: "Admin akan memeriksa pembayaran Anda.",
    show_alert: true,
  });
  await telegramMethod(env, "editMessageCaption", {
    chat_id: message.chat.id,
    message_id: message.message_id,
    caption: `${currentCaption}\n\n🟡 Menunggu pemeriksaan pembayaran oleh admin.`,
    reply_markup: { inline_keyboard: [] },
  });

  try {
    await notifyTransactionBot(env, {
      amount: parsed.amount,
      orderId: parsed.orderId,
      telegramId: String(callback.from.id),
      username: callback.from.username || "",
      firstName: name,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "transaction_bot_notification_failed",
        order_id: parsed.orderId,
        telegram_id: String(callback.from.id),
        message: error.message,
      }),
    );
    const adminIds = [...new Set(
      [env.ADMIN_TELEGRAM_ID, env.ADMIN2_TELEGRAM_ID]
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    )];
    await Promise.allSettled(
      adminIds.map((adminId) =>
        sendMessage(
          env,
          adminId,
          `⚠️ NOTIFIKASI CADANGAN TOP UP\n\nBot transaksi gagal menerima notifikasi.\nPengguna: ${name}\nUsername: ${username}\nID Telegram: ${callback.from.id}\nOrder ID: #${parsed.orderId}\nNominal: ${formatRupiah(parsed.amount)}\n\nPeriksa mutasi merchant secara manual.`,
        ),
      ),
    );
  }
}
