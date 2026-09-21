// Purpose: Compile and validate editable form layouts while preserving the decision policy's input contract.
/** @typedef {{name:string,version:string,inputs:Record<string,string>,rules:{outcome:string}[],fallback:string}} FormPack */
/** @typedef {{name:string,label?:string,control?:string,help?:string,placeholder?:string,options?:string[]}} FieldLayout */
/** @typedef {{title?:string,description?:string,fields?:FieldLayout[]}} FormLayout */
/** @param {unknown} value @param {number} max @param {string} fallback */
function label(value, max, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || value.length > max)
    throw new Error("Invalid form text");
  return value;
}
/** @param {FormPack} pack @param {FormLayout} [layout] */
export function compileForm(pack, layout = {}) {
  if (!pack?.inputs || !pack.name)
    throw new Error("A pack with declared inputs is required");
  const names = Object.keys(pack.inputs);
  /** @type {FieldLayout[]} */
  const ordered = layout.fields ?? names.map((name) => ({ name }));
  if (
    !Array.isArray(ordered) ||
    ordered.length !== names.length ||
    new Set(ordered.map((f) => f.name)).size !== names.length
  )
    throw new Error("A form must contain every policy input exactly once");
  const fields = ordered.map((field) => {
    if (
      !Object.hasOwn(pack.inputs, field.name) ||
      ["__proto__", "constructor", "prototype"].includes(field.name)
    )
      throw new Error("Unknown or unsafe form field");
    const type = pack.inputs[field.name],
      allowed =
        type === "string"
          ? ["text", "textarea", "select"]
          : type === "number"
            ? ["number"]
            : type === "boolean"
              ? ["checkbox"]
              : [];
    const control =
      field.control ??
      (type === "string"
        ? "textarea"
        : type === "number"
          ? "number"
          : "checkbox");
    if (!allowed.includes(control))
      throw new Error("Control is incompatible with the policy input type");
    const options = field.options ?? [];
    if (
      !Array.isArray(options) ||
      options.length > 100 ||
      options.some(
        (o) => typeof o !== "string" || o.length === 0 || o.length > 200,
      ) ||
      new Set(options).size !== options.length
    )
      throw new Error("Select options must be unique short strings");
    if (control === "select" && options.length === 0)
      throw new Error("A select needs at least one option");
    return {
      name: field.name,
      label: label(field.label, 120, field.name.replaceAll("_", " ")),
      type,
      required: true,
      control,
      help: label(field.help, 500, ""),
      placeholder: label(field.placeholder, 200, ""),
      options: control === "select" ? options : [],
    };
  });
  return {
    schemaVersion: 1,
    pack: { name: pack.name, version: pack.version },
    title: label(layout.title, 120, pack.name),
    description: label(layout.description, 1000, ""),
    fields,
    outcomes: [
      ...new Set([...pack.rules.map((r) => r.outcome), pack.fallback]),
    ],
    reviewOutcome: pack.fallback,
  };
}
/** @param {ReturnType<typeof compileForm>} form @param {Record<string,unknown>} input */
export function validateForm(form, input) {
  /** @type {Record<string,string|number|boolean>} */ const state = {};
  for (const field of form.fields) {
    const value = input[field.name];
    if (
      typeof value !== field.type ||
      (field.type === "number" && !Number.isFinite(value))
    )
      throw new Error(`Invalid ${field.name}: expected ${field.type}`);
    if (
      field.control === "select" &&
      !field.options.includes(/** @type {string} */ (value))
    )
      throw new Error(`Invalid ${field.name}: choose a declared option`);
    state[field.name] = /** @type {string|number|boolean} */ (value);
  }
  return state;
}
/** @param {string} value */
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] ?? c,
  );
/** @param {ReturnType<typeof compileForm>} form */
export function exportHtml(form) {
  const fields = form.fields
    .map((f) => {
      const attrs = `name="${escape(f.name)}" aria-label="${escape(f.label)}" placeholder="${escape(f.placeholder)}"`;
      const control =
        f.control === "select"
          ? `<select ${attrs}>${f.options.map((value) => `<option>${escape(value)}</option>`).join("")}</select>`
          : f.control === "textarea"
            ? `<textarea ${attrs} required></textarea>`
            : `<input ${attrs} type="${escape(f.control)}" ${f.type === "number" ? 'step="any" required' : f.type === "string" ? "required" : ""}>`;
      return `<label>${escape(f.label)}${control}${f.help ? `<small>${escape(f.help)}</small>` : ""}</label>`;
    })
    .join("\n");
  // Exported HTML collects typed data; credentials and inference remain server-side.
  return `<!doctype html>\n<!-- Purpose: Collect typed state; this standalone export does not execute inference. -->\n<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(form.title)}</title><style>body{font:16px system-ui;max-width:680px;margin:50px auto;padding:24px}label{display:grid;gap:8px;margin:20px 0}textarea,input,select{font:inherit;padding:10px}pre{white-space:pre-wrap}</style><h1>${escape(form.title)}</h1><p>${escape(form.description)}</p><form>${fields}<button>Prepare JSON</button></form><pre id="result"></pre><script>const fields=${JSON.stringify(form.fields).replaceAll("<", "\\u003c")};document.querySelector('form').onsubmit=e=>{e.preventDefault();const data=new FormData(e.target),state={};for(const f of fields)state[f.name]=f.type==='boolean'?data.has(f.name):f.type==='number'?Number(data.get(f.name)):data.get(f.name);document.querySelector('#result').textContent=JSON.stringify(state,null,2);};</script></html>`;
}
