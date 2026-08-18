/* VendorIQ Command Center — 6. Project management: Gantt + task list + drill-downs. */

function daysBetween(a, b) {
  return (new Date(b) - new Date(a)) / (24 * 60 * 60 * 1000);
}

function ganttPercent(dateStr, rangeStart, rangeEnd) {
  const total = daysBetween(rangeStart, rangeEnd);
  const pos = daysBetween(rangeStart, dateStr);
  return Math.min(100, Math.max(0, (pos / total) * 100));
}

function renderGantt(plan) {
  const rangeStart = plan.schedule.build_start;
  const rangeEnd = plan.schedule.demo_day;
  const todayIso = new Date().toISOString().slice(0, 10);
  const todayPct = ganttPercent(todayIso, rangeStart, rangeEnd);

  const rows = plan.releases
    .map((r) => {
      const left = ganttPercent(r.starts_on, rangeStart, rangeEnd);
      const rawWidth = ganttPercent(r.ends_on, rangeStart, rangeEnd) - left;
      const width = Math.max(rawWidth, 1.5);
      const demoTag = r.is_demo_target ? ' <span class="badge info">demo target</span>' : "";
      return `
        <div class="gantt-row">
          <div class="gantt-label"><a href="#/pm/release/${r.key}">${r.name}</a>${demoTag}</div>
          <div class="gantt-track">
            <a class="gantt-bar" href="#/pm/release/${r.key}" style="left:${left}%;width:${width}%"
               title="${r.starts_on} &rarr; ${r.ends_on}"></a>
          </div>
        </div>`;
    })
    .join("");

  return `
    <div class="gantt">
      <div class="gantt-row gantt-header">
        <div class="gantt-label"></div>
        <div class="gantt-track">
          <div class="gantt-marker" style="left:${todayPct}%" title="Today (${todayIso})"></div>
        </div>
      </div>
      ${rows}
    </div>
    <p class="sub">Range: ${rangeStart} &rarr; demo day ${rangeEnd}. Dashed marker is today.</p>`;
}

function taskRow(story) {
  const slipped = story.due_on !== story.due_baseline_on;
  const slipTag = slipped
    ? `<span class="badge warn">moved from ${story.due_baseline_on}</span>`
    : `<span class="badge neutral">no slippage</span>`;
  return `
    <a class="card" href="#/pm/story/${story.id}">
      <div class="label">${story.id} &middot; ${story.release}</div>
      <div class="value" style="font-size:16px">${CC.escapeHtml(story.title)}</div>
      <div class="sub">Due ${story.due_on} ${slipTag} ${CC.stateBadge(story.verification.state)}</div>
    </a>`;
}

function renderStoryDetail(ctx, id) {
  const stories = CC.joinStories(ctx.plan, ctx.progress);
  const story = stories.find((s) => s.id === id);
  if (!story) return crumb("#/pm", "Project management") + `<div class="empty-state"><h3>Not found</h3></div>`;
  const reqs = (ctx.plan.requirements || []).filter((r) => (r.fulfilled_by || []).includes(id));
  const reqLinks = reqs.map((r) => `<a class="card" href="#/kb/requirement/${r.id}"><div class="label">${r.id}</div><div class="sub">${CC.escapeHtml(r.statement)}</div></a>`).join("");
  const v = story.verification;
  return (
    crumb("#/pm", "Project management", story.id) +
    `<h1>${story.id}</h1>
     <p class="descriptor">${CC.escapeHtml(story.title)}</p>
     <p><em>${CC.escapeHtml(story.narrative)}</em></p>
     <div class="grid cols-3">
       ${statLike("Release", story.release)}
       ${statLike("Owner", story.owner)}
       ${statLike("Due", `${story.due_on}${story.due_on !== story.due_baseline_on ? ` (was ${story.due_baseline_on})` : ""}`)}
     </div>
     <h2>Verification</h2>
     <p>${CC.stateBadge(v.state)} &middot; commit: <code>${v.commit || "none"}</code> &middot; points: ${v.points}</p>
     <h2>Requirements this story fulfils</h2>
     <div class="grid cols-2">${reqLinks || '<div class="empty-state"><h3>No requirement links this story yet</h3></div>'}</div>`
  );
}

function statLike(label, value) {
  return `<div class="card"><div class="label">${label}</div><div class="value" style="font-size:18px">${CC.escapeHtml(String(value))}</div></div>`;
}

function renderReleaseDetail(ctx, key) {
  const release = (ctx.plan.releases || []).find((r) => r.key === key);
  if (!release) return crumb("#/pm", "Project management") + `<div class="empty-state"><h3>Not found</h3></div>`;
  const stories = CC.joinStories(ctx.plan, ctx.progress).filter((s) => release.story_ids.includes(s.id));
  return (
    crumb("#/pm", "Project management", release.name) +
    `<h1>${release.name}</h1>
     <p class="descriptor">${release.starts_on} &rarr; ${release.ends_on}${release.is_demo_target ? " &middot; demo target" : ""}</p>
     <div class="grid cols-2">${stories.map(taskRow).join("")}</div>`
  );
}

function renderPM(ctx, rest) {
  if (rest[0] === "story") return renderStoryDetail(ctx, rest[1]);
  if (rest[0] === "release") return renderReleaseDetail(ctx, rest[1]);

  const stories = CC.joinStories(ctx.plan, ctx.progress).sort((a, b) => (a.due_on < b.due_on ? -1 : 1));
  return `
    <h1>6. Project management</h1>
    <p class="descriptor">Build ${ctx.plan.schedule.build_start} &rarr; ${ctx.plan.schedule.build_end}. Demo day ${ctx.plan.schedule.demo_day}.</p>
    ${renderGantt(ctx.plan)}
    <h2>Tasks</h2>
    <div class="grid cols-2">${stories.map(taskRow).join("")}</div>`;
}
