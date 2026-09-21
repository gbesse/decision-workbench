// Purpose: Execute one trusted extension in a disposable worker so deadlines also stop CPU-bound code.
import { parentPort, workerData } from "node:worker_threads";
try {
  const module = await import(workerData.url);
  const output = await module.execute(workerData.input, {
    signal: AbortSignal.timeout(workerData.timeoutMs),
    invocationId: workerData.invocationId,
  });
  parentPort.postMessage({ ok: true, output });
} catch (error) {
  parentPort.postMessage({
    ok: false,
    error: { name: error.name, message: error.message },
  });
}
