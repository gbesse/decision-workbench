// Purpose: Verify the actual PDF text extractor against a minimal generated fixture with page provenance.
import test from "node:test";
import assert from "node:assert/strict";
import { createRegistry } from "../packages/studio/registry.mjs";
function pdf() {
  const stream = "BT /F1 12 Tf 20 100 Td (Invoice total 49 euros) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let body = "%PDF-1.4\n",
    offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(body));
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const start = Buffer.byteLength(body);
  body +=
    "xref\n0 6\n0000000000 65535 f \n" +
    offsets
      .slice(1)
      .map((v) => String(v).padStart(10, "0") + " 00000 n \n")
      .join("") +
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(body).toString("base64");
}
test("PDF worker extracts text and preserves page identity without image generation or model calls", async () => {
  const registry = await createRegistry();
  const doc = await registry.execute(
    "statebridge.extract",
    { name: "invoice.pdf", format: "pdf", encoding: "base64", content: pdf() },
    { timeoutMs: 15000 },
  );
  assert.match(doc.rows[0].fields.text, /Invoice total 49 euros/);
  assert.equal(doc.rows[0].evidence.text.page, 1);
  assert.equal(doc.source.format, "pdf");
});
