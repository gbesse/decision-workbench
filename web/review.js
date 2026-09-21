// Purpose: Operate persisted review sets through the Workbench API, preserving original judgments and reviewer history.
const $ = (s) => document.querySelector(s),
  esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
let sets = [],
  selected;
async function api(path, body) {
  const r = await fetch("/api/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      authorization:
        "Bearer " + (sessionStorage.getItem("workbench-token") ?? ""),
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const v = await r.json();
  if (!r.ok) throw Error(v.error);
  return v;
}
async function run(fn) {
  $("#error").textContent = "";
  try {
    await fn();
  } catch (e) {
    $("#error").textContent = e.message;
  }
}
function draw() {
  selected = sets.find((s) => s.id === $("#sets").value);
  $("#cases").innerHTML = selected
    ? selected.data.cases
        .map((c) => {
          const votes = [...new Map(c.votes.map((v) => [v.actor, v])).values()],
            unique = [...new Set(votes.map((v) => v.outcome))];
          return `<section class="panel" data-id="${esc(c.id)}"><label><input type="checkbox" class="choose"> Inclure dans l’export</label><pre>${esc(JSON.stringify(c.state, null, 2))}</pre><p>Modèle : <strong>${esc(c.record.outcome)}</strong> · ${esc(c.resolution ? "Arbitré" : unique.length > 1 ? "Désaccord" : votes.length ? "Accord" : "À relire")}</p><label>Résultat humain<select class="outcome">${[...new Set([...selected.data.pack.rules.map((r) => r.outcome), selected.data.pack.fallback])].map((o) => `<option>${esc(o)}</option>`).join("")}</select></label><label>Motif<input class="note"></label><button data-action="vote">Enregistrer mon avis</button><button data-action="resolve">Arbitrer</button><details><summary>Historique des avis (${c.votes.length})</summary><pre>${esc(JSON.stringify({ votes: c.votes, resolution: c.resolution }, null, 2))}</pre></details></section>`;
        })
        .join("")
    : "";
}
async function refresh(id = selected?.id) {
  sets = await api("review-sets");
  $("#sets").innerHTML = sets
    .map(
      (s) =>
        `<option value="${esc(s.id)}">${esc(s.data.name)} (${s.data.cases.length})</option>`,
    )
    .join("");
  if (id) $("#sets").value = id;
  draw();
}
$("#sets").onchange = draw;
$("#create").onclick = () =>
  run(async () => {
    const s = await api("review-sets", {
      name: $("#name").value,
      jobId: $("#jobs").value,
    });
    await refresh(s.id);
  });
$("#trace").onchange = () =>
  run(async () => {
    const f = $("#trace").files[0];
    if (!f || f.size > 4000000)
      throw Error("Fichier JSON inférieur à 4 Mo requis");
    const s = await api("review-sets", {
      name: $("#name").value,
      trace: JSON.parse(await f.text()),
    });
    await refresh(s.id);
  });
$("#cases").onclick = (e) =>
  run(async () => {
    const button = e.target.closest("[data-action]");
    if (!button) return;
    const panel = button.closest("[data-id]");
    await api("review-" + button.dataset.action, {
      id: selected.id,
      revision: selected.revision,
      caseId: panel.dataset.id,
      actor: $("#actor").value,
      outcome: panel.querySelector(".outcome").value,
      note: panel.querySelector(".note").value,
    });
    await refresh();
  });
$("#export").onclick = () =>
  run(async () => {
    if (!selected) throw Error("Sélectionnez un jeu");
    const data = await api("review-export", {
      id: selected.id,
      revision: selected.revision,
      caseIds: [...document.querySelectorAll(".choose:checked")].map(
        (e) => e.closest("[data-id]").dataset.id,
      ),
      split: $("#split").value,
      minReviewers: Number($("#minimum").value),
    });
    const a = document.createElement("a"),
      u = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
    a.href = u;
    a.download = "decision-dataset.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  });
run(async () => {
  const w = await api("workspace");
  $("#jobs").innerHTML = w.jobs
    .filter((j) => !["running", "queued"].includes(j.data.status))
    .map(
      (j) =>
        `<option value="${esc(j.id)}">${esc(j.id)} · ${j.data.processed} lignes</option>`,
    )
    .join("");
  await refresh();
});
