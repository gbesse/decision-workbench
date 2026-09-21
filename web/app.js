// Purpose: Operate all six workbench modules through authenticated JSON requests and escaped, accessible browser views.
const $ = (selector) => document.querySelector(selector),
  escape = (value) =>
    String(value ?? "").replace(
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
const json = (value) => JSON.stringify(value, null, 2),
  pretty = (value) => `<pre>${escape(json(value))}</pre>`;
const state = {
  view: "studio",
  workspace: null,
  packId: "support-triage",
  document: null,
  job: null,
  upload: null,
  mapping: null,
  form: null,
  formDraft: null,
  formPreview: null,
  token: sessionStorage.getItem("workbench-token") ?? "",
};
const hash = new URLSearchParams(location.hash.slice(1));
if (hash.has("token")) {
  state.token = hash.get("token");
  sessionStorage.setItem("workbench-token", state.token);
  history.replaceState(null, "", location.pathname);
}
let busy = 0,
  pollTimer,
  noticeTimer;
function notice(message, kind = "error") {
  const node = $("#notice");
  $("#notice-message").textContent = message;
  node.dataset.kind = kind;
  node.hidden = false;
  clearTimeout(noticeTimer);
  if (kind === "success")
    noticeTimer = setTimeout(() => {
      node.hidden = true;
    }, 6000);
}
async function api(path, body, { text = false } = {}) {
  const response = await fetch("/api/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      authorization: "Bearer " + state.token,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(110000),
  });
  if (!response.ok) {
    const error = await response.json();
    if (response.status === 401) {
      $("#workspace").hidden = true;
      $("#login").hidden = false;
    }
    throw Error(error.error ?? `HTTP ${response.status}`);
  }
  return text ? response.text() : response.json();
}
async function run(action) {
  busy++;
  document.body.setAttribute("aria-busy", "true");
  try {
    return await action();
  } catch (error) {
    notice(error.message);
    return undefined;
  } finally {
    if (--busy === 0) document.body.removeAttribute("aria-busy");
  }
}
function download(name, content, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type })),
    link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function detail(title, html) {
  $("#detail-title").textContent = title;
  $("#detail-body").innerHTML = html;
  $("#detail").showModal();
}
const selectedPack = () =>
  state.workspace.packs.find((p) => p.id === state.packId) ??
  state.workspace.packs[0];
const packOptions = () =>
  state.workspace.packs
    .map(
      (p) =>
        `<option value="${escape(p.id)}" ${p.id === state.packId ? "selected" : ""}>${escape(p.data.name)} · ${escape(p.data.version)}</option>`,
    )
    .join("");
const shortDate = (value) =>
  new Intl.DateTimeFormat("fr", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
const statusName = (status) =>
  ({
    running: "En cours",
    completed: "Terminé",
    completed_with_errors: "Erreurs à examiner",
    failed: "Échec",
    cancelled: "Annulé",
    interrupted: "Interrompu",
    awaiting_review: "À valider",
    executing: "Exécution",
    uncertain: "Résultat incertain",
    rejected: "Refusé",
    evaluating: "Évaluation",
  })[status] ?? status;
const list = (title, items) =>
  `<section class="panel list"><h2 class="list-heading">${escape(title)}</h2>${items.length ? `<ul>${items.join("")}</ul>` : '<p class="empty">Aucun élément pour le moment.</p>'}</section>`;
function listRow({
  action,
  id,
  title,
  subtitle,
  date,
  icon = "◈",
  badge = "",
}) {
  return `<li><button class="list-row" data-action="${action}" data-id="${escape(id)}"><span class="row-icon" aria-hidden="true">${icon}</span><span class="row-main"><span class="row-title">${escape(title)}</span><span class="row-subtitle">${escape(subtitle)}</span></span>${badge ? `<span class="badge">${escape(badge)}</span>` : ""}<span class="row-date">${escape(shortDate(date))}</span></button></li>`;
}
async function refresh() {
  state.workspace = await api("workspace");
  $("#login").hidden = true;
  $("#workspace").hidden = false;
  $("#connection-state").textContent = "Workspace connecté";
  const mode = state.workspace.mode;
  $("#mode").textContent =
    mode === "synthetic"
      ? "DÉMO · réponses simulées"
      : mode === "unconfigured"
        ? "Clé Jev requise"
        : "JEV · appels facturables";
  $("#mode").classList.toggle(
    "warning",
    mode === "synthetic" || mode === "unconfigured",
  );
  render();
}
const viewText = {
  studio: [
    "CONCEVOIR · TESTER · VERSIONNER",
    "Des données à la décision.",
    "Créez une politique, testez ses résultats et exportez un contrat réutilisable.",
  ],
  bridge: [
    "IMPORTER · SOURCER · STRUCTURER",
    "Vos données, prêtes pour Jev.",
    "Inspectez les champs extraits et conservez leur origine avant toute évaluation.",
  ],
  sheets: [
    "ÉVALUER · CORRIGER · EXPORTER",
    "Une décision par ligne.",
    "Choisissez vos données, fixez un budget et examinez chaque résultat.",
  ],
  forms: [
    "DÉCLARER · PRÉVISUALISER · INTÉGRER",
    "Le formulaire vient du contrat.",
    "Les champs et les résultats autorisés suivent la politique sélectionnée.",
  ],
  agents: [
    "DÉCIDER · VALIDER · EXÉCUTER",
    "Des workflows qui parlent JSON.",
    "Chaque action est validée par l’opérateur. Les exécutions sont persistées et rejouables.",
  ],
  plugins: [
    "CONNECTER · VÉRIFIER · ÉTENDRE",
    "Des extensions sous contrat.",
    "Parcourez les plugins approuvés par le serveur et testez leurs entrées et sorties.",
  ],
};
function render() {
  if (!state.workspace) return;
  const t = viewText[state.view];
  $("#eyebrow").textContent = t[0];
  $("#page-title").textContent = t[1];
  $("#page-description").textContent = t[2];
  $("#breadcrumb").textContent =
    "Workspace / " +
    {
      bridge: "StateBridge",
      sheets: "Decision Sheets",
      forms: "UI Builder",
      agents: "JSON Agents",
      plugins: "Plugins",
      studio: "Studio",
    }[state.view];
  document
    .querySelectorAll("[data-view]")
    .forEach((button) =>
      button.classList.toggle("active", button.dataset.view === state.view),
    );
  $("#metrics").innerHTML = [
    ["Politiques", state.workspace.packs.length, "versionnées"],
    ["Sources", state.workspace.documents.length, "importées"],
    ["Traitements", state.workspace.jobs.length, "persistés"],
    ["Plugins", state.workspace.plugins.length, "activés"],
  ]
    .map(
      ([label, value, note]) =>
        `<article class="metric"><div class="metric-label">${label}</div><div class="metric-value">${value}<span class="metric-note">${note}</span></div></article>`,
    )
    .join("");
  $("#content").innerHTML = {
    studio: studioView,
    bridge: bridgeView,
    sheets: sheetsView,
    forms: formsView,
    agents: agentsView,
    plugins: pluginsView,
  }[state.view]();
}
function studioView() {
  const current = selectedPack(),
    pack = current.data,
    q = Object.values(pack.questions)[0],
    threshold = pack.rules[0]?.all.find((v) => v.op === "gte")?.value ?? 0.9;
  return `<div class="grid"><div><section class="panel"><div class="panel-head"><h2>Politique de décision</h2><span class="badge">DecisionPacks v1</span></div><label>Politique<select id="pack-select">${packOptions()}</select></label><div class="actions"><button data-action="new-pack">Nouvelle politique</button></div><form id="policy-form"><div class="field-row"><label>Nom<input name="name" value="${escape(pack.name)}" required></label><label>Version<input name="version" value="${escape(pack.version)}" required pattern="[0-9]+\\.[0-9]+\\.[0-9]+"></label></div><label>Question<textarea name="instructions" required>${escape(q.instructions)}</textarea></label><label>Choix · un identifiant et sa description par ligne<textarea class="editor" name="criteria" required>${escape(
    Object.entries(q.criteria ?? {})
      .map(([k, v]) => k + " | " + v)
      .join("\n"),
  )}</textarea></label><div class="field-row"><label>Probabilité minimale<input name="threshold" type="number" min="0" max="1" step="0.01" value="${threshold}"></label><label>Modèle épinglé<input name="model" value="${escape(pack.model)}" required></label></div><p>Éditeur simple : une question Choice sur le champ <code>text</code>. Les décisions sous le seuil partent en revue. Modifiez la version avant d’enregistrer un changement.</p><div class="actions"><button class="primary">Enregistrer la politique</button><button type="button" data-action="export-pack">Exporter le pack ↓</button></div></form><details><summary class="muted">Contrat JSON complet</summary><label>DecisionPack<textarea id="pack-json" class="editor">${escape(json(pack))}</textarea></label><button data-action="save-json-pack">Enregistrer le JSON</button></details></section><section class="panel"><div class="panel-head"><h2>Comparer des questions</h2><span class="badge">Question Forge</span></div><p>Les formulations sont comparées sur un jeu de développement. Le gagnant est ensuite évalué sur des exemples distincts. Maximum : 100 prédictions.</p><details><summary>Configurer une expérience</summary><label>Expérience JSON<textarea id="experiment-spec" class="editor">${escape(json(experimentExample()))}</textarea></label><button data-action="experiment" class="primary">Lancer la comparaison</button></details></section></div><div><section class="panel"><div class="panel-head"><h2>Un même contrat, six modules</h2></div><div class="flow"><span>Source</span>→<span>État</span>→<span>Politique</span>→<span>Décision</span></div>${[
    [
      "Importer une source",
      "CSV, JSON, texte, HTML, email simple ou PDF textuel.",
    ],
    [
      "Vérifier sur vos exemples",
      "Fixez un budget, examinez les erreurs et corrigez les résultats.",
    ],
    [
      "Réutiliser la décision",
      "Exportez le pack vers nos addons ou appelez l’API JSON.",
    ],
  ]
    .map(
      ([title, text], i) =>
        `<div class="step"><span class="step-number">${i + 1}</span><div><strong>${title}</strong><p>${text}</p></div></div>`,
    )
    .join(
      "",
    )}<div class="actions"><button data-view="bridge">Importer des données →</button><button data-view="forms">Tester le formulaire</button></div></section>${list(
    "Traitements récents",
    state.workspace.jobs.slice(0, 5).map((j) =>
      listRow({
        action: "open-job",
        id: j.id,
        title: j.data.pack.name,
        subtitle: `${j.data.processed} / ${j.data.rowIds.length} lignes`,
        date: j.updated,
        badge: statusName(j.data.status),
      }),
    ),
  )}${list(
    "Expériences",
    state.workspace.experiments.map((x) =>
      listRow({
        action: "open-experiment",
        id: x.id,
        title: x.data.selectedCandidate.id,
        subtitle: `${x.data.calls} prédictions · score réservé ${(x.data.heldout.accuracy * 100).toFixed(1)} %`,
        date: x.updated,
        icon: "◇",
      }),
    ),
  )}</div></div>`;
}
function experimentExample() {
  return {
    model: selectedPack().data.model,
    maxEvaluations: 10,
    candidates: [
      {
        id: "specific",
        instructions:
          "Which team should handle state.text? Choose one department.",
        criteria: {
          billing: "Charges and invoices",
          technical: "Software bugs",
          sales: "Pricing requests",
        },
      },
      {
        id: "brief",
        instructions: "Classify state.text by department.",
        criteria: {
          billing: "Charges and invoices",
          technical: "Software bugs",
          sales: "Pricing requests",
        },
      },
    ],
    development: [
      {
        id: "d1",
        text: "Please refund the duplicate invoice",
        label: "billing",
      },
      { id: "d2", text: "The software crashes on launch", label: "technical" },
    ],
    heldout: [
      { id: "h1", text: "What is the price for ten seats?", label: "sales" },
    ],
  };
}
function bridgeView() {
  const doc = state.document;
  return `<div class="grid"><div><section class="panel"><div class="panel-head"><h2>Importer une source</h2><span class="muted">3 Mo · 500 lignes</span></div><div class="file-drop"><strong>Choisir un document local</strong><input id="source-file" type="file" accept=".csv,.json,.txt,.md,.html,.htm,.eml,.pdf" aria-label="Choisir un document local"></div><form id="import-form"><div class="field-row"><label>Nom<input name="name" id="import-name" value="tickets.csv" required></label><label>Format<select name="format" id="import-format">${["csv", "json", "text", "html", "email", "pdf"].map((f) => `<option>${f}</option>`).join("")}</select></label></div><label>Contenu<textarea name="content" id="import-content" class="editor" placeholder="id,text&#10;1,Ma demande…"></textarea></label><button class="primary">Extraire et inspecter</button></form><p>Les PDF scannés nécessitent un plugin OCR. L’import email accepte les messages simples sans pièces jointes.</p></section>${list(
    "Sources du workspace",
    state.workspace.documents.map((d) =>
      listRow({
        action: "open-document",
        id: d.id,
        title: d.source.name,
        subtitle: `${d.count} lignes · ${d.source.format}`,
        date: d.updated,
        icon: "⇥",
      }),
    ),
  )}</div><section class="panel"><div class="panel-head"><h2>${doc ? escape(doc.data.source.name) : "Aperçu de l’extraction"}</h2>${doc ? `<span class="badge">${doc.data.rows.length} lignes</span>` : ""}</div>${doc ? `${doc.data.warnings.map((w) => `<p class="error">${escape(w)}</p>`).join("")}${documentTable(doc.data)}<div class="actions"><button class="primary" data-view="sheets">Évaluer ces lignes →</button><button data-action="export-document">Exporter les données</button></div>` : '<div class="empty">Importez un fichier pour examiner ses champs et leur provenance.</div>'}</section></div>`;
}
function documentTable(doc) {
  const fields = Object.keys(doc.rows[0].fields);
  return `<div class="table-wrap"><table><thead><tr><th>Ligne</th>${fields.map((f) => `<th>${escape(f)}</th>`).join("")}<th>Source</th></tr></thead><tbody>${doc.rows
    .slice(0, 100)
    .map(
      (row) =>
        `<tr><td>${escape(row.id)}</td>${fields.map((f) => `<td>${escape(typeof row.fields[f] === "object" ? JSON.stringify(row.fields[f]) : row.fields[f])}</td>`).join("")}<td><button data-action="evidence" data-id="${escape(row.id)}">Voir</button></td></tr>`,
    )
    .join(
      "",
    )}</tbody></table></div>${doc.rows.length > 100 ? "<p>Aperçu limité aux 100 premières lignes. Toutes les lignes sont conservées.</p>" : ""}`;
}
function sheetsView() {
  const doc = state.document,
    pack = selectedPack().data,
    job = state.job;
  return `<section class="panel"><div class="panel-head"><h2>Configurer le traitement</h2><span class="badge">Budget explicite</span></div><div class="field-row"><label>Source<select id="document-select"><option value="">Sélectionner une source</option>${state.workspace.documents.map((d) => `<option value="${d.id}" ${doc?.id === d.id ? "selected" : ""}>${escape(d.source.name)} · ${d.count} lignes</option>`).join("")}</select></label><label>Politique<select id="pack-select">${packOptions()}</select></label></div>${
    doc
      ? `<form id="batch-form"><div class="field-row">${Object.entries(
          pack.inputs,
        )
          .map(
            ([field, type]) =>
              `<label>${escape(field)} ← colonne source<select name="map:${escape(field)}">${Object.keys(
                doc.data.rows[0].fields,
              )
                .map(
                  (k) =>
                    `<option value="${escape(k)}" ${k === field ? "selected" : ""}>${escape(k)} (${type})</option>`,
                )
                .join("")}</select></label>`,
          )
          .join(
            "",
          )}<label>Nombre de lignes / budget d’appels<input name="budget" type="number" min="1" max="${Math.min(100, doc.data.rows.length)}" value="${Math.min(25, doc.data.rows.length)}" required></label></div><div class="actions"><button class="primary">Évaluer les lignes</button><button type="button" data-action="preview-map">Vérifier le mapping</button></div></form>`
      : "<p>Importez une source dans StateBridge pour commencer.</p>"
  }</section>
 ${job ? `<section class="panel"><div class="panel-head"><h2>Résultats · ${escape(statusName(job.data.status))}</h2><span class="muted">${job.data.results.length} / ${job.data.rowIds.length} lignes</span></div>${resultsTable(job)}<div class="actions"><button data-action="export-results">Exporter CSV ↓</button><button data-action="export-job">Exporter JSON ↓</button>${job.data.status === "running" ? '<button data-action="cancel-job">Annuler la suite</button>' : '<button data-action="replay-job">Comparer avec la politique actuelle</button>'}</div><p>Une correction humaine reste distincte du jugement du modèle. Le rejeu ne rappelle pas Jev et ne permet de modifier que les règles de décision.</p></section>` : ""}
 ${list(
   "Historique des traitements",
   state.workspace.jobs.map((j) =>
     listRow({
       action: "open-job",
       id: j.id,
       title: j.data.pack.name,
       subtitle: `${j.data.processed} lignes · ${j.data.mode}`,
       date: j.updated,
       badge: statusName(j.data.status),
     }),
   ),
 )}`;
}
function resultsTable(job) {
  return `<div class="table-wrap"><table><thead><tr><th>Ligne</th><th>Données</th><th>Décision</th><th>Revue humaine</th><th>Détail</th></tr></thead><tbody>${job.data.results.map((r) => `<tr><td>${escape(r.rowId)}</td><td>${escape(JSON.stringify(r.state).slice(0, 150))}</td><td><span class="${r.status === "failed" ? "error" : ""}">${escape(r.record?.outcome ?? r.error)}</span></td><td>${escape(r.review?.outcome ?? "—")}</td><td><button data-action="review-row" data-id="${escape(r.rowId)}">Inspecter</button></td></tr>`).join("") || '<tr><td colspan="5">En attente des premiers résultats…</td></tr>'}</tbody></table></div>`;
}
function currentFormEntry() {
  return state.workspace.forms.find(
    (item) => item.packId === selectedPack().id,
  );
}
function getFormDraft() {
  const pack = selectedPack(),
    entry = currentFormEntry();
  if (
    !state.formDraft ||
    state.formDraft.packId !== pack.id ||
    state.formDraft.packRevision !== pack.revision ||
    state.formDraft.revision !== (entry.layout?.revision ?? 0)
  ) {
    state.formDraft = {
      packId: pack.id,
      packRevision: pack.revision,
      revision: entry.layout?.revision ?? 0,
      layout: structuredClone(entry.form),
    };
    state.formPreview = null;
  }
  return state.formDraft;
}
function readLayout() {
  return {
    title: $("#layout-title").value,
    description: $("#layout-description").value,
    fields: [...document.querySelectorAll(".layout-field")].map((node) => ({
      name: node.dataset.name,
      label: node.querySelector("[name=label]").value,
      control: node.querySelector("[name=control]").value,
      help: node.querySelector("[name=help]").value,
      placeholder: node.querySelector("[name=placeholder]").value,
      options: node
        .querySelector("[name=options]")
        .value.split("\n")
        .filter(Boolean),
    })),
  };
}
function formFields(form) {
  return form.fields
    .map((field) => {
      const attrs = `name="${escape(field.name)}" aria-label="${escape(field.label)}" placeholder="${escape(field.placeholder)}"`;
      const value =
        field.name === "text" ? "I was charged twice for my subscription." : "";
      const input =
        field.control === "select"
          ? `<select ${attrs}>${field.options.map((option) => `<option>${escape(option)}</option>`).join("")}</select>`
          : field.control === "textarea"
            ? `<textarea ${attrs} required>${escape(value)}</textarea>`
            : `<input ${attrs} type="${escape(field.control)}" ${field.type === "number" ? 'step="any" required' : field.type === "string" ? `required value="${escape(value)}"` : ""}>`;
      return `<label>${escape(field.label)}${input}${field.help ? `<small>${escape(field.help)}</small>` : ""}</label>`;
    })
    .join("");
}
function formsView() {
  const draft = getFormDraft(),
    entry = currentFormEntry(),
    form = state.formPreview ?? entry.form;
  return `<label>Politique<select id="pack-select">${packOptions()}</select></label><div class="grid"><section class="panel"><div class="panel-head"><h2>Construire le formulaire</h2><span class="badge">Révision ${draft.revision}</span></div>${entry.stale ? '<p class="error">La politique a changé. Vérifiez puis enregistrez ce formulaire avant de l’évaluer.</p>' : ""}<form id="layout-form"><label>Titre<input id="layout-title" maxlength="120" value="${escape(draft.layout.title)}"></label><label>Description<textarea id="layout-description" maxlength="1000">${escape(draft.layout.description)}</textarea></label>${draft.layout.fields
    .map((field, index) => {
      const type = selectedPack().data.inputs[field.name],
        controls =
          type === "string"
            ? ["text", "textarea", "select"]
            : type === "number"
              ? ["number"]
              : ["checkbox"];
      return `<fieldset class="layout-field" data-name="${escape(field.name)}"><legend>${escape(field.name)} · ${escape(type)}</legend><label>Libellé<input name="label" maxlength="120" value="${escape(field.label)}"></label><label>Contrôle<select name="control" aria-label="Contrôle">${controls.map((control) => `<option ${control === field.control ? "selected" : ""}>${control}</option>`).join("")}</select></label><label>Indication<input name="placeholder" maxlength="200" value="${escape(field.placeholder)}"></label><label>Aide<input name="help" maxlength="500" value="${escape(field.help)}"></label><label>Options de liste · une par ligne<textarea name="options">${escape((field.options ?? []).join("\n"))}</textarea></label><div class="actions"><button type="button" data-action="move-field" data-index="${index}" data-direction="-1" ${index === 0 ? "disabled" : ""}>Monter</button><button type="button" data-action="move-field" data-index="${index}" data-direction="1" ${index === draft.layout.fields.length - 1 ? "disabled" : ""}>Descendre</button></div></fieldset>`;
    })
    .join(
      "",
    )}<div class="actions"><button type="button" data-action="preview-form">Actualiser l’aperçu</button><button type="submit" class="primary">Enregistrer le formulaire</button></div></form><p>Les types et les champs viennent de la politique. Vous personnalisez leur présentation sans modifier le contrat de décision.</p></section><div><section class="panel"><div class="panel-head"><h2>Formulaire généré</h2><span class="badge">${escape(form.pack.version)}</span></div><h3>${escape(form.title)}</h3><p>${escape(form.description)}</p><form id="decision-form">${formFields(form)}<button class="primary" ${entry.stale || state.formPreview ? "disabled" : ""}>Évaluer ce formulaire</button></form>${state.formPreview ? "<p>Enregistrez cet aperçu pour l’évaluer.</p>" : ""}<div id="form-result"></div></section><section class="panel"><h2>Exporter</h2><div class="actions"><button data-action="export-form">Exporter le formulaire HTML</button><button data-action="export-form-schema">Exporter le schéma UI</button></div><p>Les exports utilisent la dernière version enregistrée. Le HTML autonome prépare un JSON ; le serveur du workspace réalise l’évaluation connectée.</p></section></div></div>`;
}
const defaultRoutes = () =>
  Object.fromEntries(
    [...new Set(selectedPack().data.rules.map((r) => r.outcome))].map(
      (outcome) => [
        outcome,
        {
          plugin: "annotation.prepare",
          bindings: { queue: { value: outcome }, text: { state: "text" } },
        },
      ],
    ),
  );
function agentsView() {
  return `<div class="grid"><section class="panel"><div class="panel-head"><h2>Nouveau workflow JSON</h2><span class="badge">Validation humaine</span></div><form id="agent-form"><label>Politique<select id="pack-select">${packOptions()}</select></label><label>Identifiant de requête<input name="requestId" value="run_${crypto.randomUUID().slice(0, 8)}" required></label><label>État JSON<textarea name="state" class="editor">${escape(json({ text: "I was charged twice for my subscription." }))}</textarea></label><button type="button" data-action="two-step-route">Exemple à deux étapes</button><label>Routes autorisées<textarea name="routes" class="editor">${escape(json(defaultRoutes()))}</textarea></label><button class="primary">Créer le workflow</button></form><p>L’action fournie prépare une annotation locale ; elle n’écrit dans aucun système externe. Ajoutez une action serveur approuvée pour vos intégrations.</p></section><div>${list(
    "Exécutions",
    state.workspace.runs.map((r) =>
      listRow({
        action: "open-run",
        id: r.id,
        title: r.id,
        subtitle: r.data.decision?.outcome ?? r.data.error ?? "Évaluation",
        date: r.updated,
        badge: statusName(r.data.status),
        icon: "⌘",
      }),
    ),
  )}<section class="panel"><h3>Reprise et rejeu</h3><p>Une action interrompue prend le statut « résultat incertain ». Le serveur ne la relance pas automatiquement. Le rejeu d’une trace terminée utilise les réponses enregistrées et ne rappelle pas les outils.</p></section></div></div>`;
}
function pluginsView() {
  return `<div class="plugin-grid">${state.workspace.plugins.map((p) => `<article class="plugin-card"><span class="badge">${escape(p.kind)} · ${escape(p.version)}</span><h3>${escape(p.id)}</h3><p>${escape(p.description)}</p><button data-action="plugin-detail" data-id="${escape(p.id)}">Inspecter le contrat →</button></article>`).join("")}</div><section class="panel"><h3>Activer une extension</h3><p>Déclarez son manifeste, son fichier local et son empreinte SHA-256 dans un fichier de configuration, puis démarrez avec <code>--plugins chemin/config.json</code>. L’interface ne télécharge et n’exécute aucun code arbitraire.</p><p>Les workers imposent une durée et une limite mémoire. Ils ne constituent pas une sandbox réseau ou système : n’activez que du code de confiance.</p><div class="actions"><button data-action="export-registry">Exporter le catalogue</button></div></section>`;
}
function currentMapping() {
  const form = $("#batch-form"),
    data = new FormData(form);
  return Object.fromEntries(
    Object.entries(selectedPack().data.inputs).map(([key, type]) => [
      key,
      { source: data.get("map:" + key), type },
    ]),
  );
}
async function loadDocument(id) {
  state.document = await api("document/" + id);
  state.upload = null;
  render();
}
async function openJob(id) {
  state.job = await api("job/" + id);
  state.view = "sheets";
  render();
  scheduleJobPoll();
}
function scheduleJobPoll() {
  clearTimeout(pollTimer);
  if (state.job?.data.status === "running")
    pollTimer = setTimeout(
      () =>
        run(async () => {
          const old = state.job;
          state.job = await api("job/" + old.id);
          if (state.view === "sheets") render();
          if (state.job.data.status !== "running") await refresh();
          scheduleJobPoll();
        }),
      900,
    );
}
async function openRun(id) {
  const run = await api("run/" + id);
  detail(
    "Workflow · " + id,
    `<span class="badge">${escape(statusName(run.data.status))}</span>${run.data.routes?.[run.data.decision?.outcome]?.steps ? `<p>Étapes terminées : ${(run.data.steps ?? []).filter((step) => step.status === "completed").length} / ${run.data.routes[run.data.decision.outcome].steps.length}. Chaque action nécessite sa propre validation.</p>` : ""}${pretty(run.data)}<div class="actions">${run.data.status === "awaiting_review" ? `<button class="primary" data-action="approve-run" data-id="${id}" data-revision="${run.revision}">Approuver cette action</button><button data-action="reject-run" data-id="${id}" data-revision="${run.revision}">Refuser</button>` : ""}${run.data.capsule ? `<button data-action="replay-run" data-id="${id}">Rejouer hors ligne</button>` : ""}</div>`,
  );
}
const actions = {
  "move-field": (button) => {
    const draft = getFormDraft();
    draft.layout = readLayout();
    const index = Number(button.dataset.index),
      next = index + Number(button.dataset.direction);
    if (next >= 0 && next < draft.layout.fields.length)
      [draft.layout.fields[index], draft.layout.fields[next]] = [
        draft.layout.fields[next],
        draft.layout.fields[index],
      ];
    render();
  },
  "preview-form": async () => {
    const draft = getFormDraft();
    draft.layout = readLayout();
    state.formPreview = (
      await api("form-preview", { packId: state.packId, layout: draft.layout })
    ).form;
    render();
  },
  "two-step-route": () => {
    const form = $("#agent-form");
    const routes = Object.fromEntries(
      [
        ...new Set([
          ...selectedPack().data.rules.map((rule) => rule.outcome),
          selectedPack().data.fallback,
        ]),
      ].map((outcome) => [
        outcome,
        {
          steps: [
            {
              id: "prepare",
              plugin: "annotation.prepare",
              bindings: { queue: { value: outcome }, text: { state: "text" } },
            },
            {
              id: "followup",
              plugin: "annotation.prepare",
              bindings: {
                queue: { value: "followup" },
                text: { step: "prepare", path: "/annotation/text" },
              },
            },
          ],
        },
      ]),
    );
    form.querySelector("[name=routes]").value = json(routes);
  },
  "new-pack": () =>
    detail(
      "Nouvelle politique",
      `<form id="new-pack-form"><label>Identifiant<input name="id" pattern="[a-zA-Z0-9_-]+" placeholder="document-routing" required></label><label>Nom du pack<input name="name" placeholder="documents/routing" required></label><p class="muted">La politique sélectionnée sert de point de départ. Vous pourrez modifier sa question et ses choix.</p><button class="primary">Créer la politique</button></form>`,
    ),
  "export-pack": () =>
    download("decision-pack.json", json(selectedPack().data)),
  "save-json-pack": async () => {
    const current = selectedPack();
    await api("pack", {
      id: current.id,
      revision: current.revision,
      pack: JSON.parse($("#pack-json").value),
    });
    await refresh();
    notice("Politique enregistrée.", "success");
  },
  experiment: async () => {
    const result = await api("experiment", {
      spec: JSON.parse($("#experiment-spec").value),
    });
    await refresh();
    detail("Comparaison de questions", pretty(result.data));
  },
  "open-experiment": (button) =>
    detail(
      "Expérience enregistrée",
      pretty(
        state.workspace.experiments.find((x) => x.id === button.dataset.id)
          .data,
      ),
    ),
  "open-document": (button) => loadDocument(button.dataset.id),
  "export-document": () =>
    download("source-records.json", json(state.document.data)),
  evidence: (button) => {
    const row = state.document.data.rows.find(
      (r) => r.id === button.dataset.id,
    );
    detail(
      "Origine · ligne " + row.id,
      pretty({
        source: state.document.data.source,
        fields: row.fields,
        evidence: row.evidence,
      }),
    );
  },
  "preview-map": async () =>
    detail(
      "État envoyé à Jev",
      pretty(
        await api("map", {
          documentId: state.document.id,
          rowId: state.document.data.rows[0].id,
          mapping: currentMapping(),
        }),
      ),
    ),
  "open-job": (button) => openJob(button.dataset.id),
  "cancel-job": async () => {
    await api("jobs/cancel", { id: state.job.id });
    notice(
      "Annulation demandée. Les résultats déjà enregistrés sont conservés.",
      "success",
    );
  },
  "export-results": async () =>
    download(
      "decisions.csv",
      await api("export/csv", { jobId: state.job.id }, { text: true }),
      "text/csv",
    ),
  "export-job": () => download("decision-run.json", json(state.job.data)),
  "replay-job": async () =>
    detail(
      "Changements de décision · sans nouvel appel",
      pretty(
        await api("replay", { jobId: state.job.id, pack: selectedPack().data }),
      ),
    ),
  "review-row": (button) => {
    const row = state.job.data.results.find(
        (r) => r.rowId === button.dataset.id,
      ),
      outcomes = [
        ...new Set([
          ...state.job.data.pack.rules.map((r) => r.outcome),
          state.job.data.pack.fallback,
        ]),
      ];
    detail(
      "Décision · ligne " + row.rowId,
      `${pretty(row)}${row.status === "succeeded" && state.job.data.status !== "running" ? `<form id="review-form" data-row="${escape(row.rowId)}"><label>Décision humaine<select name="outcome">${outcomes.map((o) => `<option ${o === (row.review?.outcome ?? row.record.outcome) ? "selected" : ""}>${escape(o)}</option>`).join("")}</select></label><label>Note<textarea name="note">${escape(row.review?.note ?? "")}</textarea></label><button class="primary">Enregistrer la revue</button></form>` : ""}`,
    );
  },
  "export-form": async () => {
    const result = await api("form", { packId: state.packId });
    download("decision-form.html", result.html, "text/html");
  },
  "export-form-schema": async () =>
    download(
      "decision-ui.json",
      json((await api("form", { packId: state.packId })).form),
    ),
  "open-run": (button) => openRun(button.dataset.id),
  "approve-run": async (button) => {
    $("#detail").close();
    const result = await api("runs/approve", {
      id: button.dataset.id,
      revision: Number(button.dataset.revision),
    });
    await refresh();
    await openRun(result.id);
  },
  "reject-run": async (button) => {
    $("#detail").close();
    await api("runs/reject", {
      id: button.dataset.id,
      revision: Number(button.dataset.revision),
    });
    await refresh();
  },
  "replay-run": async (button) => {
    const result = await api("runs/replay", { id: button.dataset.id });
    $("#detail").close();
    detail("Rejeu sans exécution d’outil", pretty(result));
  },
  "plugin-detail": (button) => {
    const plugin = state.workspace.plugins.find(
      (p) => p.id === button.dataset.id,
    );
    detail(
      plugin.id,
      `${pretty(plugin)}${plugin.kind === "transform" ? `<form id="plugin-form" data-plugin="${escape(plugin.id)}"><label>Entrée JSON<textarea name="input" class="editor">${escape(json({ text: "  A   document\n with whitespace.  " }))}</textarea></label><button class="primary">Tester le plugin</button></form><div id="plugin-result"></div>` : ""}`,
    );
  },
  "export-registry": () =>
    download("plugin-catalogue.json", json(state.workspace.plugins)),
};
document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.view) {
    state.view = button.dataset.view;
    render();
    return;
  }
  if (button.dataset.action && actions[button.dataset.action]) {
    event.preventDefault();
    if (button.disabled) return;
    button.disabled = true;
    run(() => actions[button.dataset.action](button)).finally(() => {
      button.disabled = false;
    });
  }
});
document.addEventListener("change", (event) =>
  run(async () => {
    if (event.target.id === "pack-select") {
      state.packId = event.target.value;
      render();
    }
    if (event.target.id === "document-select" && event.target.value)
      await loadDocument(event.target.value);
    if (event.target.id === "source-file") {
      const file = event.target.files[0];
      if (!file) return;
      if (file.size > 3_000_000) throw Error("La limite est de 3 Mo.");
      const ext = file.name.split(".").at(-1).toLowerCase(),
        format =
          {
            txt: "text",
            md: "text",
            html: "html",
            htm: "html",
            eml: "email",
            pdf: "pdf",
            csv: "csv",
            json: "json",
          }[ext] ?? "text";
      let content,
        encoding = "utf8";
      if (format === "pdf") {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 32768)
          binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
        content = btoa(binary);
        encoding = "base64";
      } else content = await file.text();
      state.upload = { name: file.name, format, content, encoding };
      $("#import-name").value = file.name;
      $("#import-format").value = format;
      $("#import-content").value =
        format === "pdf"
          ? "PDF sélectionné · extraction des pages textuelles"
          : content;
      $("#import-content").readOnly = format === "pdf";
    }
  }),
);
document.addEventListener("submit", (event) => {
  // Read the attribute because a form field named id shadows the DOM property.
  const form = event.target,
    formId = form.getAttribute("id");
  if (!formId) return;
  event.preventDefault();
  const button = form.querySelector("button[type=submit],button:not([type])");
  if (button?.disabled) return;
  if (button) button.disabled = true;
  run(async () => {
    const data = new FormData(form);
    if (formId === "layout-form") {
      const draft = getFormDraft();
      draft.layout = readLayout();
      await api("form-layout", { ...draft });
      state.formDraft = null;
      state.formPreview = null;
      await refresh();
      notice("Formulaire enregistré.", "success");
    }
    if (formId === "login-form") {
      state.token = $("#token").value.trim();
      sessionStorage.setItem("workbench-token", state.token);
      await refresh();
    }
    if (formId === "new-pack-form") {
      const pack = structuredClone(selectedPack().data);
      pack.name = String(data.get("name"));
      pack.version = "0.1.0";
      const result = await api("pack", {
        id: String(data.get("id")),
        revision: 0,
        pack,
      });
      state.packId = result.id;
      $("#detail").close();
      await refresh();
    }
    if (formId === "import-form") {
      const input =
        state.upload?.format === "pdf"
          ? state.upload
          : {
              name: data.get("name"),
              format: data.get("format"),
              content: data.get("content"),
            };
      state.document = await api("import", input);
      state.upload = null;
      await refresh();
      notice("Source importée. Aucun appel au modèle.", "success");
    }
    if (formId === "policy-form") {
      const criteria = {};
      for (const line of String(data.get("criteria"))
        .split("\n")
        .filter((x) => x.trim())) {
        const [raw, ...description] = line.split("|"),
          id = raw.trim();
        if (!/^[a-z][a-z0-9_]*$/.test(id) || Object.hasOwn(criteria, id))
          throw Error(
            "Identifiants de choix uniques : lettres minuscules, chiffres et _.",
          );
        criteria[id] = description.join("|").trim();
      }
      const threshold = Number(data.get("threshold")),
        pack = {
          schemaVersion: 1,
          name: String(data.get("name")),
          version: String(data.get("version")),
          model: String(data.get("model")),
          description: "Decision policy authored in Decision Workbench.",
          inputs: { text: "string" },
          questions: {
            department: {
              type: "choice",
              instructions: String(data.get("instructions")),
              criteria,
            },
          },
          rules: Object.keys(criteria)
            .filter((k) => k !== "other")
            .map((k) => ({
              id: k,
              outcome: k,
              all: [
                { field: "answers.department.choice", op: "eq", value: k },
                {
                  field: "answers.department.probabilities." + k,
                  op: "gte",
                  value: threshold,
                },
              ],
            })),
          fallback: "review",
        };
      const current = selectedPack();
      await api("pack", { id: current.id, revision: current.revision, pack });
      await refresh();
      notice("Nouvelle version enregistrée.", "success");
    }
    if (formId === "batch-form") {
      const budget = Number(data.get("budget"));
      state.job = await api("jobs", {
        documentId: state.document.id,
        packId: state.packId,
        mapping: currentMapping(),
        rowIds: state.document.data.rows.slice(0, budget).map((r) => r.id),
        maxCalls: budget,
      });
      await refresh();
      scheduleJobPoll();
    }
    if (formId === "decision-form") {
      const input = {};
      for (const [key, type] of Object.entries(selectedPack().data.inputs))
        input[key] =
          type === "boolean"
            ? data.has(key)
            : type === "number"
              ? Number(data.get(key))
              : data.get(key);
      const result = await api("evaluate", {
        formRevision: currentFormEntry().layout?.revision ?? 0,
        packId: state.packId,
        state: input,
      });
      $("#form-result").innerHTML =
        `<div class="inline-result">Décision : <strong>${escape(result.data.record.outcome)}</strong></div><details><summary>Détails de la décision</summary>${pretty(result.data.record)}</details>`;
    }
    if (formId === "review-form") {
      state.job = await api("review", {
        jobId: state.job.id,
        revision: state.job.revision,
        rowId: form.dataset.row,
        outcome: data.get("outcome"),
        note: data.get("note"),
      });
      $("#detail").close();
      render();
      notice("Revue enregistrée séparément du jugement.", "success");
    }
    if (formId === "agent-form") {
      const result = await api("runs", {
        requestId: data.get("requestId"),
        packId: state.packId,
        state: JSON.parse(data.get("state")),
        routes: JSON.parse(data.get("routes")),
      });
      await refresh();
      await openRun(result.id);
    }
    if (formId === "plugin-form") {
      const result = await api("plugins/execute", {
        id: form.dataset.plugin,
        input: JSON.parse(data.get("input")),
      });
      $("#plugin-result").innerHTML = pretty(result);
    }
  }).finally(() => {
    if (button) button.disabled = false;
  });
});
$("#load-demo").addEventListener("click", () =>
  run(async () => {
    const example = await api("example");
    state.document = await api("import", {
      name: "support-tickets.csv",
      format: "csv",
      content: example.csv,
    });
    state.view = "sheets";
    await refresh();
    notice(
      "Exemple chargé. Le mode du serveur indique si les évaluations sont simulées ou réelles.",
      "success",
    );
  }),
);
$("#notice-close").addEventListener("click", () => {
  $("#notice").hidden = true;
});
$("#refresh").addEventListener("click", () => run(refresh));
$("#close-detail").addEventListener("click", () => $("#detail").close());
$("#logout").addEventListener("click", () => {
  sessionStorage.removeItem("workbench-token");
  state.token = "";
  state.workspace = null;
  clearTimeout(pollTimer);
  $("#workspace").hidden = true;
  $("#login").hidden = false;
  $("#connection-state").textContent = "Déconnecté";
});
if (state.token) run(refresh);
