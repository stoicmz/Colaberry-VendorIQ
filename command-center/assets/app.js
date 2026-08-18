/* VendorIQ Command Center — router, nav, and tab rendering. */

// All 9 tabs are built — see PROGRESS.md STORY-000.
const BUILD_PAUSED = false;

const TABS = [
  { id: "overview", num: 1, label: "Overview" },
  { id: "outcomes", num: 2, label: "Outcomes" },
  { id: "users", num: 3, label: "Users & use case" },
  { id: "guardrails", num: 4, label: "Guardrails" },
  { id: "systems", num: 5, label: "Systems" },
  { id: "pm", num: 6, label: "Project management" },
  { id: "agents", num: 7, label: "AI agents" },
  { id: "kb", num: 8, label: "Knowledge base" },
  { id: "datamodel", num: 9, label: "Data model" },
];

function currentRoute() {
  const raw = (location.hash || "#/overview").slice(2); // strip "#/"
  const parts = raw.split("/").filter(Boolean);
  return { tab: parts[0] || "overview", rest: parts.slice(1) };
}

function renderTopnav(activeTab) {
  const tabsHtml = TABS.map(
    (t) => `<a class="tab${t.id === activeTab ? " active" : ""}" href="#/${t.id}">${t.num}. ${t.label}</a>`
  ).join("");
  const mode = CC.getMode();
  return `
    <nav class="topnav">
      <div class="brand">VendorIQ <span class="dot">&middot;</span> Command Center</div>
      <div class="tabs">${tabsHtml}</div>
      <div class="spacer"></div>
      <div class="mode-toggle" role="group" aria-label="Data mode">
        <button data-mode="real" class="${mode === "real" ? "active" : ""}">Real</button>
        <button data-mode="sample" class="${mode === "sample" ? "active" : ""}">Sample</button>
      </div>
    </nav>`;
}

function renderStamp(manifest) {
  const age = CC.formatDataAge(manifest.generated_at);
  const cls = age.isStale ? "stamp stale" : "stamp";
  const warnTxt = age.isStale ? " — sync from the portal to refresh" : "";
  return `<div class="${cls}"><span class="dot"></span>Data as of ${age.absolute} (${age.relative})${warnTxt}</div>`;
}

function statTile(label, value, sub, href) {
  const inner = `<div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div>`;
  return href ? `<a class="card" href="${href}">${inner}</a>` : `<div class="card">${inner}</div>`;
}

function currentRelease(plan) {
  const today = new Date().toISOString().slice(0, 10);
  return (plan.releases || []).find((r) => today >= r.starts_on && today <= r.ends_on) || null;
}

function renderOverview(ctx) {
  const { plan, progress } = ctx;
  const totals = progress.totals;
  const rel = currentRelease(plan);
  const relHtml = rel
    ? `Currently in <strong>${rel.name}</strong> (${rel.starts_on} &rarr; ${rel.ends_on})`
    : `No release covers today's date (${new Date().toISOString().slice(0, 10)}) yet.`;

  const banner = BUILD_PAUSED
    ? `<div class="banner"><span class="banner-title">Build paused for review</span>
       Overview is built; the other eight tabs are scaffolded and reachable but not built yet.
       Say <strong>&ldquo;build the rest&rdquo;</strong> to continue.</div>`
    : "";

  return `
    ${banner}
    <h1>${plan.project.name}</h1>
    <p class="descriptor">${plan.project.descriptor}</p>
    <h2>Where we are</h2>
    <p>${relHtml}<br>Build window ${plan.schedule.build_start} &rarr; ${plan.schedule.build_end}. Demo day ${plan.schedule.demo_day}.</p>
    <div class="grid cols-3">
      ${statTile("Stories verified", `${totals.stories_verified} / ${totals.stories_total}`, "of the project's real stories", "#/pm")}
      ${statTile("Criteria passed", `${totals.criteria_passed} / ${totals.criteria_total}`, "acceptance criteria across all stories", "#/pm")}
      ${statTile("Points awarded", totals.points_awarded, "story points confirmed done", "#/pm")}
    </div>
  `;
}

function renderStub(tab) {
  return `
    <h1>${tab.num}. ${tab.label}</h1>
    <div class="empty-state">
      <h3>Not built yet</h3>
      <p>This tab is reachable but has no content yet. Say <code>build the rest</code> to have it built from
      <code>.colaberry/plan.json</code> and <code>.colaberry/progress.json</code>, same as the Overview tab.</p>
    </div>
  `;
}

function renderErrorState(err) {
  return `
    <h1>Command Center</h1>
    <div class="empty-state">
      <h3>Could not load project data</h3>
      <p>Fetching <code>.colaberry/plan.json</code>, <code>.colaberry/progress.json</code>, or
      <code>.colaberry/manifest.json</code> failed: <code>${(err && err.message) || err}</code></p>
      <p>If you opened this file directly (<code>file://</code>), browsers block JSON fetches from local disk.
      Serve it over HTTP instead (e.g. <code>python -m http.server</code> from the repo root, or GitHub Pages)
      and reload.</p>
    </div>
  `;
}

const TAB_RENDERERS = {
  overview: (ctx) => renderOverview(ctx),
  outcomes: (ctx, rest) => renderOutcomes(ctx, rest),
  users: (ctx, rest) => renderUsers(ctx, rest),
  guardrails: (ctx, rest) => renderGuardrails(ctx, rest),
  systems: (ctx, rest) => renderSystems(ctx, rest),
  pm: (ctx, rest) => renderPM(ctx, rest),
  agents: (ctx, rest) => renderAgents(ctx, rest),
  kb: (ctx, rest) => renderKB(ctx, rest),
  datamodel: () => renderDataModel(),
};

async function render() {
  const app = document.getElementById("app");
  const { tab, rest } = currentRoute();
  const activeTab = TABS.some((t) => t.id === tab) ? tab : "overview";

  app.innerHTML = renderTopnav(activeTab) + `<main id="main"><p>Loading project data&hellip;</p></main>`;
  wireNav();

  let data;
  try {
    data = await CC.loadAll();
  } catch (err) {
    document.getElementById("main").innerHTML = renderErrorState(err);
    return;
  }

  const mode = CC.getMode();
  const ctx = { ...data, mode, progress: mode === "sample" ? CC.SAMPLE_PROGRESS : data.progress };
  const main = document.getElementById("main");
  const renderer = TAB_RENDERERS[activeTab] || (() => renderStub(TABS.find((t) => t.id === activeTab)));
  const sampleRibbon =
    mode === "sample"
      ? `<div class="banner" style="border-color:var(--ai);background:var(--ai-bg);color:var(--ai)">
          <span class="sample-flag">Sample data</span> Every number and status on this tab is made up to show the
          shape of the page. Switch to Real to see what this project has actually produced.</div>`
      : "";
  main.innerHTML = renderStamp(ctx.manifest) + sampleRibbon + renderer(ctx, rest);

  if (activeTab === "kb" && rest.length === 0) wireAskPanel(ctx);
}

function wireNav() {
  document.querySelectorAll(".mode-toggle button").forEach((btn) => {
    btn.addEventListener("click", () => {
      CC.setMode(btn.dataset.mode);
      render();
    });
  });
}

window.addEventListener("hashchange", render);
window.addEventListener("DOMContentLoaded", render);
