import assert from "node:assert/strict";
import test from "node:test";
import {
  buildManualTopupInvoice,
  readInternalJson,
  requestDynamicQris,
  verifyInternalSecret,
} from "../src/payments.js";

test("verifies matching shared secrets", async () => {
  assert.equal(await verifyInternalSecret("shared-secret", "shared-secret"), true);
  assert.equal(await verifyInternalSecret("wrong-secret", "shared-secret"), false);
});

test("reads a bounded internal JSON payload", async () => {
  const request = new Request("https://example.com/internal/payment-paid", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event: "order.paid", order_id: "ord_test" }),
  });
  assert.deepEqual(await readInternalJson(request), {
    event: "order.paid",
    order_id: "ord_test",
  });
});

test("formats a manual QRIS invoice without automatic confirmation claims", () => {
  const caption = buildManualTopupInvoice({
    amount: 10_000,
    orderId: "123",
    expiresAt: Date.UTC(2026, 7, 7, 6, 0),
  });
  assert.match(caption, /Total Invoice: Rp10\.000/);
  assert.match(caption, /Order ID: #123/);
  assert.match(caption, /diperiksa manual oleh admin/);
  assert.doesNotMatch(caption, /otomatis dikonfirmasi/i);
});

test("requests a protected dynamic QRIS PNG", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://qris.example/api/qris/dynamic");
    assert.equal(init.headers.authorization, "Bearer private-key");
    assert.deepEqual(JSON.parse(init.body), { amount: 10_000 });
    return new Response(new Uint8Array([137, 80, 78, 71]), {
      headers: { "content-type": "image/png" },
    });
  };

  const image = await requestDynamicQris(
    { QRIS_PAYMENT_URL: "https://qris.example", QRIS_API_KEY: "private-key" },
    10_000,
  );
  assert.equal(image.byteLength, 4);
});
