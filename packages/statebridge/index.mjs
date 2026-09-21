// Purpose: Convert supported documents into bounded records with source references and typed field mappings.
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { parse as csv } from "csv-parse/sync";
import { parse as html } from "parse5";
import { ensure, snapshot } from "../core/contracts.mjs";
const reserved = new Set(["__proto__", "prototype", "constructor"]);
const key = (k) =>
  typeof k === "string" && k.length > 0 && k.length <= 120 && !reserved.has(k);
export async function extract({ name, format, content, encoding = "utf8" }) {
  ensure(
    typeof name === "string" &&
      name.length <= 200 &&
      typeof content === "string",
    "Provide a document name and content",
  );
  ensure(
    ["text", "csv", "json", "html", "email", "pdf"].includes(format),
    "Unsupported format",
  );
  const bytes = Buffer.from(content, encoding === "base64" ? "base64" : "utf8");
  ensure(
    bytes.length > 0 && bytes.length <= 3_000_000,
    "Documents must be 1 byte to 3 MB",
  );
  const source = {
    id: createHash("sha256").update(bytes).digest("hex"),
    name,
    format,
  };
  const text = bytes.toString("utf8");
  let rows = [];
  const warnings = [];
  const row = (fields, evidence) => ({
    id: String(rows.length + 1),
    fields,
    evidence,
  });
  if (format === "csv") {
    let headers;
    const parsed = csv(text, {
      bom: true,
      columns: (values) => {
        ensure(
          values.length <= 50 &&
            new Set(values).size === values.length &&
            values.every(key),
          "CSV headers must be unique safe names (max 50)",
        );
        headers = values;
        return values;
      },
      info: true,
      skip_empty_lines: true,
      max_record_size: 100000,
    });
    rows = parsed.map((r, i) => ({
      id: String(i + 1),
      fields: r.record,
      evidence: Object.fromEntries(
        headers.map((h) => [
          h,
          {
            sourceId: source.id,
            record: i + 1,
            endLine: r.info.lines,
            column: h,
          },
        ]),
      ),
    }));
  } else if (format === "json") {
    const parsed = snapshot(JSON.parse(text)),
      records = Array.isArray(parsed) ? parsed : [parsed];
    rows = records.map((r, i) => {
      ensure(
        r && typeof r === "object" && !Array.isArray(r),
        "JSON rows must be objects",
      );
      ensure(
        Object.keys(r).length <= 50 && Object.keys(r).every(key),
        "Invalid JSON field names",
      );
      return {
        id: String(i + 1),
        fields: r,
        evidence: Object.fromEntries(
          Object.keys(r).map((k) => [
            k,
            {
              sourceId: source.id,
              pointer:
                (Array.isArray(parsed) ? `/${i}` : "") +
                "/" +
                k.replaceAll("~", "~0").replaceAll("/", "~1"),
            },
          ]),
        ),
      };
    });
  } else if (format === "html") {
    const doc = html(text, { sourceCodeLocationInfo: true });
    const parts = [];
    const walk = (node) => {
      if (["script", "style", "noscript", "template"].includes(node.tagName))
        return;
      if (node.nodeName === "#text" && node.value.trim())
        parts.push({
          text: node.value.trim(),
          start: node.sourceCodeLocation?.startOffset,
          end: node.sourceCodeLocation?.endOffset,
        });
      for (const child of node.childNodes ?? []) walk(child);
    };
    walk(doc);
    rows = [
      row(
        { text: parts.map((p) => p.text).join("\n") },
        { text: { sourceId: source.id, segments: parts } },
      ),
    ];
  } else if (format === "pdf") {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({
      data: new Uint8Array(bytes),
      isEvalSupported: false,
      useSystemFonts: false,
      disableFontFace: true,
      standardFontDataUrl: fileURLToPath(
        new URL(
          "standard_fonts/",
          import.meta.resolve("pdfjs-dist/package.json"),
        ),
      ),
    });
    try {
      const doc = await task.promise;
      ensure(doc.numPages <= 40, "PDF is limited to 40 pages");
      for (let page = 1; page <= doc.numPages; page++) {
        const p = await doc.getPage(page),
          items = await p.getTextContent();
        const body = items.items
          .filter((v) => typeof v.str === "string")
          .map((v) => v.str)
          .join(" ");
        rows.push({
          id: String(page),
          fields: { text: body, page },
          evidence: {
            text: { sourceId: source.id, page },
            page: { sourceId: source.id, page },
          },
        });
        p.cleanup();
      }
      if (rows.every((r) => !r.fields.text.trim()))
        warnings.push(
          "This PDF has no extractable text. An OCR plugin is required.",
        );
    } finally {
      await task.destroy();
    }
  } else if (format === "email") {
    // This parser deliberately supports plain RFC822 messages only; attachments need an explicit extractor.
    ensure(
      !/^content-type:\s*multipart/im.test(text) &&
        !/^content-transfer-encoding:\s*(base64|quoted-printable)/im.test(text),
      "Encoded or multipart email requires a MIME plugin",
    );
    const split = text.search(/\r?\n\r?\n/);
    ensure(split >= 0, "Email must contain headers and a body");
    const bodyStart =
        split + (text.slice(split, split + 4) === "\r\n\r\n" ? 4 : 2),
      subject =
        text
          .slice(0, split)
          .match(/^subject:\s*(.*)$/im)?.[1]
          ?.trim() ?? "";
    rows = [
      row(
        { subject, text: text.slice(bodyStart) },
        {
          subject: { sourceId: source.id, section: "headers" },
          text: { sourceId: source.id, start: bodyStart, end: text.length },
        },
      ),
    ];
  } else
    rows = [
      row(
        { text },
        { text: { sourceId: source.id, start: 0, end: text.length } },
      ),
    ];
  ensure(
    rows.length > 0 && rows.length <= 500,
    "Imports support 1–500 records",
  );
  ensure(
    rows.every((r) => Buffer.byteLength(JSON.stringify(r.fields)) <= 100000),
    "A record exceeds 100 KB",
  );
  return { schemaVersion: 1, source, rows, warnings };
}
export function mapState(document, rowId, mapping) {
  const row = document.rows.find((r) => r.id === rowId);
  ensure(row, "Unknown source row");
  ensure(
    mapping && typeof mapping === "object" && !Array.isArray(mapping),
    "Field mapping required",
  );
  const state = {},
    evidence = {};
  for (const [target, definition] of Object.entries(mapping)) {
    ensure(
      key(target) && definition && Object.hasOwn(row.fields, definition.source),
      "Unknown mapped field",
    );
    const original = row.fields[definition.source];
    let value = original;
    if (definition.type === "string") {
      ensure(
        ["string", "number", "boolean"].includes(typeof original),
        "Cannot stringify a structured field implicitly",
      );
      value = String(original);
    } else if (definition.type === "number") {
      ensure(
        typeof original === "number" ||
          (typeof original === "string" && original.trim() !== ""),
        "Missing number",
      );
      value = Number(original);
      ensure(Number.isFinite(value), "Invalid numeric field");
    } else if (definition.type === "boolean") {
      ensure(
        [true, false, "true", "false"].includes(original),
        "Boolean must be true or false",
      );
      value = original === true || original === "true";
    } else throw new Error("Unsupported mapping type");
    state[target] = value;
    evidence[target] = {
      ...row.evidence[definition.source],
      sourceField: definition.source,
    };
  }
  ensure(Object.keys(state).length > 0, "Map at least one field");
  return { state, evidence, sourceId: document.source.id, rowId };
}
