import assert from "node:assert/strict";
import test from "node:test";
import { readInternalJson, verifyInternalSecret } from "../src/payments.js";

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
