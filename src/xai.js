const XAI_BASE_URL = "https://api.x.ai/v1";

export async function processPaidOrder(env, { order, message, chatId }) {
  if (!env.XAI_API_KEY) {
    await failAndRefund(env, order, chatId, "XAI_API_KEY belum dikonfigurasi.");
    return;
  }

  try {
    await updateOrder(env, order.id, {
      status: "processing",
      xai_model: selectModel(order),
      error_message: null,
    });

    if (order.kind === "Generate Video") {
      await startVideoGeneration(env, order, chatId);
      return;
    }

    const imageUrl =
      order.kind === "Edit Foto"
        ? await editImage(env, order, message)
        : await generateImage(env, order);

    await telegramApi(env, "sendPhoto", {
      chat_id: chatId,
      photo: imageUrl,
      caption: `✅ HASIL ${order.kind.toUpperCase()}\n\nOrder: #${order.id}\nBiaya: ${formatRupiah(order.price)}`,
    });

    await updateOrder(env, order.id, {
      status: "completed",
      result_url: imageUrl,
      error_message: null,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "Proses xAI gagal",
        order_id: order.id,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    await failAndRefund(
      env,
      order,
      chatId,
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function pollPendingVideos(env) {
  if (!env.XAI_API_KEY || !env.DB) return;

  const result = await env.DB.prepare(
    `SELECT id, telegram_id, price, xai_request_id
     FROM orders
     WHERE kind = 'Generate Video'
       AND status = 'processing'
       AND xai_request_id IS NOT NULL
     ORDER BY id ASC
     LIMIT 10`,
  ).all();

  for (const order of result.results || []) {
    try {
      const data = await xaiRequest(
        env,
        `/videos/${encodeURIComponent(order.xai_request_id)}`,
        { method: "GET" },
      );

      if (data.status === "done" && data.video?.url) {
        await telegramApi(env, "sendVideo", {
          chat_id: order.telegram_id,
          video: data.video.url,
          caption: `✅ HASIL GENERATE VIDEO\n\nOrder: #${order.id}\nBiaya: ${formatRupiah(order.price)}`,
        });
        await updateOrder(env, order.id, {
          status: "completed",
          result_url: data.video.url,
          error_message: null,
        });
      } else if (data.status === "failed" || data.status === "expired") {
        await failAndRefund(
          env,
          order,
          order.telegram_id,
          `Video xAI berstatus ${data.status}.`,
        );
      }
    } catch (error) {
      console.error(
        JSON.stringify({
          message: "Pemeriksaan video xAI gagal",
          order_id: order.id,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
}

async function generateImage(env, order) {
  const data = await xaiRequest(env, "/images/generations", {
    method: "POST",
    body: {
      model: selectModel(order),
      prompt: order.prompt,
      resolution: normalizeImageResolution(order.resolution),
      n: 1,
    },
  });

  const url = data.data?.[0]?.url;
  if (!url) throw new Error("xAI tidak mengembalikan URL gambar.");
  return url;
}

async function editImage(env, order, message) {
  const photo = message.photo?.at(-1);
  if (!photo?.file_id) throw new Error("Foto sumber tidak ditemukan.");

  const imageUrl = await getTelegramFileUrl(env, photo.file_id);
  const data = await xaiRequest(env, "/images/edits", {
    method: "POST",
    body: {
      model: selectModel(order),
      prompt: order.prompt,
      image: {
        url: imageUrl,
        type: "image_url",
      },
      resolution: normalizeImageResolution(order.resolution),
      n: 1,
    },
  });

  const url = data.data?.[0]?.url;
  if (!url) throw new Error("xAI tidak mengembalikan URL hasil edit.");
  return url;
}

async function startVideoGeneration(env, order, chatId) {
  const data = await xaiRequest(env, "/videos/generations", {
    method: "POST",
    body: {
      model: selectModel(order),
      prompt: order.prompt,
      duration: parseDuration(order.duration),
      aspect_ratio: "16:9",
      resolution: normalizeVideoResolution(order.resolution),
    },
  });

  if (!data.request_id) {
    throw new Error("xAI tidak mengembalikan request_id video.");
  }

  await updateOrder(env, order.id, {
    status: "processing",
    xai_request_id: data.request_id,
    error_message: null,
  });

  await telegramApi(env, "sendMessage", {
    chat_id: chatId,
    text:
      `⏳ VIDEO SEDANG DIPROSES\n\nOrder: #${order.id}\n` +
      `Resolusi: ${order.resolution || "-"}\nDurasi: ${order.duration || "-"}\n\n` +
      "Bot akan mengirim videonya otomatis setelah xAI selesai.",
  });
}

function selectModel(order) {
  const highQuality = String(order.quality || "").toLowerCase().includes("high");
  if (order.kind === "Generate Video") {
    return highQuality ? "grok-imagine-video-1.5" : "grok-imagine-video";
  }
  return highQuality
    ? "grok-imagine-image-quality"
    : "grok-imagine-image";
}

function normalizeImageResolution(value) {
  return String(value || "1K").toLowerCase() === "2k" ? "2k" : "1k";
}

function normalizeVideoResolution(value) {
  const resolution = String(value || "480p").toLowerCase();
  return ["480p", "720p", "1080p"].includes(resolution)
    ? resolution
    : "480p";
}

function parseDuration(value) {
  const duration = Number.parseInt(String(value || "5"), 10);
  return Math.max(1, Math.min(duration || 5, 15));
}

async function getTelegramFileUrl(env, fileId) {
  const data = await telegramApi(env, "getFile", { file_id: fileId });
  if (!data.result?.file_path) {
    throw new Error("Telegram tidak mengembalikan lokasi foto.");
  }
  return `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${data.result.file_path}`;
}

async function xaiRequest(env, path, { method, body } = {}) {
  const response = await fetch(`${XAI_BASE_URL}${path}`, {
    method: method || "GET",
    headers: {
      Authorization: `Bearer ${env.XAI_API_KEY}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      data.error?.message || data.message || `HTTP ${response.status}`;
    throw new Error(`xAI API: ${detail}`);
  }
  return data;
}

async function telegramApi(env, method, payload) {
  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    throw new Error(
      `Telegram API: ${data.description || `HTTP ${response.status}`}`,
    );
  }
  return data;
}

async function updateOrder(env, orderId, fields) {
  const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
  if (!entries.length) return;

  const allowed = new Set([
    "status",
    "result_url",
    "xai_request_id",
    "xai_model",
    "error_message",
  ]);
  if (entries.some(([key]) => !allowed.has(key))) {
    throw new Error("Kolom update order tidak diizinkan.");
  }

  const assignments = entries.map(([key]) => `${key} = ?`).join(", ");
  await env.DB.prepare(
    `UPDATE orders SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
  )
    .bind(...entries.map(([, value]) => value), orderId)
    .run();
}

async function failAndRefund(env, order, chatId, errorMessage) {
  const db = env.DB;
  if (!db) return;

  const referenceId = `auto-refund:${order.id}`;
  const existing = await db
    .prepare("SELECT id FROM transactions WHERE reference_id = ?")
    .bind(referenceId)
    .first();

  if (!existing) {
    await db.batch([
      db
        .prepare(
          `UPDATE users
           SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP
           WHERE telegram_id = ?`,
        )
        .bind(order.price, String(order.telegram_id)),
      db
        .prepare(
          `INSERT OR IGNORE INTO transactions (
             telegram_id, type, amount, balance_after, description, reference_id
           )
           SELECT telegram_id, 'refund', ?, balance, ?, ?
           FROM users WHERE telegram_id = ?`,
        )
        .bind(
          order.price,
          `Refund otomatis order #${order.id}`,
          referenceId,
          String(order.telegram_id),
        ),
      db
        .prepare(
          `UPDATE orders
           SET status = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        )
        .bind(String(errorMessage).slice(0, 1000), order.id),
    ]);
  }

  await telegramApi(env, "sendMessage", {
    chat_id: chatId,
    text:
      `❌ PESANAN GAGAL\n\nOrder: #${order.id}\n` +
      `Saldo ${formatRupiah(order.price)} telah dikembalikan otomatis.\n\n` +
      "Silakan coba lagi atau hubungi @Abdulgoib.",
  });
}

function formatRupiah(value) {
  return `Rp${Number(value || 0).toLocaleString("id-ID")}`;
}
