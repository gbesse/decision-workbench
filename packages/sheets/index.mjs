// Purpose: Evaluate a finite dataset with an explicit call budget and retain each row's decision or error.
import { evaluate, validatePack } from "@gbesse/decisionpacks";
import { mapState } from "../statebridge/index.mjs";
import { ensure, snapshot } from "../core/contracts.mjs";
export async function evaluateRows(
  { document, mapping, pack, rowIds, maxCalls = 25 },
  { provider, signal, onRow = async () => {}, timeoutMs = 30000 } = {},
) {
  document = snapshot(document);
  mapping = snapshot(mapping);
  pack = snapshot(pack);
  validatePack(pack);
  ensure(
    Array.isArray(rowIds) &&
      rowIds.length > 0 &&
      new Set(rowIds).size === rowIds.length,
    "Select unique rows",
  );
  ensure(
    Number.isSafeInteger(maxCalls) &&
      maxCalls > 0 &&
      maxCalls <= 100 &&
      rowIds.length <= maxCalls,
    "Call budget exceeded (maximum 100)",
  );
  // Validate every mapping before the first paid call, so malformed rows do not consume a partial batch.
  const mapped = rowIds.map((id) => mapState(document, id, mapping));
  const results = [];
  for (const item of mapped) {
    signal?.throwIfAborted();
    let result;
    try {
      const record = await evaluate(pack, item.state, {
        provider,
        signal,
        timeoutMs,
      });
      result = { ...item, status: "succeeded", record };
    } catch (error) {
      if (signal?.aborted) throw error;
      result = { ...item, status: "failed", error: error.message };
    }
    await onRow(snapshot(result));
    results.push(result);
  }
  return {
    rows: results,
    calls: results.length,
    failures: results.filter((r) => r.status === "failed").length,
  };
}
export function exportCsv(rows) {
  const safe = (value) => {
    const text = String(value ?? "");
    return (
      '"' +
      (/^[\s]*[=+@\-]|^[\t\r]/.test(text) ? "'" : "") +
      text.replaceAll('"', '""') +
      '"'
    );
  };
  const lines = [
    [
      "row_id",
      "status",
      "outcome",
      "reviewed_outcome",
      "model",
      "pack_version",
      "error",
    ],
  ];
  for (const row of rows)
    lines.push([
      row.rowId,
      row.status,
      row.record?.outcome,
      row.review?.outcome,
      row.record?.model,
      row.record?.pack?.version,
      row.error,
    ]);
  return (
    lines.map((values) => values.map(safe).join(",")).join("\r\n") + "\r\n"
  );
}
