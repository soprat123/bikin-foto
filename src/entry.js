import worker from "./index.js";

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
    [{ text: "🆘 Bantuan" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: "Pilih layanan...",
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (
      request.method === "POST" &&
      url.pathname === "/webhook" &&
      env.TELEGRAM_BOT_TOKEN &&
      env.TELEGRAM_WEBHOOK_SECRET &&
      request.headers.get("X-Telegram-Bot-Api-Secret-Token") ===
        env.TELEGRAM_WEBHOOK_SECRET
    ) {
      try {
        const update = await request.clone().json();
        const text = (update.message?.text || "").trim();
        const command = normalizeCommand(text);

        if (text === "🆘 Bantuan" || command === "bantuan") {
          ctx.waitUntil(
            sendSupportMessage(env, update.message.chat.id).catch((error) => {
              console.error("Gagal mengirim pesan bantuan:", error);
            }),
          );

          return new Response("OK");
        }
      } catch {
        // Biarkan worker utama menangani request yang bukan JSON Telegram valid.
      }
    }

    return worker.fetch(request, env, ctx);
  },
};

function normalizeCommand(text) {
  if (!text.startsWith("/")) return "";
  return text.split(/\s+/)[0].slice(1).split("@")[0].toLowerCase();
}

async function sendSupportMessage(env, chatId) {
  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: "🆘 BANTUAN\n\nHubungi admin pemilik bot @Abdulgoib jika ada kendala atau error pada bot",
        reply_markup: MAIN_MENU,
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
