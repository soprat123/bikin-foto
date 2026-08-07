const MAX_INTERNAL_BODY_BYTES = 64 * 1024;
const MAX_QRIS_IMAGE_BYTES = 1024 * 1024;

export async function verifyInternalSecret(provided, expected) {
  if (!provided || !expected) return false;
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const left = new Uint8Array(providedHash);
  const right = new Uint8Array(expectedHash);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function readInternalJson(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_INTERNAL_BODY_BYTES) throw new Error("payload_too_large");
  const reader = request.body?.getReader();
  if (!reader) return {};
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_INTERNAL_BODY_BYTES) {
      await reader.cancel();
      throw new Error("payload_too_large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function requestGatePayDeposit(env, input) {
  if (!env.QRIS_PAYMENT_URL) throw new Error("missing_qris_payment_url");
  if (!env.QRIS_INTERNAL_SECRET) throw new Error("missing_qris_internal_secret");
  const target = new URL("/internal/orders", env.QRIS_PAYMENT_URL);
  if (target.protocol !== "https:") throw new Error("invalid_payment_service_url");

  const response = await fetch(target, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-secret": env.QRIS_INTERNAL_SECRET,
    },
    body: JSON.stringify({
      base_amount: input.amount,
      reference: input.reference,
      username: input.username || null,
      first_name: input.firstName || null,
      telegram_id: input.telegramId || null,
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.ok || !result.order?.id) {
    const error = new Error(result.error || `payment_service_http_${response.status}`);
    error.upstreamStatus = Number(result.upstream_status || 0);
    error.upstreamMessage = String(result.upstream_message || "").slice(0, 300);
    throw error;
  }
  return result.order;
}

export async function requestDynamicQris(env, amount) {
  if (!env.QRIS_PAYMENT_URL) throw new Error("missing_qris_payment_url");
  if (!env.QRIS_API_KEY) throw new Error("missing_qris_api_key");
  if (!Number.isSafeInteger(amount) || amount < 1_000 || amount > 1_000_000) {
    throw new Error("invalid_amount");
  }

  const target = new URL("/api/qris/dynamic", env.QRIS_PAYMENT_URL);
  if (target.protocol !== "https:") throw new Error("invalid_payment_service_url");
  const response = await fetch(target, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.QRIS_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ amount }),
  });

  if (!response.ok) {
    let result = {};
    try {
      result = await response.json();
    } catch {
      // Respons error non-JSON tetap dilaporkan melalui status HTTP.
    }
    throw new Error(result.error || `qris_api_http_${response.status}`);
  }
  if (!String(response.headers.get("content-type") || "").startsWith("image/png")) {
    throw new Error("invalid_qris_image");
  }
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_QRIS_IMAGE_BYTES) throw new Error("qris_image_too_large");
  const image = await response.arrayBuffer();
  if (image.byteLength > MAX_QRIS_IMAGE_BYTES) throw new Error("qris_image_too_large");
  return image;
}

export function buildManualTopupInvoice({ amount, orderId, expiresAt }) {
  const rupiah = `Rp${Number(amount).toLocaleString("id-ID")}`;
  const expires = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(expiresAt));

  return `🧾 INVOICE PEMBAYARAN

📦 Produk: Top Up Saldo Bot
🔢 Jumlah: 1
💰 Total Invoice: ${rupiah}
🆔 Order ID: #${orderId}

📱 Scan QRIS di atas menggunakan aplikasi pembayaran yang mendukung QRIS.

⚠️ PENTING: Bayar sesuai nominal invoice. Pembayaran dan penambahan saldo diperiksa manual oleh admin.

⏰ Batas konfirmasi: ${expires} WIB

Menunggu pembayaran…`;
}

export async function notifyTransactionBot(env, input) {
  if (!env.QRIS_PAYMENT_URL) throw new Error("missing_qris_payment_url");
  if (!env.QRIS_INTERNAL_SECRET) throw new Error("missing_qris_internal_secret");
  const target = new URL("/internal/manual-topup-notify", env.QRIS_PAYMENT_URL);
  if (target.protocol !== "https:") throw new Error("invalid_payment_service_url");

  const response = await fetch(target, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-secret": env.QRIS_INTERNAL_SECRET,
    },
    body: JSON.stringify({
      amount: input.amount,
      order_id: input.orderId,
      telegram_id: input.telegramId,
      username: input.username || null,
      first_name: input.firstName || null,
    }),
  });
  let result = {};
  try {
    result = await response.json();
  } catch {
    // Status HTTP tetap diperiksa di bawah.
  }
  if (!response.ok || !result.ok) {
    throw new Error(result.error || `transaction_bot_http_${response.status}`);
  }
  return result;
}
