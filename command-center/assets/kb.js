/* VendorIQ Command Center — 8. Knowledge base: traceability table + offline "ask" panel. */

function buildSearchIndex(ctx) {
  const idx = [];
  (ctx.plan.requirements || []).forEach((r) =>
    idx.push({ tab: "Knowledge base", text: `${r.id} ${r.statement} ${r.kind} ${r.priority}`, label: `${r.id} — ${r.statement}`, href: `#/kb/requirement/${r.id}` })
  );
  CC.joinStories(ctx.plan, ctx.progress).forEach((s) =>
    idx.push({ tab: "Project management", text: `${s.id} ${s.title} ${s.narrative} ${s.role} ${s.owner}`, label: `${s.id} — ${s.title}`, href: `#/pm/story/${s.id}` })
  );
  (ctx.plan.derived.guardrails || []).forEach((g) =>
    idx.push({ tab: "Guardrails", text: `${g.id} ${g.statement}`, label: `${g.id} — ${g.statement}`, href: `#/guardrails/req/${g.id}` })
  );
  (ctx.plan.derived.systems || []).forEach((s) =>
    idx.push({ tab: "Systems", text: `${s} system integration`, label: s, href: `#/systems/${CC.slug(s)}` })
  );
  (ctx.plan.releases || []).forEach((r) =>
    idx.push({ tab: "Project management", text: `${r.key} ${r.name} release`, label: `${r.name} (${r.key})`, href: `#/pm/release/${r.key}` })
  );
  (ctx.plan.derived.roles || []).forEach((role) =>
    idx.push({ tab: "Users & use case", text: `${role} role`, label: role, href: `#/users/role/${CC.slug(role)}` })
  );
  return idx;
}

function runSearch(idx, query) {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (words.length === 0) return [];
  return idx
    .map((entry) => {
      const haystack = entry.text.toLowerCase();
      const score = words.reduce((n, w) => n + (haystack.includes(w) ? 1 : 0), 0);
      return { entry, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((r) => r.entry);
}

function renderAskPanel() {
  return `
    <div class="ask-panel">
      <form id="ask-form">
        <input type="text" id="ask-input" placeholder="Ask about this project's data (e.g. &quot;attribution&quot;, &quot;red flags&quot;, &quot;CRM&quot;)&hellip;" />
        <button type="submit">Ask</button>
      </form>
      <div id="ask-result"></div>
    </div>`;
}

function wireAskPanel(ctx) {
  const form = document.getElementById("ask-form");
  if (!form) return;
  const idx = buildSearchIndex(ctx);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = document.getElementById("ask-input").value.trim();
    const resultEl = document.getElementById("ask-result");
    if (!q) return;
    const hits = runSearch(idx, q);
    if (hits.length === 0) {
      resultEl.innerHTML = `<div class="ask-result"><p>I can't answer that from the current data — nothing in
        <code>plan.json</code> or <code>progress.json</code> matches &ldquo;${CC.escapeHtml(q)}&rdquo;.</p></div>`;
      return;
    }
    resultEl.innerHTML =
      `<div class="ask-result">` +
      hits.map((h) => `<div class="ask-hit"><div class="src">from ${h.tab}</div><a href="${h.href}">${CC.escapeHtml(h.label)}</a></div>`).join("") +
      `</div>`;
  });
}

function renderRequirementDetail(ctx, id) {
  const req = (ctx.plan.requirements || []).find((r) => r.id === id);
  if (!req) return crumb("#/kb", "Knowledge base") + `<div class="empty-state"><h3>Not found</h3></div>`;
  const stories = CC.joinStories(ctx.plan, ctx.progress).filter((s) => (req.fulfilled_by || []).includes(s.id));
  return (
    crumb("#/kb", "Knowledge base", req.id) +
    `<h1>${req.id}</h1>
     <p class="descriptor">${CC.escapeHtml(req.statement)}</p>
     <p><span class="badge info">${req.kind}</span> <span class="badge neutral">${req.priority}</span> <span class="badge neutral">${CC.escapeHtml(req.cluster)}</span></p>
     <h2>Fulfilled by</h2>
     <div class="grid cols-2">${stories.map((s) => `<a class="card" href="#/pm/story/${s.id}"><div class="label">${s.id}</div><div class="sub">${CC.escapeHtml(s.title)}</div>${CC.stateBadge(s.verification.state)}</a>`).join("") || '<div class="empty-state"><h3>No story fulfils this requirement yet</h3><p>A "' + req.priority + '" requirement with no story attached is a real gap.</p></div>'}</div>`
  );
}

function renderTraceTable(ctx) {
  const joined = CC.joinStories(ctx.plan, ctx.progress);
  const rows = (ctx.plan.requirements || [])
    .map((r) => {
      const stories = (r.fulfilled_by || []).map((id) => joined.find((s) => s.id === id)).filter(Boolean);
      const isGap = r.priority === "must" && stories.length === 0;
      const storyCell = stories.length
        ? stories.map((s) => `<a href="#/pm/story/${s.id}">${s.id}</a> ${CC.stateBadge(s.verification.state)}`).join("<br>")
        : !isGap
        ? '<span class="badge neutral">enforced by omission</span>'
        : r.kind === "CONSTRAINT"
        ? '<span class="badge risk">gap — no story (constraint: enforced by never building this)</span>'
        : '<span class="badge risk">gap — no story</span>';
      return `<tr class="${isGap ? "gap" : ""}">
        <td><a href="#/kb/requirement/${r.id}">${r.id}</a></td>
        <td>${CC.escapeHtml(r.statement)}</td>
        <td>${r.kind}</td>
        <td>${r.priority}</td>
        <td>${storyCell}</td>
      </tr>`;
    })
    .join("");
  return `
    <table class="trace">
      <thead><tr><th>Req</th><th>Statement</th><th>Kind</th><th>Priority</th><th>Fulfilled by</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderKB(ctx, rest) {
  if (rest[0] === "requirement") return renderRequirementDetail(ctx, rest[1]);
  return `
    <h1>8. Knowledge base</h1>
    <p class="descriptor">Everything the project knows about itself, sourced from <code>plan.requirements</code> and
    <code>plan.stories</code>. Ask below, or read the full traceability table.</p>
    ${renderAskPanel()}
    <h2>Traceability</h2>
    ${renderTraceTable(ctx)}`;
}
