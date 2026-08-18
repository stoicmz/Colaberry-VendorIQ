/* VendorIQ Command Center — 7. AI agents (actually story owners; no scoped agent roster exists yet). */

function groupByOwner(stories) {
  const map = new Map();
  stories.forEach((s) => {
    if (!map.has(s.owner)) map.set(s.owner, []);
    map.get(s.owner).push(s);
  });
  return map;
}

function renderOwnerDetail(ctx, ownerSlug) {
  const stories = CC.joinStories(ctx.plan, ctx.progress);
  const groups = groupByOwner(stories);
  const owner = [...groups.keys()].find((o) => CC.slug(o) === ownerSlug);
  if (!owner) return crumb("#/agents", "AI agents") + `<div class="empty-state"><h3>Not found</h3></div>`;
  const owned = groups.get(owner);
  const verified = owned.filter((s) => s.verification.state === "verified").length;
  return (
    crumb("#/agents", "AI agents", owner) +
    `<h1>${owner}</h1>
     <p class="descriptor">This is an owner, not a scoped AI agent. ${verified} of ${owned.length} owned stories verified.</p>
     <p><span class="badge neutral">no skills registered yet</span> &middot; <span class="badge neutral">no runs recorded</span></p>
     <h2>Owns</h2>
     <div class="grid cols-2">${owned.map((s) => `<a class="card" href="#/pm/story/${s.id}"><div class="label">${s.id}</div><div class="sub">${CC.escapeHtml(s.title)}</div>${CC.stateBadge(s.verification.state)}</a>`).join("")}</div>`
  );
}

function renderAgents(ctx, rest) {
  if (rest[0] === "owner") return renderOwnerDetail(ctx, rest[1]);

  const stories = CC.joinStories(ctx.plan, ctx.progress);
  const groups = groupByOwner(stories);
  const roster = ctx.plan.derived.counts.agents_by_autonomy || {};
  const rosterNote =
    Object.keys(roster).length === 0
      ? "The plan does not carry a scoped agent roster yet (<code>plan.derived.counts.agents_by_autonomy</code> is empty)."
      : `Roster by autonomy: ${Object.entries(roster).map(([k, v]) => `${k}: ${v}`).join(", ")}.`;

  const cards = [...groups.entries()]
    .map(([owner, owned]) => {
      const verified = owned.filter((s) => s.verification.state === "verified").length;
      return `<a class="card" href="#/agents/owner/${CC.slug(owner)}">
        <div class="label">${owner}</div>
        <div class="value">${owned.length}</div>
        <div class="sub">stor${owned.length === 1 ? "y" : "ies"} owned &middot; ${verified} verified</div>
      </a>`;
    })
    .join("");

  return `
    <h1>7. AI agents</h1>
    <p class="descriptor">These are story owners, not scoped AI agents. ${rosterNote} No agent has run yet — there is no
    run history, last-run time, or success rate in this data because none of that exists until an agent is built and
    actually executes.</p>
    <div class="grid cols-3">${cards}</div>`;
}
