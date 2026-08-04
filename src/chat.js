import {
  CHAT_MODELS,
  beginChatRequest,
  clearChatMemory,
  completeChatAndCharge,
  endChatSession,
  failChatRequest,
  getActiveChatSession,
  getChatMemory,
  saveChatExchange,
  startChatSession,
} from "./chat-db.js";

const XAI_BASE_URL = "https://api.x.ai/v1";

export const CHAT_MENU = {
  keyboard: [
    [{ text: "⚡ Medium — Rp200/pesan" }],
    [{ text: "🧠 Paling Pintar — Rp500/pesan" }],
    [{ text: "🧾 Lihat Ingatan" }, { text: "🗑 Hapus Ingatan" }],
    [{ text: "⛔ Akhiri Chat AI" }],
    [{ text: "⬅️ Menu Utama" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: "Pilih model Chat AI...",
};

const RESERVED_TEXTS = new Set([
  "🖼 Generate Foto",
  "🎬 Generate Video",
  "💰 Harga",
  "✏️ Edit Foto",
  "👛 Saldo",
  "➕ Top Up",
  "📜 Riwayat Transaksi",
  "🆘 Bantuan",
  "✨ Buat Foto Baru",
  "🎞 Video Standard",
  "🚀 Video High Quality",
  "⬅️ Menu Utama",
  "⬅️ Kembali ke Foto",
  "⬅️ Kembali ke Video",
  "⬅️ Kembali ke Video Standard",
  "⬅️ Kembali ke Video High Quality",
]);

export function isReservedBotText(text) {
  const value = String(text || "").trim();
  return (
    RESERVED_TEXTS.has(value) ||
    /^(?:Edit )?(?:Standard|High Quality) [12]K — Rp[\d.]+$/i.test(value) ||
    /^(?:480p|720p|1080p)(?: HQ)? • \d+ detik — Rp[\d.]+$/i.test(value) ||
    /^(?:480p|720p|1080p) (?:Standard|High Quality)$/i.test(value)
  );
}

export async function handleChatControl(
  env,
  { chatId, telegramId, text, commandName, mainMenu },
) {
  if (text === "💬 Chat AI" || commandName === "chat" || commandName === "model") {
    await sendMessage(
      env,
      chatId,
      "💬 CHAT AI\n\nPilih model. Setiap pesan yang berhasil dijawab akan mengurangi saldo. Ingatan percakapan tersimpan sementara selama 24 jam.",
      CHAT_MENU,
    );
    return true;
  }

  if (text === "⚡ Medium — Rp200/pesan") {
    await startChatSession(env, telegramId, "grok-4.3");
    await sendMessage(
      env,
      chatId,
      "✅ CHAT AI MEDIUM AKTIF\n\nModel: grok-4.3\nBiaya: Rp200 per pesan\n\nSilakan kirim pesan atau tanyakan apa saja. Percakapan Anda dengan AI akan diingat sementara selama 24 jam.",
      CHAT_MENU,
    );
    return true;
  }

  if (text === "🧠 Paling Pintar — Rp500/pesan") {
    await startChatSession(env, telegramId, "grok-4.5");
    await sendMessage(
      env,
      chatId,
      "✅ CHAT AI PALING PINTAR AKTIF\n\nModel: grok-4.5\nBiaya: Rp500 per pesan\n\nSilakan kirim pesan atau tanyakan apa saja. Percakapan Anda dengan AI akan diingat sementara selama 24 jam.",
      CHAT_MENU,
    );
    return true;
  }

  if (text === "🗑 Hapus Ingatan" || commandName === "clearmemory") {
    await clearChatMemory(env, telegramId);
    await sendMessage(
      env,
      chatId,
      "🗑 Ingatan sementara Chat AI sudah dihapus.",
      CHAT_MENU,
    );
    return true;
  }

  if (text === "🧾 Lihat Ingatan" || commandName === "memory") {
    const memory = await getChatMemory(env, telegramId, 20);
    const body = memory.length
      ? memory
          .map((item) => `${item.role === "user" ? "Anda" : "AI"}: ${item.content}`)
          .join("\n\n")
          .slice(0, 3500)
      : "Belum ada percakapan yang tersimpan.";
    await sendMessage(env, chatId, `🧾 INGATAN SEMENTARA\n\n${body}`, CHAT_MENU);
    return true;
  }

  if (text === "⛔ Akhiri Chat AI" || commandName === "endchat") {
    await endChatSession(env, telegramId);
    await sendMessage(
      env,
      chatId,
      "Chat AI telah diakhiri. Ingatan tidak langsung dihapus dan akan kedaluwarsa otomatis setelah 24 jam.",
      mainMenu,
    );
    return true;
  }

  return false;
}

export async function handlePaidChat(
  env,
  { updateId, chatId, telegramId, text, mainMenu },
) {
  const session = await getActiveChatSession(env, telegramId);
  if (!session) return false;
  if (!text || text.startsWith("/") || isReservedBotText(text)) return false;

  const config = CHAT_MODELS[session.model];
  if (!config) return false;

  const started = await beginChatRequest(env, {
    telegramUpdateId: updateId,
    telegramId,
    model: session.model,
  });

  if (started.request?.status === "completed" && started.request.response_text) {
    await sendMessage(
      env,
      chatId,
      `${started.request.response_text}\n\n💳 Biaya: ${formatRupiah(config.price)}`,
      CHAT_MENU,
    );
    return true;
  }

  if (started.duplicate && started.request?.status === "processing") {
    await sendMessage(
      env,
      chatId,
      "⏳ Pesan Chat AI ini masih diproses. Mohon tunggu jawabannya.",
      CHAT_MENU,
    );
    return true;
  }

  if (started.request?.status !== "processing") {
    return true;
  }

  if (!started.canAfford) {
    await failChatRequest(env, updateId, "insufficient_balance");
    await sendMessage(
      env,
      chatId,
      `❌ SALDO TIDAK CUKUP\n\nBiaya Chat AI ${config.label}: ${formatRupiah(
        config.price,
      )}\nSaldo Anda: ${formatRupiah(started.user?.balance || 0)}`,
      mainMenu,
    );
    return true;
  }

  if (!env.XAI_API_KEY) {
    await failChatRequest(env, updateId, "missing_xai_api_key");
    await sendMessage(
      env,
      chatId,
      "⚠️ Chat AI belum dikonfigurasi. XAI_API_KEY belum tersedia.",
      mainMenu,
    );
    return true;
  }

  try {
    const memory = await getChatMemory(env, telegramId, 20);
    const answer = await requestChatCompletion(env, session.model, memory, text);
    const payment = await completeChatAndCharge(env, {
      telegramUpdateId: updateId,
      telegramId,
      model: session.model,
      responseText: answer,
    });

    if (!payment.charged) {
      await sendMessage(
        env,
        chatId,
        `❌ SALDO TIDAK CUKUP\n\nBiaya: ${formatRupiah(
          config.price,
        )}\nSaldo Anda: ${formatRupiah(payment.user?.balance || 0)}`,
        mainMenu,
      );
      return true;
    }

    await saveChatExchange(env, telegramId, text, answer);
    await sendMessage(
      env,
      chatId,
      `${answer}\n\n💳 Biaya: ${formatRupiah(
        config.price,
      )} • Sisa saldo: ${formatRupiah(payment.user?.balance || 0)}`,
      CHAT_MENU,
    );
  } catch (error) {
    await failChatRequest(
      env,
      updateId,
      error instanceof Error ? error.message : String(error),
    );
    console.error(
      JSON.stringify({
        event: "chat_ai_failed",
        telegram_id: String(telegramId),
        model: session.model,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    await sendMessage(
      env,
      chatId,
      "⚠️ Chat AI gagal menjawab. Saldo tidak dipotong. Silakan coba kembali.",
      CHAT_MENU,
    );
  }
  return true;
}

export async function appendChatMemoryToImagePrompt(env, telegramId, prompt) {
  const memory = await getChatMemory(env, telegramId, 20);
  if (!memory.length) return prompt;
  const context = memory
    .map((item) => `${item.role === "user" ? "Pengguna" : "Asisten"}: ${item.content}`)
    .join("\n")
    .slice(-6000);
  return (
    "Gunakan konteks percakapan berikut sebagai arahan visual yang konsisten. " +
    "Arahan terbaru mengoreksi arahan sebelumnya. Jangan gambar teks percakapan.\n\n" +
    `${context}\n\nPermintaan akhir pengguna: ${prompt}`
  );
}

async function requestChatCompletion(env, model, memory, userText) {
  const messages = [
    {
      role: "system",
      content:
        "Anda adalah asisten AI Grok yang didukung oleh xAI. Lakukan percakapan langsung dan alami dengan pengguna serta jawab pertanyaan mereka dengan jelas dan akurat dalam Bahasa Indonesia. Jangan menyebut bot Bikin Foto atau menawarkan pembuatan foto kecuali pengguna sendiri membahas atau memintanya. Ingat konteks percakapan yang diberikan dan terapkan koreksi terbaru. Jika ditanya identitas, jelaskan bahwa Anda adalah Grok dari xAI. Jangan mengaku sudah membuat gambar sebelum pengguna memilih menu Generate Foto.",
    },
    ...memory.map((item) => ({
      role: item.role === "assistant" ? "assistant" : "user",
      content: String(item.content).slice(0, 6000),
    })),
    { role: "user", content: String(userText).slice(0, 8000) },
  ];

  const response = await fetch(`${XAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.XAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 800,
      temperature: 0.7,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || data.message || `xAI HTTP ${response.status}`);
  }
  const answer = String(data.choices?.[0]?.message?.content || "").trim();
  if (!answer) throw new Error("xAI tidak mengembalikan jawaban.");
  return answer.slice(0, 12000);
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
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    throw new Error(data.description || `Telegram HTTP ${response.status}`);
  }
  return data;
}

function formatRupiah(value) {
  return `Rp${Number(value || 0).toLocaleString("id-ID")}`;
}
