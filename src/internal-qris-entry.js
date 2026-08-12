import legacyEntry from "./entry.js";
import {
  attachGatePayOrder,
  createPendingDeposit,
  markDepositFailed,
  upsertUser,
} from "./db.js";
import {
  buildInternalTopupInvoice,
  cancelInternalQrisOrder,
  createInternalQrisOrder,
  getInternalQrisOrder,
  getInternalQrisPng,
} from "./internal-qris-payments.js";

function isVerifiedTelegramWebhook(request, url, env) {
  return (
    request.method === "POST" &&
    url.pathname === "/webhook" &&
    env.TELEGRAM_BOT_TOKEN &&
    env.TELEGRAM_WEBHOOK_SECRET &&
    request.headers.get("X-Telegram-Bot-Api-Secret-Token") === env.TELEGRAM_WEBHOOK_SECRET
  );
}

function isTopUpReply(message) {
  return String(message?.reply_to_message?.text || "").startsWith("➕ TOP UP SALDO");
}

function parseAmount(value) {
  const raw = String(value || "").trim().toLowerCase().replace(/^rp\s*/, "");
  const amount = raw.endsWith("k")
    ? Math.round(Number(raw.slice(0, -1).replace(",", ".")) * 1000)
    : Number(raw.replace(/[.,\s]/g, ""));
  return Number.isSafeInteger(amount) ? amount : 0;
}

function rupiah(value) {
  return `Rp${Number(value || 0).toLocaleString("id-ID")}`;
}

async function telegramJson(env, method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(result.description || `telegram_http_${response.status}`);
  }
  return result;
}

async function sendMessage(env, chatId, text) {
  return telegramJson(env, "sendMessage", { chat_id: chatId, text, disable_web_page_preview: true });
}

async function sendPhoto(env, chatId, image, caption) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("photo", new Blob([image], { type: "image/png" }), "qris.png");
  form.append("caption", caption);
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
    method: "POST",
    body: form,
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(result.description || `telegram_http_${response.status}`);
  }
  return result;
}

async function handleInternalTopup(env, update, message) {
  const chatId = message.chat.id;
  const telegramId = String(message.from.id);
  const amount = parseAmount(message.text);
  if (amount < 1_000 || amount > 1_000_000) {
    await sendMessage(
      env,
      chatId,
      "Nominal top up harus Rp1.000 sampai Rp1.000.000. Balas kembali dengan angka, contoh: 10000.",
    );
    return new Response("OK");
  }

  let user;
  try {
    user = await upsertUser(env, message.from);
  } catch (error) {
    console.error(JSON.stringify({ event: "internal_qris_user_upsert_failed", message: error.message }));
    await sendMessage(env, chatId, "⚠️ Database saldo sedang tidak dapat diakses. Silakan coba lagi nanti.");
    return new Response("OK");
  }
  if (user?.is_blocked) {
    await sendMessage(env, chatId, "⛔ Akun Anda diblokir oleh admin. Hubungi @Abdulgoib untuk bantuan.");
    return new Response("OK");
  }

  let deposit = await createPendingDeposit(env, telegramId, update.update_id, amount);
  if (deposit?.status === "paid") {
    await sendMessage(env, chatId, "✅ Top up ini sudah dibayar dan diproses.");
    return new Response("OK");
  }
  if (deposit?.status === "failed") {
    await sendMessage(env, chatId, "⚠️ Invoice sebelumnya gagal dibuat. Silakan kirim nominal top up lagi untuk membuat invoice baru.");
    return new Response("OK");
  }

  let gatewayOrder = null;
  let cancelToken = null;
  try {
    if (deposit?.status === "creating") {
      const created = await createInternalQrisOrder(env, {
        amount,
        reference: deposit.reference,
        telegramId,
        username: message.from.username || "",
        firstName: message.from.first_name || "",
      });
      gatewayOrder = created.order;
      cancelToken = created.cancel_token || null;
      try {
        deposit = await attachGatePayOrder(env, deposit.reference, gatewayOrder);
      } catch (error) {
        await cancelInternalQrisOrder(env, gatewayOrder.id, cancelToken).catch(() => false);
        throw error;
      }
    } else if (deposit?.gatepay_order_id) {
      gatewayOrder = await getInternalQrisOrder(env, deposit.gatepay_order_id);
    }

    if (!deposit?.gatepay_order_id || !gatewayOrder?.id || deposit.status !== "pending") {
      throw new Error("deposit_order_not_ready");
    }
    if (gatewayOrder.status !== "pending") {
      throw new Error(`gateway_order_${gatewayOrder.status}`);
    }

    const caption = buildInternalTopupInvoice({
      baseAmount: Number(deposit.requested_amount),
      uniqueAmount: Number(deposit.unique_amount),
      orderId: gatewayOrder.id,
      checkoutUrl: String(deposit.checkout_url || gatewayOrder.checkout_url),
      expiresAt: Number(gatewayOrder.expires_at || 0),
    });

    try {
      const image = await getInternalQrisPng(env, gatewayOrder.id);
      await sendPhoto(env, chatId, image, caption);
    } catch (imageError) {
      console.error(JSON.stringify({
        event: "internal_qris_image_failed",
        order_id: gatewayOrder.id,
        message: imageError.message,
      }));
      await sendMessage(
        env,
        chatId,
        `${caption}\n\nQRIS gambar gagal dimuat. Buka checkout untuk melihat QRIS: ${deposit.checkout_url}`,
      );
    }

    console.log(JSON.stringify({
      event: "internal_qris_topup_created",
      order_id: gatewayOrder.id,
      reference: deposit.reference,
      telegram_id: telegramId,
      base_amount: Number(deposit.requested_amount),
      unique_amount: Number(deposit.unique_amount),
    }));
    return new Response("OK");
  } catch (error) {
    if (deposit?.reference && deposit.status === "creating") {
      await markDepositFailed(env, deposit.reference).catch(() => {});
    }
    console.error(JSON.stringify({
      event: "internal_qris_topup_failed",
      telegram_id: telegramId,
      amount,
      message: error.message,
    }));
    const messages = {
      missing_qris_payment_url: "⚠️ QRIS_PAYMENT_URL belum terbaca di Worker bikin-foto.",
      missing_qris_internal_secret: "⚠️ QRIS_INTERNAL_SECRET belum terbaca di Worker bikin-foto.",
      unauthorized: "⚠️ Gateway QRIS menolak koneksi internal. Periksa QRIS_INTERNAL_SECRET.",
      server_not_configured: "⚠️ Gateway QRIS belum dikonfigurasi lengkap.",
      unique_amount_unavailable: "⚠️ Nominal unik sedang penuh. Silakan coba lagi beberapa saat lagi.",
    };
    await sendMessage(
      env,
      chatId,
      messages[error.message] || `⚠️ Gagal membuat invoice QRIS: ${String(error.message || "unknown_error").slice(0, 120)}`,
    );
    return new Response("OK");
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!isVerifiedTelegramWebhook(request, url, env)) {
      return legacyEntry.fetch(request, env, ctx);
    }

    let update;
    try {
      update = await request.clone().json();
    } catch {
      return legacyEntry.fetch(request, env, ctx);
    }
    const message = update.message;
    if (!message?.chat?.id || !message.from?.id || !isTopUpReply(message)) {
      return legacyEntry.fetch(request, env, ctx);
    }

    return handleInternalTopup(env, update, message);
  },

  async scheduled(controller, env, ctx) {
    if (typeof legacyEntry.scheduled === "function") {
      return legacyEntry.scheduled(controller, env, ctx);
    }
  },
};
