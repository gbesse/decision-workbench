// Purpose: Compile supported DecisionPack inputs into a portable form contract without generated executable code.
/** @typedef {{name:string,version:string,inputs:Record<string,string>,rules:{outcome:string}[],fallback:string}} FormPack */
/** @param {FormPack} pack */
export function compileForm(pack) {
  if (!pack?.inputs || !pack.name)
    throw new Error("A pack with declared inputs is required");
  return {
    schemaVersion: 1,
    pack: { name: pack.name, version: pack.version },
    fields: Object.entries(pack.inputs).map(([name, type]) => {
      if (!["string", "number", "boolean"].includes(type))
        throw new Error("Unsupported field type");
      return {
        name,
        label: name.replaceAll("_", " "),
        type,
        required: true,
        control:
          type === "boolean"
            ? "checkbox"
            : type === "number"
              ? "number"
              : "textarea",
      };
    }),
    outcomes: [
      ...new Set([...pack.rules.map((rule) => rule.outcome), pack.fallback]),
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
  // The exported form collects typed input. Evaluation remains an authenticated server operation.
  const fields = form.fields
    .map(
      (f) =>
        `<label>${escape(f.label)}${f.type === "string" ? `<textarea name="${escape(f.name)}" required></textarea>` : `<input name="${escape(f.name)}" type="${f.type === "boolean" ? "checkbox" : "number"}" ${f.type === "number" ? 'step="any" required' : ""}>`}</label>`,
    )
    .join("\n");
  return `<!doctype html>\n<!-- Purpose: Collect typed state for ${escape(form.pack.name)}; this standalone export does not execute inference. -->\n<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(form.pack.name)}</title><style>body{font:16px system-ui;max-width:680px;margin:50px auto;padding:24px}label{display:grid;gap:8px;margin:20px 0}textarea,input{font:inherit;padding:10px}pre{white-space:pre-wrap}</style><h1>${escape(form.pack.name)}</h1><p>Prepare input JSON for the decision service.</p><form>${fields}<button>Prepare JSON</button></form><pre id="result"></pre><script>const fields=${JSON.stringify(form.fields).replaceAll("<", "\\u003c")};document.querySelector('form').onsubmit=e=>{e.preventDefault();const data=new FormData(e.target),state={};for(const f of fields)state[f.name]=f.type==='boolean'?data.has(f.name):f.type==='number'?Number(data.get(f.name)):data.get(f.name);document.querySelector('#result').textContent=JSON.stringify(state,null,2);};</script></html>`;
}
