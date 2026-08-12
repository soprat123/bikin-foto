const MAX_QRIS_IMAGE_BYTES = 1024 * 1024;

function paymentBase(env) {
  if (!env.QRIS_PAYMENT_URL) throw new Error("missing_qris_payment_url");
  const base = new URL(env.QRIS_PAYMENT_URL);
  if (base.protocol !== "https:") throw new Error("invalid_payment_service_url");
  return base;
}

async function parseJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export async function createInternalQrisOrder(env, input) {
  if (!env.QRIS_INTERNAL_SECRET) throw new Error("missing_qris_internal_secret");
  const target = new URL("/api/orders", paymentBase(env));
  const response = await fetch(target, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-secret": env.QRIS_INTERNAL_SECRET,
    },
    body: JSON.stringify({
      source: "telegram",
      base_amount: input.amount,
      reference: input.reference,
      customer_id: String(input.telegramId),
      customer_name: input.firstName || null,
      username: input.username || null,
    }),
  });
  const result = await parseJson(response);
  if (
    !response.ok ||
    !result.ok ||
    result.order?.provider !== "internal" ||
    !result.order?.id ||
    !result.order?.checkout_url ||
    !Number.isSafeInteger(Number(result.order?.unique_amount))
  ) {
    const error = new Error(result.error || `payment_service_http_${response.status}`);
    error.upstreamStatus = response.status;
    error.details = result;
    throw error;
  }
  return result;
}

export async function getInternalQrisOrder(env, orderId) {
  const target = new URL(`/api/orders/${encodeURIComponent(String(orderId))}`, paymentBase(env));
  const response = await fetch(target, { headers: { accept: "application/json" } });
  const result = await parseJson(response);
  if (!response.ok || !result.ok || !result.order?.id) {
    throw new Error(result.error || `payment_status_http_${response.status}`);
  }
  return result.order;
}

export async function getInternalQrisPng(env, orderId) {
  const target = new URL(`/api/orders/${encodeURIComponent(String(orderId))}/qris`, paymentBase(env));
  const response = await fetch(target, { headers: { accept: "image/png" } });
  if (!response.ok) {
    const result = await parseJson(response);
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

export async function cancelInternalQrisOrder(env, orderId, cancelToken) {
  if (!cancelToken) return false;
  const target = new URL(`/api/orders/${encodeURIComponent(String(orderId))}/cancel`, paymentBase(env));
  const response = await fetch(target, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cancel-token": String(cancelToken),
    },
    body: "{}",
  });
  return response.ok;
}

export function buildInternalTopupInvoice({ baseAmount, uniqueAmount, orderId, checkoutUrl, expiresAt }) {
  const base = `Rp${Number(baseAmount).toLocaleString("id-ID")}`;
  const total = `Rp${Number(uniqueAmount).toLocaleString("id-ID")}`;
  const expiry = Number(expiresAt) > 0
    ? new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(Number(expiresAt) * 1000))
    : "sekitar 15 menit";

  return `🧾 INVOICE TOP UP QRIS\n\n💰 Saldo yang akan masuk: ${base}\n💳 Total yang harus dibayar: ${total}\n🆔 Order: ${orderId}\n\n📱 Scan QRIS di atas dan BAYAR PERSIS ${total}.\n🔗 Checkout: ${checkoutUrl}\n\nSetelah pembayaran, tunggu admin memeriksa mutasi lalu menandai order sebagai dibayar. Saldo akan masuk otomatis setelah persetujuan admin.\n\n⏰ Batas pembayaran: ${expiry} WIB`;
}
