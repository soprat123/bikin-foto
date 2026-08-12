import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInternalTopupInvoice,
  createInternalQrisOrder,
  getInternalQrisPng,
} from "../src/internal-qris-payments.js";

test("creates Telegram topup through the internal gateway", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://qris.example/api/orders");
    assert.equal(init.headers["x-internal-secret"], "shared-secret");
    assert.deepEqual(JSON.parse(init.body), {
      source: "telegram",
      base_amount: 10_000,
      reference: "deposit:456:789",
      customer_id: "456",
      customer_name: "Nama",
      username: "user",
    });
    return Response.json({
      ok: true,
      order: {
        id: "QR-ABC",
        provider: "internal",
        base_amount: 10_000,
        unique_amount: 10_137,
        status: "pending",
        checkout_url: "https://qris.example/pay/QR-ABC",
        expires_at: 1_800_000_000,
        expires_in: 900,
      },
      cancel_token: "cancel-token",
    }, { status: 201 });
  };

  const result = await createInternalQrisOrder(
    {
      QRIS_PAYMENT_URL: "https://qris.example",
      QRIS_INTERNAL_SECRET: "shared-secret",
    },
    {
      amount: 10_000,
      reference: "deposit:456:789",
      telegramId: "456",
      username: "user",
      firstName: "Nama",
    },
  );
  assert.equal(result.order.id, "QR-ABC");
  assert.equal(result.order.unique_amount, 10_137);
});

test("loads QRIS PNG from the internal order", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url) => {
    assert.equal(String(url), "https://qris.example/api/orders/QR-ABC/qris");
    return new Response(new Uint8Array([137, 80, 78, 71]), {
      headers: { "content-type": "image/png" },
    });
  };

  const image = await getInternalQrisPng({ QRIS_PAYMENT_URL: "https://qris.example" }, "QR-ABC");
  assert.equal(image.byteLength, 4);
});

test("invoice tells user to wait for manual admin approval", () => {
  const invoice = buildInternalTopupInvoice({
    baseAmount: 10_000,
    uniqueAmount: 10_137,
    orderId: "QR-ABC",
    checkoutUrl: "https://qris.example/pay/QR-ABC",
    expiresAt: 1_800_000_000,
  });
  assert.match(invoice, /Saldo yang akan masuk: Rp10\.000/);
  assert.match(invoice, /Total yang harus dibayar: Rp10\.137/);
  assert.match(invoice, /menandai order sebagai dibayar/);
  assert.match(invoice, /Saldo akan masuk otomatis setelah persetujuan admin/);
});
