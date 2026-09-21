// Purpose: Deliver an approved JSON action to an operator-configured endpoint with an idempotency key and deadline.
export async function execute(input, { signal, invocationId }) {
  const url = new URL(process.env.WORKBENCH_WEBHOOK_URL ?? "");
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
  )
    throw new Error("Webhook requires HTTPS except for loopback testing");
  if (url.username || url.password)
    throw new Error(
      "Configure webhook credentials in the environment, not the URL",
    );
  const headers = {
    "content-type": "application/json",
    "idempotency-key": invocationId,
  };
  if (process.env.WORKBENCH_WEBHOOK_TOKEN)
    headers.authorization = "Bearer " + process.env.WORKBENCH_WEBHOOK_TOKEN;
  const response = await fetch(url, {
    method: "POST",
    redirect: "error",
    headers,
    body: JSON.stringify(input),
    signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
  });
  if (!response.ok)
    throw new Error(
      `Webhook returned HTTP ${response.status}; inspect target state before recovery`,
    );
  // A successful HTTP acknowledgement is all this connector can attest; it cannot prove downstream processing.
  await response.body?.cancel();
  return {
    status: "acknowledged",
    httpStatus: response.status,
    idempotencyKey: invocationId,
  };
}
