// Purpose: Validate portable JSON contracts and bound asynchronous plugin execution.
export const ensure = (condition, message) => {
  if (!condition) throw new Error(message);
};
export const nonempty = (value) =>
  typeof value === "string" && value.trim().length > 0;
export function json(value, seen = new Set()) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  )
    return value;
  ensure(
    value &&
      typeof value === "object" &&
      !seen.has(value) &&
      (Array.isArray(value) ||
        Object.getPrototypeOf(value) === Object.prototype),
    "Expected finite acyclic JSON",
  );
  seen.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      ensure(Object.hasOwn(value, i), "Sparse arrays are not supported");
      json(value[i], seen);
    }
  } else {
    ensure(
      Reflect.ownKeys(value).every((k) => typeof k === "string"),
      "Symbol keys are not JSON",
    );
    for (const child of Object.values(value)) json(child, seen);
  }
  seen.delete(value);
  return value;
}
export const snapshot = (value) => structuredClone(json(value));
export async function bounded(fn, { timeoutMs = 30_000, signal } = {}) {
  ensure(
    Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 300_000,
    "Invalid timeout",
  );
  const controller = new AbortController(),
    combined = signal
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal;
  combined.throwIfAborted();
  let timer, abort;
  const deadline = new Promise((_, reject) => {
    abort = () => reject(combined.reason);
    combined.addEventListener("abort", abort, { once: true });
    timer = setTimeout(
      () => controller.abort(new Error("Plugin deadline exceeded")),
      timeoutMs,
    );
  });
  // Abort is cooperative; callers must not retry external effects whose completion is ambiguous.
  try {
    return await Promise.race([
      Promise.resolve().then(() => fn(combined)),
      deadline,
    ]);
  } finally {
    clearTimeout(timer);
    combined.removeEventListener("abort", abort);
  }
}
