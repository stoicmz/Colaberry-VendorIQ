/* VendorIQ Command Center — Outcomes, Users & use case, Guardrails, Systems tabs. */

function crumb(tabHref, tabLabel, subLabel) {
  return `<div class="crumb"><a href="${tabHref}">&larr; ${tabLabel}</a>${subLabel ? " / " + subLabel : ""}</div>`;
}

// --- 2. Outcomes ---
function renderOutcomes(ctx, rest) {
  const real = ctx.plan.derived.measures || [];
  const isSample = ctx.mode === "sample" && real.length === 0;
  const measures = isSample ? CC.SAMPLE_MEASURES : real;

  if (rest[0] === "measure") {
    const m = measures.find((x) => CC.slug(x.id) === rest[1]);
    if (!m) return crumb("#/outcomes", "Outcomes") + `<div class="empty-state"><h3>Not found</h3></div>`;
    return crumb("#/outcomes", "Outcomes", m.id) + `<h1>${m.id}</h1>${isSample ? '<span class="sample-flag">Sample data</span>' : ""}<p>${CC.escapeHtml(m.statement)}</p>`;
  }
  if (measures.length === 0) {
    return `
      <h1>2. Outcomes</h1>
      <p class="descriptor">The numbers this project has to move.</p>
      <div class="empty-state">
        <h3>No numeric targets yet</h3>
        <p>The plan does not carry any measures in <code>plan.derived.measures</code> yet. Once a target is
        defined in the plan, it appears here as its own card with a drill-down.</p>
      </div>`;
  }
  const flag = isSample ? '<p><span class="sample-flag">Sample data</span> — the real plan has no measures yet; these show the shape of the tab.</p>' : "";
  const cards = measures
    .map((m) => `<a class="card" href="#/outcomes/measure/${CC.slug(m.id)}"><div class="label">${m.id}</div><div class="sub">${CC.escapeHtml(m.statement)}</div></a>`)
    .join("");
  return `<h1>2. Outcomes</h1>${flag}<div class="grid cols-2">${cards}</div>`;
}

// --- 3. Users and use case ---
function renderUsers(ctx, rest) {
  const roles = ctx.plan.derived.roles || [];
  const stories = ctx.plan.stories || [];
  if (rest[0] === "role") {
    const role = roles.find((r) => CC.slug(r) === rest[1]);
    if (!role) return crumb("#/users", "Users & use case") + `<div class="empty-state"><h3>Not found</h3></div>`;
    const owned = stories.filter((s) => s.role === role);
    const rows = owned
      .map((s) => `<a class="card" href="#/pm/story/${s.id}"><div class="label">${s.id} &middot; ${s.release}</div><div class="sub">${CC.escapeHtml(s.narrative)}</div></a>`)
      .join("");
    return crumb("#/users", "Users & use case", role) + `
      <h1>${role}</h1>
      <p class="descriptor">${owned.length} stor${owned.length === 1 ? "y" : "ies"} written for this role.</p>
      <div class="grid cols-2">${rows || '<div class="empty-state"><h3>No stories yet</h3></div>'}</div>`;
  }
  const cards = roles
    .map((r) => {
      const count = stories.filter((s) => s.role === r).length;
      return `<a class="card" href="#/users/role/${CC.slug(r)}"><div class="label">${r}</div><div class="value">${count}</div><div class="sub">stor${count === 1 ? "y" : "ies"}</div></a>`;
    })
    .join("");
  return `
    <h1>3. Users and use case</h1>
    <p class="descriptor">Who this is for, taken from the role named in each story's "As a &hellip;" sentence.</p>
    <div class="grid cols-3">${cards}</div>`;
}

// --- 4. Guardrails ---
function renderGuardrails(ctx, rest) {
  const guardrails = ctx.plan.derived.guardrails || [];
  const reqs = ctx.plan.requirements || [];
  const joined = CC.joinStories(ctx.plan, ctx.progress);

  function guardrailStatus(g) {
    const req = reqs.find((r) => r.id === g.id);
    const storyIds = (req && req.fulfilled_by) || [];
    const storyStates = storyIds.map((id) => joined.find((s) => s.id === id)).filter(Boolean);
    const allVerified = storyStates.length > 0 && storyStates.every((s) => s.verification.state === "verified");
    return { req, storyStates, allVerified };
  }

  if (rest[0] === "req") {
    const g = guardrails.find((x) => x.id === rest[1]);
    if (!g) return crumb("#/guardrails", "Guardrails") + `<div class="empty-state"><h3>Not found</h3></div>`;
    const { storyStates, allVerified } = guardrailStatus(g);
    const rows = storyStates
      .map((s) => `<a class="card" href="#/pm/story/${s.id}"><div class="label">${s.id}</div><div class="sub">${CC.escapeHtml(s.title)}</div>${CC.stateBadge(s.verification.state)}</a>`)
      .join("");
    return crumb("#/guardrails", "Guardrails", g.id) + `
      <h1>${g.id}</h1>
      <p>${CC.escapeHtml(g.statement)}</p>
      ${allVerified ? '<span class="badge good">Enforced</span>' : '<span class="badge warn">Promise made, not yet kept</span>'}
      <h2>Stories that fulfil this guardrail</h2>
      <div class="grid cols-2">${rows || '<div class="empty-state"><h3>No story fulfils this requirement yet</h3></div>'}</div>`;
  }

  const cards = guardrails
    .map((g) => {
      const { allVerified } = guardrailStatus(g);
      const badge = allVerified ? '<span class="badge good">Enforced</span>' : '<span class="badge warn">Not yet kept</span>';
      return `<a class="card" href="#/guardrails/req/${g.id}"><div class="label">${g.id}</div><div class="sub">${CC.escapeHtml(g.statement)}</div>${badge}</a>`;
    })
    .join("");
  return `
    <h1>4. Guardrails</h1>
    <p class="descriptor">Promises this system makes. A guardrail is only enforced once every story that fulfils it is verified.</p>
    <div class="grid cols-2">${cards}</div>`;
}

// --- 5. Systems ---
const SYSTEM_ICONS = { Gmail: "✉", Outlook: "✉", LinkedIn: "in", Slack: "#", CRM: "▣", ATS: "▣" };

function renderSystems(ctx, rest) {
  const systems = ctx.plan.derived.systems || [];
  if (rest[0]) {
    const name = systems.find((s) => CC.slug(s) === rest[0]);
    if (!name) return crumb("#/systems", "Systems") + `<div class="empty-state"><h3>Not found</h3></div>`;
    return crumb("#/systems", "Systems", name) + `
      <h1>${name}</h1>
      <p><span class="badge neutral">not checked from here</span> &middot; last checked: never</p>
      <p class="descriptor">This name appears in the plan's system list only. Nothing in this repo can confirm whether it is
      actually connected — that is a fact about the running system, not this file. Note also REQ-009: this project must
      <strong>not</strong> integrate with any of these systems, so a real live connection here would itself be a guardrail
      violation, not a milestone.</p>`;
  }
  const rows = systems
    .map(
      (s) => `<a class="card" href="#/systems/${CC.slug(s)}">
        <div class="label">${s}</div>
        <div class="sub"><span class="badge neutral">&#9679; not checked from here</span> &middot; last checked: never</div>
      </a>`
    )
    .join("");
  return `
    <h1>5. Systems</h1>
    <p class="descriptor">What this connects to. Per REQ-009 (constraint), none of these are meant to ever be integrated —
    they are listed so that guardrail has something concrete to point at, not as a roadmap.</p>
    <div class="grid cols-3">${rows}</div>`;
}
