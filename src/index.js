const MAIN_MENU = {
  keyboard: [
    [
      { text: "🖼 Generate Gambar" },
      { text: "🎬 Generate Video" },
    ],
    [
      { text: "💰 Harga" },
      { text: "➕ Top Up" },
    ],
    [
      { text: "👛 Saldo" },
      { text: "🆘 Bantuan" },
    ],
  ],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: "Pilih layanan...",
};

const BOT_COMMANDS = [
  { command: "start", description: "Mulai menggunakan bot" },
  { command: "gambar", description: "Generate gambar AI" },
  { command: "video", description: "Generate video AI" },
  { command: "harga", description: "Lihat daftar harga" },
  { command: "topup", description: "Isi saldo" },
  { command: "saldo", description: "Periksa saldo" },
  { command: "bantuan", description: "Hubungi bantuan" },
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return jsonResponse({
        ok: true,
        service: "Bikin Foto Telegram Bot",
        status: "active",
        note: "Gunakan /setup untuk memasang webhook Telegram.",
      });
    }

    if (request.method === "GET" && url.pathname === "/setup") {
      return setupTelegram(url, env);
    }

    if (request.method === "GET" && url.pathname === "/status") {
      return webhookStatus(url, env);
    }

    if (url.pathname !== "/webhook") {
      return new Response("Not found", { status: 404 });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const missing = requiredSecrets(env);
    if (missing.length > 0) {
      console.error(`Secret belum lengkap: ${missing.join(", ")}`);
      return new Response("Server belum dikonfigurasi", { status: 500 });
    }

    const telegramSecret = request.headers.get(
      "X-Telegram-Bot-Api-Secret-Token",
    );

    if (telegramSecret !== env.TELEGRAM_WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    let update;
    try {
      update = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    ctx.waitUntil(
      handleUpdate(update, env).catch((error) => {
        console.error("Gagal menangani update Telegram:", error);
      }),
    );

    return new Response("OK");
  },
};

async function setupTelegram(url, env) {
  const authError = verifySetupKey(url, env);
  if (authError) return authError;

  const missing = requiredSecrets(env);
  if (missing.length > 0) {
    return jsonResponse(
      {
        ok: false,
        error: `Secret belum lengkap: ${missing.join(", ")}`,
      },
      500,
    );
  }

  const webhookUrl = `${url.origin}/webhook`;

  const webhook = await telegramApi(env, "setWebhook", {
    url: webhookUrl,
    secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message"],
    drop_pending_updates: true,
  });

  const commands = await telegramApi(env, "setMyCommands", {
    commands: BOT_COMMANDS,
  });

  return jsonResponse({
    ok: true,
    webhook_url: webhookUrl,
    webhook,
    commands,
  });
}

async function webhookStatus(url, env) {
  const authError = verifySetupKey(url, env);
  if (authError) return authError;

  if (!env.TELEGRAM_BOT_TOKEN) {
    return jsonResponse(
      { ok: false, error: "TELEGRAM_BOT_TOKEN belum diisi." },
      500,
    );
  }

  const result = await telegramApi(env, "getWebhookInfo");
  return jsonResponse(result);
}

function verifySetupKey(url, env) {
  if (!env.SETUP_KEY) {
    return jsonResponse(
      { ok: false, error: "SETUP_KEY belum diisi di Cloudflare." },
      500,
    );
  }

  if (url.searchParams.get("key") !== env.SETUP_KEY) {
    return jsonResponse({ ok: false, error: "Tidak diizinkan." }, 401);
  }

  return null;
}

function requiredSecrets(env) {
  return [
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_WEBHOOK_SECRET",
    "SETUP_KEY",
  ].filter((key) => !env[key]);
}

async function handleUpdate(update, env) {
  const message = update.message;
  if (!message?.chat?.id) return;

  const chatId = message.chat.id;
  const firstName = message.from?.first_name || "Pengguna";
  const text = (message.text || "").trim();
  const command = normalizeCommand(text);

  if (command.name === "start") {
    await sendMessage(
      env,
      chatId,
      `Selamat datang, ${firstName}! 👋\n\nBikin Foto menyediakan layanan pembuatan gambar dan video menggunakan AI.\n\nSilakan pilih menu di bawah.`,
      MAIN_MENU,
    );
    return;
  }

  if (text === "💰 Harga" || command.name === "harga") {
    await sendMessage(
      env,
      chatId,
      `💰 DAFTAR HARGA\n\n🖼 Generate gambar AI\n• Standar: mulai Rp2.000\n• Kualitas tinggi: mulai Rp3.500\n\n🎬 Generate video AI\n• 480p: harga berdasarkan durasi\n• 720p: harga berdasarkan durasi\n\nHarga akhir dapat diperbarui setelah integrasi xAI aktif.`,
      MAIN_MENU,
    );
    return;
  }

  if (text === "🖼 Generate Gambar" || command.name === "gambar") {
    if (command.name === "gambar" && command.argument) {
      await sendMessage(
        env,
        chatId,
        `🖼 Prompt gambar diterima:\n\n${command.argument}\n\nFitur xAI belum disambungkan. Setelah API aktif, bot akan memproses prompt ini secara otomatis.`,
        MAIN_MENU,
      );
      return;
    }

    await sendMessage(
      env,
      chatId,
      `🖼 GENERATE GAMBAR\n\nKirim prompt menggunakan format:\n\n/gambar seekor kucing memakai jas sedang berada di kantor\n\nIntegrasi xAI akan ditambahkan pada tahap berikutnya.`,
      MAIN_MENU,
    );
    return;
  }

  if (text === "🎬 Generate Video" || command.name === "video") {
    if (command.name === "video" && command.argument) {
      await sendMessage(
        env,
        chatId,
        `🎬 Prompt video diterima:\n\n${command.argument}\n\nFitur xAI belum disambungkan. Nanti Anda dapat memilih resolusi 480p/720p dan durasi video.`,
        MAIN_MENU,
      );
      return;
    }

    await sendMessage(
      env,
      chatId,
      `🎬 GENERATE VIDEO\n\nKirim prompt menggunakan format:\n\n/video pemandangan pantai saat matahari terbenam\n\nPilihan yang akan tersedia:\n• 480p atau 720p\n• Durasi sesuai batas model xAI`,
      MAIN_MENU,
    );
    return;
  }

  if (text === "➕ Top Up" || command.name === "topup") {
    await sendMessage(
      env,
      chatId,
      `➕ TOP UP SALDO\n\nPembayaran QRIS sedang menunggu aktivasi DOKU Merchant.\n\nSetelah aktif, bot akan membuat QRIS dan menambah saldo otomatis setelah pembayaran berhasil.`,
      MAIN_MENU,
    );
    return;
  }

  if (text === "👛 Saldo" || command.name === "saldo") {
    await sendMessage(
      env,
      chatId,
      "👛 Saldo Anda saat ini: Rp0",
      MAIN_MENU,
    );
    return;
  }

  if (text === "🆘 Bantuan" || command.name === "bantuan") {
    const support = env.SUPPORT_USERNAME
      ? `Hubungi @${env.SUPPORT_USERNAME.replace(/^@/, "")}`
      : "Hubungi admin pemilik bot.";

    await sendMessage(
      env,
      chatId,
      `🆘 BANTUAN\n\n${support}\n\nJangan pernah memberikan kode OTP, password, token bot, atau API key kepada siapa pun.`,
      MAIN_MENU,
    );
    return;
  }

  await sendMessage(
    env,
    chatId,
    "Perintah belum dikenali. Silakan pilih menu di bawah.",
    MAIN_MENU,
  );
}

function normalizeCommand(text) {
  if (!text.startsWith("/")) {
    return { name: "", argument: "" };
  }

  const [rawCommand, ...rest] = text.split(/\s+/);
  const name = rawCommand.slice(1).split("@")[0].toLowerCase();

  return {
    name,
    argument: rest.join(" ").trim(),
  };
}

async function sendMessage(env, chatId, text, replyMarkup) {
  return telegramApi(env, "sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: replyMarkup,
  });
}

async function telegramApi(env, method, payload = {}) {
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN belum diisi.");
  }

  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
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

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Cache-Control": "no-store",
    },
  });
}
