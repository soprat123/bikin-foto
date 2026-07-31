const MAIN_MENU = keyboard(
  [
    ["🖼 Generate Foto", "🎬 Generate Video"],
    ["💰 Harga", "✏️ Edit Foto"],
    ["👛 Saldo", "➕ Top Up"],
    ["📜 Riwayat Transaksi"],
    ["🆘 Bantuan"],
  ],
  "Pilih layanan...",
);

const FOTO_MENU = keyboard(
  [["✨ Buat Foto Baru"], ["✏️ Edit Foto"], ["⬅️ Menu Utama"]],
  "Pilih menu foto...",
);

const FOTO_GENERATE_MENU = keyboard(
  [
    ["Standard 1K — Rp500"],
    ["Standard 2K — Rp500"],
    ["High Quality 1K — Rp1.000"],
    ["High Quality 2K — Rp1.500"],
    ["⬅️ Kembali ke Foto"],
  ],
  "Pilih kualitas foto...",
);

const FOTO_EDIT_MENU = keyboard(
  [
    ["Edit Standard 1K — Rp500"],
    ["Edit Standard 2K — Rp500"],
    ["Edit High Quality 1K — Rp1.000"],
    ["Edit High Quality 2K — Rp1.500"],
    ["⬅️ Kembali ke Foto"],
  ],
  "Pilih kualitas edit foto...",
);

const VIDEO_MENU = keyboard(
  [["🎞 Video Standard"], ["🚀 Video High Quality"], ["⬅️ Menu Utama"]],
  "Pilih kualitas video...",
);

const VIDEO_STANDARD_MENU = keyboard(
  [["480p Standard"], ["720p Standard"], ["⬅️ Kembali ke Video"]],
  "Pilih resolusi video standard...",
);

const VIDEO_STANDARD_480_MENU = keyboard(
  [
    ["480p • 5 detik — Rp5.000"],
    ["480p • 10 detik — Rp10.000"],
    ["480p • 15 detik — Rp15.000"],
    ["⬅️ Kembali ke Video Standard"],
  ],
  "Pilih durasi video 480p standard...",
);

const VIDEO_STANDARD_720_MENU = keyboard(
  [
    ["720p • 5 detik — Rp7.000"],
    ["720p • 10 detik — Rp15.000"],
    ["720p • 15 detik — Rp20.000"],
    ["⬅️ Kembali ke Video Standard"],
  ],
  "Pilih durasi video 720p standard...",
);

const VIDEO_HQ_MENU = keyboard(
  [
    ["480p High Quality"],
    ["720p High Quality"],
    ["1080p High Quality"],
    ["⬅️ Kembali ke Video"],
  ],
  "Pilih resolusi video high quality...",
);

const VIDEO_HQ_480_MENU = keyboard(
  [
    ["480p HQ • 5 detik — Rp8.000"],
    ["480p HQ • 10 detik — Rp16.000"],
    ["480p HQ • 15 detik — Rp23.000"],
    ["⬅️ Kembali ke Video High Quality"],
  ],
  "Pilih durasi video high quality 480p...",
);

const VIDEO_HQ_720_MENU = keyboard(
  [
    ["720p HQ • 5 detik — Rp14.000"],
    ["720p HQ • 10 detik — Rp27.000"],
    ["720p HQ • 15 detik — Rp40.000"],
    ["⬅️ Kembali ke Video High Quality"],
  ],
  "Pilih durasi video high quality 720p...",
);

const VIDEO_HQ_1080_MENU = keyboard(
  [
    ["1080p HQ • 5 detik — Rp24.000"],
    ["1080p HQ • 10 detik — Rp47.000"],
    ["1080p HQ • 15 detik — Rp70.000"],
    ["⬅️ Kembali ke Video High Quality"],
  ],
  "Pilih durasi video high quality 1080p...",
);

const BOT_COMMANDS = [
  { command: "start", description: "Mulai menggunakan bot" },
  { command: "menu", description: "Tampilkan menu utama" },
  { command: "foto", description: "Menu generate foto" },
  { command: "editfoto", description: "Menu edit foto" },
  { command: "video", description: "Menu generate video" },
  { command: "harga", description: "Lihat daftar harga" },
  { command: "topup", description: "Isi saldo" },
  { command: "saldo", description: "Periksa saldo" },
  { command: "riwayat", description: "Lihat riwayat transaksi" },
  { command: "bantuan", description: "Hubungi bantuan" },
];

const PRICE_LIST_TEXT = `💰 DAFTAR HARGA BIKIN FOTO

━━━━━━━━━━━━━━━━━━
🖼 GENERATE FOTO
━━━━━━━━━━━━━━━━━━

STANDARD
• 1K — Rp500
• 2K — Rp500

HIGH QUALITY
• 1K — Rp1.000
• 2K — Rp1.500

━━━━━━━━━━━━━━━━━━
🎬 VIDEO STANDARD
━━━━━━━━━━━━━━━━━━

480p
• 5 detik — Rp5.000
• 10 detik — Rp10.000
• 15 detik — Rp15.000

720p
• 5 detik — Rp7.000
• 10 detik — Rp15.000
• 15 detik — Rp20.000

━━━━━━━━━━━━━━━━━━
🚀 VIDEO HIGH QUALITY
━━━━━━━━━━━━━━━━━━

480p
• 5 detik — Rp8.000
• 10 detik — Rp16.000
• 15 detik — Rp23.000

720p
• 5 detik — Rp14.000
• 10 detik — Rp27.000
• 15 detik — Rp40.000

1080p
• 5 detik — Rp24.000
• 10 detik — Rp47.000
• 15 detik — Rp70.000

━━━━━━━━━━━━━━━━━━
✏️ EDIT FOTO
━━━━━━━━━━━━━━━━━━

STANDARD
• 1K — Rp500
• 2K — Rp500

HIGH QUALITY
• 1K — Rp1.000
• 2K — Rp1.500

━━━━━━━━━━━━━━━━━━
📝 INFORMASI
━━━━━━━━━━━━━━━━━━

• Pembayaran menggunakan saldo bot.
• Saldo dipotong setelah pesanan dikonfirmasi.
• Waktu proses bergantung pada antrean server.
• Hasil setiap proses dapat berbeda.`;

const PHOTO_GENERATE_OPTIONS = {
  "Standard 1K — Rp500": {
    kind: "Generate Foto",
    quality: "Standard",
    resolution: "1K",
    price: "Rp500",
  },
  "Standard 2K — Rp500": {
    kind: "Generate Foto",
    quality: "Standard",
    resolution: "2K",
    price: "Rp500",
  },
  "High Quality 1K — Rp1.000": {
    kind: "Generate Foto",
    quality: "High Quality",
    resolution: "1K",
    price: "Rp1.000",
  },
  "High Quality 2K — Rp1.500": {
    kind: "Generate Foto",
    quality: "High Quality",
    resolution: "2K",
    price: "Rp1.500",
  },
};

const PHOTO_EDIT_OPTIONS = {
  "Edit Standard 1K — Rp500": {
    kind: "Edit Foto",
    quality: "Standard",
    resolution: "1K",
    price: "Rp500",
  },
  "Edit Standard 2K — Rp500": {
    kind: "Edit Foto",
    quality: "Standard",
    resolution: "2K",
    price: "Rp500",
  },
  "Edit High Quality 1K — Rp1.000": {
    kind: "Edit Foto",
    quality: "High Quality",
    resolution: "1K",
    price: "Rp1.000",
  },
  "Edit High Quality 2K — Rp1.500": {
    kind: "Edit Foto",
    quality: "High Quality",
    resolution: "2K",
    price: "Rp1.500",
  },
};

const VIDEO_GENERATE_OPTIONS = {
  "480p • 5 detik — Rp5.000": {
    kind: "Generate Video",
    quality: "Standard",
    resolution: "480p",
    duration: "5 detik",
    price: "Rp5.000",
  },
  "480p • 10 detik — Rp10.000": {
    kind: "Generate Video",
    quality: "Standard",
    resolution: "480p",
    duration: "10 detik",
    price: "Rp10.000",
  },
  "480p • 15 detik — Rp15.000": {
    kind: "Generate Video",
    quality: "Standard",
    resolution: "480p",
    duration: "15 detik",
    price: "Rp15.000",
  },
  "720p • 5 detik — Rp7.000": {
    kind: "Generate Video",
    quality: "Standard",
    resolution: "720p",
    duration: "5 detik",
    price: "Rp7.000",
  },
  "720p • 10 detik — Rp15.000": {
    kind: "Generate Video",
    quality: "Standard",
    resolution: "720p",
    duration: "10 detik",
    price: "Rp15.000",
  },
  "720p • 15 detik — Rp20.000": {
    kind: "Generate Video",
    quality: "Standard",
    resolution: "720p",
    duration: "15 detik",
    price: "Rp20.000",
  },
  "480p HQ • 5 detik — Rp8.000": {
    kind: "Generate Video",
    quality: "High Quality",
    resolution: "480p",
    duration: "5 detik",
    price: "Rp8.000",
  },
  "480p HQ • 10 detik — Rp16.000": {
    kind: "Generate Video",
    quality: "High Quality",
    resolution: "480p",
    duration: "10 detik",
    price: "Rp16.000",
  },
  "480p HQ • 15 detik — Rp23.000": {
    kind: "Generate Video",
    quality: "High Quality",
    resolution: "480p",
    duration: "15 detik",
    price: "Rp23.000",
  },
  "720p HQ • 5 detik — Rp14.000": {
    kind: "Generate Video",
    quality: "High Quality",
    resolution: "720p",
    duration: "5 detik",
    price: "Rp14.000",
  },
  "720p HQ • 10 detik — Rp27.000": {
    kind: "Generate Video",
    quality: "High Quality",
    resolution: "720p",
    duration: "10 detik",
    price: "Rp27.000",
  },
  "720p HQ • 15 detik — Rp40.000": {
    kind: "Generate Video",
    quality: "High Quality",
    resolution: "720p",
    duration: "15 detik",
    price: "Rp40.000",
  },
  "1080p HQ • 5 detik — Rp24.000": {
    kind: "Generate Video",
    quality: "High Quality",
    resolution: "1080p",
    duration: "5 detik",
    price: "Rp24.000",
  },
  "1080p HQ • 10 detik — Rp47.000": {
    kind: "Generate Video",
    quality: "High Quality",
    resolution: "1080p",
    duration: "10 detik",
    price: "Rp47.000",
  },
  "1080p HQ • 15 detik — Rp70.000": {
    kind: "Generate Video",
    quality: "High Quality",
    resolution: "1080p",
    duration: "15 detik",
    price: "Rp70.000",
  },
};

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
  const caption = (message.caption || "").trim();
  const command = normalizeCommand(text);
  const replyContext = parseReplyContext(message.reply_to_message?.text || "");

  if (replyContext) {
    await handleReplyContext(env, chatId, message, replyContext);
    return;
  }

  if (
    command.name === "start" ||
    command.name === "menu" ||
    text === "⬅️ Menu Utama"
  ) {
    await sendMessage(
      env,
      chatId,
      `Selamat datang, ${firstName}! 👋\n\nBikin Foto menyediakan layanan pembuatan gambar dan video menggunakan API xAI, harga mulai dari 500 perak.\n\nSilakan pilih menu di bawah.`,
      MAIN_MENU,
    );
    return;
  }

  if (text === "💰 Harga" || command.name === "harga") {
    await sendMessage(env, chatId, PRICE_LIST_TEXT, MAIN_MENU);
    return;
  }

  if (
    text === "🖼 Generate Foto" ||
    text === "🖼 Generate Gambar" ||
    command.name === "foto" ||
    command.name === "gambar"
  ) {
    await sendMessage(
      env,
      chatId,
      "🖼 GENERATE FOTO\n\nPilih jenis proses yang ingin Anda gunakan.",
      FOTO_MENU,
    );
    return;
  }

  if (text === "✨ Buat Foto Baru") {
    await sendMessage(
      env,
      chatId,
      "🖼 BUAT FOTO BARU\n\nPilih kualitas dan resolusi hasil foto.",
      FOTO_GENERATE_MENU,
    );
    return;
  }

  if (text === "✏️ Edit Foto" || command.name === "editfoto") {
    await sendMessage(
      env,
      chatId,
      "✏️ EDIT FOTO\n\nPilih kualitas dan resolusi hasil edit foto.",
      FOTO_EDIT_MENU,
    );
    return;
  }

  if (text === "⬅️ Kembali ke Foto") {
    await sendMessage(
      env,
      chatId,
      "🖼 GENERATE FOTO\n\nPilih jenis proses yang ingin Anda gunakan.",
      FOTO_MENU,
    );
    return;
  }

  if (PHOTO_GENERATE_OPTIONS[text]) {
    await requestGeneratePhotoPrompt(
      env,
      chatId,
      PHOTO_GENERATE_OPTIONS[text],
    );
    return;
  }

  if (PHOTO_EDIT_OPTIONS[text]) {
    await requestEditPhotoUpload(env, chatId, PHOTO_EDIT_OPTIONS[text]);
    return;
  }

  if (text === "🎬 Generate Video" || command.name === "video") {
    await sendMessage(
      env,
      chatId,
      "🎬 GENERATE VIDEO\n\nPilih kualitas video yang ingin Anda buat.",
      VIDEO_MENU,
    );
    return;
  }

  if (text === "🎞 Video Standard") {
    await sendMessage(
      env,
      chatId,
      "🎬 VIDEO STANDARD\n\nPilih resolusi video standard.",
      VIDEO_STANDARD_MENU,
    );
    return;
  }

  if (text === "🚀 Video High Quality") {
    await sendMessage(
      env,
      chatId,
      "🚀 VIDEO HIGH QUALITY\n\nPilih resolusi video high quality.",
      VIDEO_HQ_MENU,
    );
    return;
  }

  if (text === "⬅️ Kembali ke Video") {
    await sendMessage(
      env,
      chatId,
      "🎬 GENERATE VIDEO\n\nPilih kualitas video yang ingin Anda buat.",
      VIDEO_MENU,
    );
    return;
  }

  if (text === "480p Standard") {
    await sendMessage(
      env,
      chatId,
      "🎬 VIDEO STANDARD 480p\n\nPilih durasi video.",
      VIDEO_STANDARD_480_MENU,
    );
    return;
  }

  if (text === "720p Standard") {
    await sendMessage(
      env,
      chatId,
      "🎬 VIDEO STANDARD 720p\n\nPilih durasi video.",
      VIDEO_STANDARD_720_MENU,
    );
    return;
  }

  if (text === "⬅️ Kembali ke Video Standard") {
    await sendMessage(
      env,
      chatId,
      "🎬 VIDEO STANDARD\n\nPilih resolusi video standard.",
      VIDEO_STANDARD_MENU,
    );
    return;
  }

  if (text === "480p High Quality") {
    await sendMessage(
      env,
      chatId,
      "🚀 VIDEO HIGH QUALITY 480p\n\nPilih durasi video.",
      VIDEO_HQ_480_MENU,
    );
    return;
  }

  if (text === "720p High Quality") {
    await sendMessage(
      env,
      chatId,
      "🚀 VIDEO HIGH QUALITY 720p\n\nPilih durasi video.",
      VIDEO_HQ_720_MENU,
    );
    return;
  }

  if (text === "1080p High Quality") {
    await sendMessage(
      env,
      chatId,
      "🚀 VIDEO HIGH QUALITY 1080p\n\nPilih durasi video.",
      VIDEO_HQ_1080_MENU,
    );
    return;
  }

  if (text === "⬅️ Kembali ke Video High Quality") {
    await sendMessage(
      env,
      chatId,
      "🚀 VIDEO HIGH QUALITY\n\nPilih resolusi video high quality.",
      VIDEO_HQ_MENU,
    );
    return;
  }

  if (VIDEO_GENERATE_OPTIONS[text]) {
    await requestGenerateVideoPrompt(
      env,
      chatId,
      VIDEO_GENERATE_OPTIONS[text],
    );
    return;
  }

  if (text === "➕ Top Up" || command.name === "topup") {
    await sendMessage(
      env,
      chatId,
      "➕ TOP UP SALDO\n\nPembayaran QRIS sedang menunggu aktivasi DOKU Merchant.\n\nSetelah aktif, bot akan membuat QRIS dan menambah saldo otomatis setelah pembayaran berhasil.",
      MAIN_MENU,
    );
    return;
  }

  if (text === "👛 Saldo" || command.name === "saldo") {
    await sendMessage(env, chatId, "👛 Saldo Anda saat ini: Rp0", MAIN_MENU);
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

  if (!text && caption) {
    await sendMessage(
      env,
      chatId,
      "Pesan Anda diterima, tetapi formatnya belum sesuai menu yang tersedia. Silakan pilih menu di bawah.",
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

async function handleReplyContext(env, chatId, message, context) {
  if (context.kind === "Edit Foto") {
    if (!message.photo?.length) {
      await sendMessage(
        env,
        chatId,
        "Silakan balas pesan tadi dengan foto yang ingin diedit, lalu tulis instruksi edit pada caption.",
        FOTO_EDIT_MENU,
      );
      return;
    }

    if (!(message.caption || "").trim()) {
      await sendMessage(
        env,
        chatId,
        "Foto sudah diterima, tetapi instruksi edit belum ada. Kirim ulang foto dan isi caption dengan instruksi edit.",
        FOTO_EDIT_MENU,
      );
      return;
    }

    await sendMessage(
      env,
      chatId,
      `✅ Permintaan edit foto berhasil dicatat.\n\nJenis: ${context.kind}\nKualitas: ${context.quality}\nResolusi: ${context.resolution}\nHarga: ${context.price}\nInstruksi: ${message.caption.trim()}\n\nSaat ini alur menu sudah aktif. Integrasi otomatis ke xAI akan disambungkan pada tahap berikutnya.`,
      MAIN_MENU,
    );
    return;
  }

  const prompt = (message.text || "").trim();
  if (!prompt) {
    await sendMessage(
      env,
      chatId,
      "Silakan balas pesan tadi dengan deskripsi atau prompt teks.",
      MAIN_MENU,
    );
    return;
  }

  const durationText = context.duration ? `Durasi: ${context.duration}\n` : "";

  await sendMessage(
    env,
    chatId,
    `✅ Permintaan berhasil dicatat.\n\nJenis: ${context.kind}\nKualitas: ${context.quality}\nResolusi: ${context.resolution}\n${durationText}Harga: ${context.price}\nPrompt: ${prompt}\n\nSaat ini alur menu sudah aktif. Integrasi otomatis ke xAI akan disambungkan pada tahap berikutnya.`,
    MAIN_MENU,
  );
}

async function requestGeneratePhotoPrompt(env, chatId, option) {
  const text = `🖼 GENERATE FOTO\nJenis: ${option.kind}\nKualitas: ${option.quality}\nResolusi: ${option.resolution}\nHarga: ${option.price}\n\nSilakan balas pesan ini dengan deskripsi foto yang ingin dibuat.`;

  await sendMessage(env, chatId, text, forceReply("Tulis prompt foto..."));
}

async function requestEditPhotoUpload(env, chatId, option) {
  const text = `✏️ EDIT FOTO\nJenis: ${option.kind}\nKualitas: ${option.quality}\nResolusi: ${option.resolution}\nHarga: ${option.price}\n\nSilakan balas pesan ini dengan foto yang ingin diedit, lalu tulis instruksi edit pada caption.`;

  await sendMessage(env, chatId, text, forceReply("Kirim foto + caption edit..."));
}

async function requestGenerateVideoPrompt(env, chatId, option) {
  const text = `🎬 GENERATE VIDEO\nJenis: ${option.kind}\nKualitas: ${option.quality}\nResolusi: ${option.resolution}\nDurasi: ${option.duration}\nHarga: ${option.price}\n\nSilakan balas pesan ini dengan deskripsi video yang ingin dibuat.`;

  await sendMessage(env, chatId, text, forceReply("Tulis prompt video..."));
}

function parseReplyContext(text) {
  if (!text) return null;

  const kind = extractField(text, "Jenis");
  if (!kind) return null;

  if (!["Generate Foto", "Generate Video", "Edit Foto"].includes(kind)) {
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

function extractField(text, label) {
  const match = text.match(new RegExp(`^${escapeRegExp(label)}:\\s*(.+)$`, "m"));
  return match ? match[1].trim() : "";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
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

function keyboard(rows, placeholder = "Pilih...") {
  return {
    keyboard: rows.map((row) => row.map((text) => ({ text }))),
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: placeholder,
  };
}

function forceReply(placeholder = "Balas pesan ini...") {
  return {
    force_reply: true,
    selective: true,
    input_field_placeholder: placeholder,
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