/* VendorIQ Command Center — data loading, joining, mode state.
   Everything the tabs render comes from these fetches at runtime.
   Never hardcode plan/progress content into a tab — fetch it here instead. */

const CC = (() => {
  const DATA_PATHS = {
    plan: ".colaberry/plan.json",
    progress: ".colaberry/progress.json",
    manifest: ".colaberry/manifest.json",
  };

  const STALE_MS = 7 * 24 * 60 * 60 * 1000;

  async function fetchJson(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`${path} responded ${res.status}`);
    return res.json();
  }

  let dataPromise = null;
  function loadAll() {
    if (!dataPromise) {
      dataPromise = Promise.all([
        fetchJson(DATA_PATHS.plan),
        fetchJson(DATA_PATHS.progress),
        fetchJson(DATA_PATHS.manifest),
      ]).then(([plan, progress, manifest]) => ({ plan, progress, manifest }));
    }
    return dataPromise;
  }

  function progressForStory(progress, storyId) {
    return (progress.stories || []).find((s) => s.id === storyId) || null;
  }

  function joinStories(plan, progress) {
    return (plan.stories || []).map((story) => {
      const p = progressForStory(progress, story.id);
      return { ...story, verification: p && p.verification ? p.verification : { state: "not_started", commit: null, points: 0 } };
    });
  }

  function formatDataAge(generatedAtIso) {
    const generated = new Date(generatedAtIso);
    const now = new Date();
    const ms = now - generated;
    const isStale = ms > STALE_MS;
    const absolute = generated.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    const days = Math.floor(ms / (24 * 60 * 60 * 1000));
    let relative;
    if (isNaN(ms)) relative = "unknown";
    else if (days <= 0) {
      const hours = Math.floor(ms / (60 * 60 * 1000));
      relative = hours <= 0 ? "just now" : `${hours} hour${hours === 1 ? "" : "s"} ago`;
    } else {
      relative = `${days} day${days === 1 ? "" : "s"} ago`;
    }
    return { absolute, relative, isStale };
  }

  // --- sample / real mode ---
  const MODE_KEY = "vq_mode";
  function getMode() {
    return localStorage.getItem(MODE_KEY) === "sample" ? "sample" : "real";
  }
  function setMode(mode) {
    localStorage.setItem(MODE_KEY, mode === "sample" ? "sample" : "real");
  }

  // Believable made-up progress, used only when sample mode is on, so every tab that
  // reads verification state (PM, Agents, Guardrails, KB) shows the shape of a project
  // partway through — never merged into the real .colaberry/progress.json data.
  const SAMPLE_STORY_STATE = {
    "STORY-001": { state: "verified", commit: "a1b2c3d", points: 5, criteria_total: 3, criteria_passed: 3 },
    "STORY-002": { state: "verified", commit: "a1b2c3d", points: 5, criteria_total: 3, criteria_passed: 3 },
    "STORY-003": { state: "verified", commit: "e4f5a6b", points: 8, criteria_total: 4, criteria_passed: 4 },
    "STORY-014": { state: "verified", commit: "e4f5a6b", points: 3, criteria_total: 2, criteria_passed: 2 },
    "STORY-004": { state: "verified", commit: "9c8d7e6", points: 5, criteria_total: 3, criteria_passed: 3 },
    "STORY-006": { state: "verified", commit: "9c8d7e6", points: 3, criteria_total: 3, criteria_passed: 3 },
    "STORY-007": { state: "verified", commit: "9c8d7e6", points: 5, criteria_total: 2, criteria_passed: 2 },
    "STORY-012": { state: "verified", commit: "1f2e3d4", points: 3, criteria_total: 3, criteria_passed: 3 },
    "STORY-005": { state: "in_progress", commit: null, points: 8, criteria_total: 3, criteria_passed: 1 },
    "STORY-011": { state: "submitted", commit: "7b6a5c4", points: 5, criteria_total: 3, criteria_passed: 2 },
    "STORY-013": { state: "in_progress", commit: null, points: 5, criteria_total: 3, criteria_passed: 0 },
    "STORY-008": { state: "not_started", commit: null, points: 8, criteria_total: 3, criteria_passed: 0 },
    "STORY-009": { state: "not_started", commit: null, points: 5, criteria_total: 3, criteria_passed: 0 },
    "STORY-010": { state: "not_started", commit: null, points: 8, criteria_total: 3, criteria_passed: 0 },
  };

  function buildSampleProgress() {
    const stories = Object.entries(SAMPLE_STORY_STATE).map(([id, s]) => ({
      id,
      verification: { state: s.state, commit: s.commit, points: s.points },
    }));
    const values = Object.values(SAMPLE_STORY_STATE);
    const totals = {
      stories_total: values.length,
      stories_verified: values.filter((s) => s.state === "verified").length,
      criteria_total: values.reduce((n, s) => n + s.criteria_total, 0),
      criteria_passed: values.reduce((n, s) => n + s.criteria_passed, 0),
      points_awarded: values.filter((s) => s.state === "verified").reduce((n, s) => n + s.points, 0),
    };
    return { schema_version: 1, stories, totals };
  }

  const SAMPLE_PROGRESS = buildSampleProgress();
  const SAMPLE_OVERVIEW_TOTALS = SAMPLE_PROGRESS.totals;

  const SAMPLE_MEASURES = [
    { id: "M-1 (sample)", statement: "Reduce time job seekers spend re-reading old recruiter threads to judge trustworthiness, from ~15 min to under 3 min per recruiter." },
    { id: "M-2 (sample)", statement: "Cut the rate of job seekers re-engaging a recruiter later flagged as unresponsive, by half within the trial period." },
  ];

  function slug(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  const STATE_BADGE = {
    not_started: { cls: "neutral", label: "Not started" },
    in_progress: { cls: "info", label: "In progress" },
    submitted: { cls: "warn", label: "Submitted" },
    verified: { cls: "good", label: "Verified" },
  };

  function stateBadge(state) {
    const b = STATE_BADGE[state] || { cls: "neutral", label: state || "unknown" };
    return `<span class="badge ${b.cls}">${b.label}</span>`;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  return {
    loadAll,
    joinStories,
    progressForStory,
    formatDataAge,
    getMode,
    setMode,
    SAMPLE_OVERVIEW_TOTALS,
    SAMPLE_PROGRESS,
    SAMPLE_MEASURES,
    slug,
    stateBadge,
    escapeHtml,
  };
})();
