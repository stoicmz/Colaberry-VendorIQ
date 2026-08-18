/* VendorIQ Project Blueprint — shared rendering, nav, search, agent. Reads the bare `BLUEPRINT` identifier. */
(function () {
  "use strict";

  var PAGES = [
    { id: "index", url: "index.html", label: "Command Center" },
    { id: "summary", url: "01-summary.html", label: "The Idea" },
    { id: "components", url: "02-components.html", label: "Components" },
    { id: "architecture", url: "03-architecture.html", label: "How It Fits Together" },
    { id: "dataflow", url: "04-dataflow.html", label: "Data Flow" },
    { id: "buildorder", url: "05-buildorder.html", label: "Build Order" },
    { id: "assumptions", url: "06-assumptions.html", label: "Assumptions" },
    { id: "coverage", url: "07-coverage.html", label: "Coverage & Open Question" }
  ];
  var SEQUENCE = ["summary", "components", "architecture", "dataflow", "buildorder", "assumptions", "coverage"];

  function pageById(id) { return PAGES.filter(function (p) { return p.id === id; })[0]; }
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function debounce(fn, ms) {
    var t;
    return function () { var args = arguments, ctx = this; clearTimeout(t); t = setTimeout(function () { fn.apply(ctx, args); }, ms); };
  }

  /* ---------------- Search: tokenizer, stemmer, index, scoring ---------------- */
  var STOPWORDS = ("a an and the of to in on for with that this is are be by as it its from or at into over per via so " +
    "not no every each every's this's these those which who what when where how than then them they own on's").split(" ");
  var STOP = {}; STOPWORDS.forEach(function (w) { STOP[w] = true; });

  function stem(w) {
    w = w.toLowerCase();
    if (w.length > 5 && w.slice(-3) === "ing") return w.slice(0, -3);
    if (w.length > 4 && w.slice(-2) === "ed") return w.slice(0, -2);
    if (w.length > 4 && w.slice(-3) === "ies") return w.slice(0, -3) + "y";
    if (w.length > 4 && w.slice(-2) === "es") return w.slice(0, -2);
    if (w.length > 3 && w.slice(-1) === "s" && w.slice(-2) !== "ss") return w.slice(0, -1);
    return w;
  }
  function tokenize(text) {
    return String(text || "").toLowerCase().match(/[a-z0-9']+/g) || [];
  }

  var SEARCH_DOCS = null;
  function buildSearchIndex() {
    if (SEARCH_DOCS) return SEARCH_DOCS;
    var docs = [];
    var B = BLUEPRINT;

    docs.push({ id: "idea-paragraph", section: "summary", sectionLabel: "The Idea", page: "01-summary.html", title: "The Idea (source paragraph)", text: B.idea.paragraph });
    docs.push({ id: "idea-guarantee", section: "summary", sectionLabel: "The Idea", page: "01-summary.html", title: "Day-One Guarantee", text: B.idea.guaranteeSentence });
    docs.push({ id: "idea-scope", section: "summary", sectionLabel: "The Idea", page: "01-summary.html", title: "Scope Note: Proprietary Methodology", text: B.idea.scopeNote });

    B.components.forEach(function (c) {
      docs.push({ id: "comp-" + c.id, section: "components", sectionLabel: "Components", page: "02-components.html#" + c.id, title: c.name, text: c.summary + " " + c.words.join("; ") + (c.note ? " " + c.note : "") });
    });

    docs.push({ id: "diagram", section: "architecture", sectionLabel: "How It Fits Together", page: "03-architecture.html", title: "Architecture Diagram", text: B.diagram.interpretation });

    B.dataFlow.steps.forEach(function (s) {
      docs.push({ id: "flow-" + s.n, section: "dataflow", sectionLabel: "Data Flow", page: "04-dataflow.html#step-" + s.n, title: "Step " + s.n + ": " + s.action, text: s.detail + " (" + s.actor + ")" });
    });
    docs.push({ id: "flow-interp", section: "dataflow", sectionLabel: "Data Flow", page: "04-dataflow.html", title: "Data Flow Sequence", text: B.dataFlow.interpretation });

    B.buildOrder.phases.forEach(function (p) {
      docs.push({ id: "phase-" + p.id, section: "buildorder", sectionLabel: "Build Order", page: "05-buildorder.html#" + p.id, title: p.name, text: p.proves + " Builds: " + p.builds.join(", ") });
    });
    docs.push({ id: "buildorder-interp", section: "buildorder", sectionLabel: "Build Order", page: "05-buildorder.html", title: "Build Order Timeline", text: B.buildOrder.interpretation });

    B.assumptions.forEach(function (a, i) {
      docs.push({ id: "assumption-" + i, section: "assumptions", sectionLabel: "Assumptions", page: "06-assumptions.html#assumption-" + i, title: a.assumption, text: a.impact });
    });

    B.coverage.covered.forEach(function (t, i) {
      docs.push({ id: "cov-yes-" + i, section: "coverage", sectionLabel: "Coverage", page: "07-coverage.html#covered", title: "Covered: " + t.slice(0, 60), text: t });
    });
    B.coverage.notCovered.forEach(function (t, i) {
      docs.push({ id: "cov-no-" + i, section: "coverage", sectionLabel: "Coverage", page: "07-coverage.html#notcovered", title: "Not Covered: " + t.slice(0, 60), text: t });
    });
    docs.push({ id: "open-question", section: "coverage", sectionLabel: "Coverage", page: "07-coverage.html#open-question", title: B.openQuestion.question, text: B.openQuestion.branchA.label + ": " + B.openQuestion.branchA.consequence + " | " + B.openQuestion.branchB.label + ": " + B.openQuestion.branchB.consequence });

    docs.forEach(function (d) {
      d.titleStems = tokenize(d.title).filter(function (t) { return !STOP[t]; }).map(stem);
      d.textStems = tokenize(d.text).filter(function (t) { return !STOP[t]; }).map(stem);
      d.titleLower = d.title.toLowerCase();
      d.textLower = d.text.toLowerCase();
    });
    SEARCH_DOCS = docs;
    return docs;
  }

  function countMatches(stems, targetStem) {
    var n = 0;
    for (var i = 0; i < stems.length; i++) if (stems[i] === targetStem) n++;
    return n;
  }

  function searchBlueprint(query, opts) {
    opts = opts || {};
    query = (query || "").trim();
    if (!query) return [];
    var docs = buildSearchIndex();
    var qLower = query.toLowerCase();
    var qTerms = tokenize(query).filter(function (t) { return !STOP[t]; });
    if (!qTerms.length) qTerms = tokenize(query);
    var qStems = qTerms.map(stem);

    var scored = docs.map(function (d) {
      var score = 0;
      qStems.forEach(function (qs) {
        score += countMatches(d.titleStems, qs) * 4;
        score += countMatches(d.textStems, qs) * 1.4;
      });
      if (qLower.length > 2) {
        if (d.titleLower.indexOf(qLower) !== -1) score += 9;
        if (d.textLower.indexOf(qLower) !== -1) score += 5;
      }
      return { doc: d, score: score };
    }).filter(function (r) { return r.score > 0; });

    scored.sort(function (a, b) { return b.score - a.score; });
    var results = scored.map(function (r) { return r.doc; });
    if (opts.excludeSection) results = results.filter(function (d) { return d.section !== opts.excludeSection; });
    if (opts.onlySection) results = results.filter(function (d) { return d.section === opts.onlySection; });
    if (opts.limit) results = results.slice(0, opts.limit);
    return results;
  }

  function highlightText(text, query) {
    var terms = tokenize(query).filter(function (t) { return !STOP[t] && t.length > 1; });
    if (!terms.length) return escapeHtml(text);
    var escaped = escapeHtml(text);
    terms.sort(function (a, b) { return b.length - a.length; });
    terms.forEach(function (t) {
      var re = new RegExp("(" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[a-z']*)", "gi");
      escaped = escaped.replace(re, "<mark>$1</mark>");
    });
    return escaped;
  }

  function snippetFor(text, query, maxLen) {
    maxLen = maxLen || 150;
    if (text.length <= maxLen) return highlightText(text, query);
    var qLower = (query || "").toLowerCase();
    var idx = text.toLowerCase().indexOf(qLower.split(" ")[0] || "");
    var start = Math.max(0, idx - 40);
    var slice = (start > 0 ? "…" : "") + text.slice(start, start + maxLen) + (start + maxLen < text.length ? "…" : "");
    return highlightText(slice, query);
  }

  /* ---------------- Theme ---------------- */
  function getTheme() { return localStorage.getItem("vendoriq_theme") || ""; }
  function applyTheme(t) {
    if (t) document.documentElement.setAttribute("data-theme", t);
    else document.documentElement.removeAttribute("data-theme");
  }
  function toggleTheme() {
    var cur = getTheme();
    var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    var effectiveDark = cur ? cur === "dark" : prefersDark;
    var next = effectiveDark ? "light" : "dark";
    localStorage.setItem("vendoriq_theme", next);
    applyTheme(next);
    document.dispatchEvent(new CustomEvent("viq:theme-changed"));
  }
  applyTheme(getTheme());

  /* ---------------- Mermaid + fullscreen figures ---------------- */
  var mermaidReady = false;
  var pendingMermaid = [];
  function whenMermaidReady(fn) {
    if (window.mermaid) { fn(); return; }
    pendingMermaid.push(fn);
  }
  window.addEventListener("load", function () {
    if (window.mermaid && !mermaidReady) {
      mermaidReady = true;
      var isDark = document.documentElement.getAttribute("data-theme") === "dark" ||
        (!document.documentElement.getAttribute("data-theme") && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
      window.mermaid.initialize({ startOnLoad: false, securityLevel: "loose", theme: isDark ? "dark" : "default", fontFamily: "Segoe UI, system-ui, sans-serif" });
      pendingMermaid.forEach(function (fn) { fn(); });
      pendingMermaid = [];
    }
  });

  var mermaidRegistry = []; // { container, code } re-rendered on theme change
  var mermaidCounter = 0;

  function renderOneMermaid(container, code) {
    whenMermaidReady(function () {
      mermaidCounter++;
      var id = "mmd-" + mermaidCounter + "-" + Date.now();
      window.mermaid.render(id, code).then(function (res) {
        container.innerHTML = res.svg;
      }).catch(function (err) {
        container.innerHTML = '<div class="ask-error">Diagram failed to render (needs internet on first load for the Mermaid library): ' + escapeHtml(err.message || String(err)) + "</div>";
      });
    });
  }

  document.addEventListener("viq:theme-changed", function () {
    if (!window.mermaid) return;
    var isDark = document.documentElement.getAttribute("data-theme") === "dark";
    window.mermaid.initialize({ startOnLoad: false, securityLevel: "loose", theme: isDark ? "dark" : "default", fontFamily: "Segoe UI, system-ui, sans-serif" });
    mermaidRegistry.forEach(function (entry) { renderOneMermaid(entry.container, entry.code); });
  });

  function openFigureModal(title, sourceEl) {
    var backdrop = document.getElementById("viq-modal");
    var stage = backdrop.querySelector(".modal-stage");
    var titleEl = backdrop.querySelector(".modal-title");
    titleEl.textContent = title;
    stage.innerHTML = '<div class="zoom-inner"></div>';
    var inner = stage.querySelector(".zoom-inner");
    inner.appendChild(sourceEl.cloneNode(true));
    var scale = 1;
    function applyScale() { inner.style.transform = "scale(" + scale + ")"; }
    applyScale();
    backdrop.querySelector(".zoom-in").onclick = function () { scale = Math.min(4, scale + 0.25); applyScale(); };
    backdrop.querySelector(".zoom-out").onclick = function () { scale = Math.max(0.3, scale - 0.25); applyScale(); };
    backdrop.querySelector(".zoom-reset").onclick = function () { scale = 1; applyScale(); };
    backdrop.classList.add("open");
    backdrop.setAttribute("aria-hidden", "false");
    backdrop.querySelector(".modal-close").focus();
  }
  function closeFigureModal() {
    var backdrop = document.getElementById("viq-modal");
    backdrop.classList.remove("open");
    backdrop.setAttribute("aria-hidden", "true");
  }

  function mountFigure(containerId, opts) {
    // opts: {title, kind:'mermaid'|'svg', code, svg, interpretation}
    var host = document.getElementById(containerId);
    if (!host) return;
    var bodyClass = opts.kind === "mermaid" ? "figure-body mermaid-box" : "figure-body";
    host.className = "figure";
    host.innerHTML =
      '<div class="figure-head"><div class="figure-title">' + escapeHtml(opts.title) + '</div>' +
      '<button type="button" class="expand-btn" aria-label="Expand ' + escapeHtml(opts.title) + ' full screen">⤢ Expand</button></div>' +
      '<div class="' + bodyClass + '"></div>' +
      (opts.interpretation ? '<div class="interpretation"><b>What this means:</b> ' + escapeHtml(opts.interpretation) + "</div>" : "");
    var bodyEl = host.querySelector(".figure-body");
    if (opts.kind === "mermaid") {
      mermaidRegistry.push({ container: bodyEl, code: opts.code });
      renderOneMermaid(bodyEl, opts.code);
    } else {
      bodyEl.innerHTML = opts.svg;
    }
    host.querySelector(".expand-btn").addEventListener("click", function () {
      var el = bodyEl.querySelector("svg") || bodyEl;
      openFigureModal(opts.title, el);
    });
  }

  /* ---------------- SVG illustration generators (data-driven from BLUEPRINT) ---------------- */
  function wrapLines(text, maxChars) {
    var words = String(text).split(/\s+/), lines = [], cur = "";
    words.forEach(function (w) {
      if ((cur + " " + w).trim().length > maxChars) { lines.push(cur.trim()); cur = w; }
      else cur = (cur + " " + w).trim();
    });
    if (cur) lines.push(cur);
    return lines;
  }
  function tspans(lines, x, startY, lh) {
    return lines.map(function (l, i) { return '<tspan x="' + x + '" y="' + (startY + i * lh) + '">' + escapeHtml(l) + "</tspan>"; }).join("");
  }

  function svgIdeaPipeline() {
    var w = 860, h = 220;
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Idea as inputs, pipeline, output">' +
      '<defs><marker id="arrow1" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="var(--accent)"/></marker></defs>' +
      rectBlock(20, 60, 230, 100, "var(--info-bg)", "var(--info)", "Inputs", ["Job seeker logs each", "recruiter interaction as", "it happens"]) +
      arrowLine(250, 110, 330, 110) +
      rectBlock(330, 40, 220, 140, "var(--card)", "var(--accent)", "VendorIQ Pipeline", ["Capture → validate →", "normalize → recompute", "behavior pattern"]) +
      arrowLine(550, 110, 630, 110) +
      rectBlock(630, 60, 210, 100, "var(--good-bg)", "var(--good)", "Output", ["A clear, trustworthy,", "always up-to-date picture", "of each vendor"]) +
      "</svg>";
  }
  function rectBlock(x, y, w, h, fill, stroke, title, lines) {
    return '<g><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="12" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.5"/>' +
      '<text x="' + (x + w / 2) + '" y="' + (y + 24) + '" text-anchor="middle" font-size="13.5" font-weight="700" fill="var(--text)">' + escapeHtml(title) + "</text>" +
      '<text x="' + (x + w / 2) + '" y="' + (y + 44) + '" text-anchor="middle" font-size="11.5" fill="var(--muted)">' + tspans(lines, x + w / 2, y + 44, 15) + "</text></g>";
  }
  function arrowLine(x1, y1, x2, y2) {
    return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="var(--accent)" stroke-width="2" marker-end="url(#arrow1)"/>';
  }

  var LAYER_COLORS = {
    Frontend: ["var(--info-bg)", "var(--info)"],
    Backend: ["var(--neutral-bg)", "var(--neutral)"],
    Data: ["var(--good-bg)", "var(--good)"],
    Auth: ["var(--warn-bg)", "var(--warn)"],
    AI: ["var(--ai-bg)", "var(--ai)"]
  };
  function svgLayers() {
    var order = ["Frontend", "Auth", "Backend", "Data", "AI"];
    var byLayer = {};
    BLUEPRINT.components.forEach(function (c) { (byLayer[c.layer] = byLayer[c.layer] || []).push(c); });
    var w = 900, rowH = 62, pad = 14, y = 16;
    var rows = [];
    order.forEach(function (layer) {
      var comps = byLayer[layer] || [];
      if (!comps.length) return;
      var colors = LAYER_COLORS[layer];
      var boxW = Math.min(200, (w - 140) / Math.max(comps.length, 1) - 10);
      var x = 130;
      var nodes = comps.map(function (c) {
        var nx = x; x += boxW + 10;
        var label = wrapLines(c.name, 20);
        var deferred = c.category === "deferred";
        return '<rect x="' + nx + '" y="' + (y + 6) + '" width="' + boxW + '" height="' + (rowH - 16) + '" rx="9" fill="' + colors[0] + '" stroke="' + colors[1] + '" stroke-width="1.3" stroke-dasharray="' + (deferred ? "4,3" : "0") + '"/>' +
          '<text x="' + (nx + boxW / 2) + '" y="' + (y + 6 + (rowH - 16) / 2 - (label.length - 1) * 6) + '" text-anchor="middle" font-size="10.5" font-weight="700" fill="var(--text)">' + tspans(label, nx + boxW / 2, y + 6 + (rowH - 16) / 2 - (label.length - 1) * 6, 12) + "</text>";
      }).join("");
      rows.push('<text x="16" y="' + (y + rowH / 2 + 4) + '" font-size="11.5" font-weight="700" fill="' + colors[1] + '">' + escapeHtml(layer) + "</text>" + nodes);
      y += rowH;
    });
    return '<svg viewBox="0 0 ' + w + " " + (y + 10) + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Components grouped by layer">' + rows.join("") + "</svg>";
  }

  function svgRibbon() {
    var steps = BLUEPRINT.dataFlow.steps;
    var w = Math.max(900, steps.length * 150), h = 190, x = 20;
    var segW = (w - 40) / steps.length;
    var parts = steps.map(function (s, i) {
      var comp = BLUEPRINT.components.filter(function (c) { return c.id === s.component; })[0];
      var isAI = comp && comp.usesAI;
      var cx = x + i * segW;
      var fill = isAI ? "var(--ai-bg)" : "var(--info-bg)";
      var stroke = isAI ? "var(--ai)" : "var(--info)";
      var label = wrapLines(s.action, 20);
      return '<g>' +
        '<circle cx="' + (cx + segW / 2) + '" cy="34" r="16" fill="' + stroke + '" />' +
        '<text x="' + (cx + segW / 2) + '" y="39" text-anchor="middle" font-size="13" font-weight="800" fill="var(--accent-ink)">' + s.n + "</text>" +
        '<rect x="' + (cx + 8) + '" y="60" width="' + (segW - 16) + '" height="88" rx="10" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.2"/>' +
        '<text x="' + (cx + segW / 2) + '" y="86" text-anchor="middle" font-size="11" font-weight="700" fill="var(--text)">' + tspans(label, cx + segW / 2, 86, 13) + "</text>" +
        (i < steps.length - 1 ? '<line x1="' + (cx + segW - 4) + '" y1="34" x2="' + (cx + segW + 4) + '" y2="34" stroke="var(--border)" stroke-width="2"/>' : "") +
        "</g>";
    }).join("");
    var legend = '<circle cx="20" cy="' + (h - 14) + '" r="6" fill="var(--info)"/><text x="32" y="' + (h - 10) + '" font-size="11" fill="var(--muted)">core path</text>' +
      '<circle cx="120" cy="' + (h - 14) + '" r="6" fill="var(--ai)"/><text x="132" y="' + (h - 10) + '" font-size="11" fill="var(--muted)">touches the AI layer (deferred)</text>';
    return '<svg viewBox="0 0 ' + w + " " + h + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Data flow steps as a numbered ribbon">' + parts + legend + "</svg>";
  }

  function svgTimeline() {
    var phases = BLUEPRINT.buildOrder.phases;
    var totalDays = phases.reduce(function (s, p) { return s + p.durationDays; }, 0);
    var w = 900, barH = 46, gap = 10, x = 16, y = 30;
    var scale = (w - 32 - (phases.length - 1) * gap) / totalDays;
    var parts = phases.map(function (p, i) {
      var pw = p.durationDays * scale;
      var isGate = p.id === "phase-3";
      var fill = isGate ? "var(--good-bg)" : "var(--info-bg)";
      var stroke = isGate ? "var(--good)" : "var(--info)";
      var block = '<g>' +
        '<rect x="' + x + '" y="' + y + '" width="' + pw + '" height="' + barH + '" rx="9" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + (isGate ? 2.4 : 1.2) + '"/>' +
        '<text x="' + (x + pw / 2) + '" y="' + (y + barH / 2 - 3) + '" text-anchor="middle" font-size="11" font-weight="700" fill="var(--text)">' + escapeHtml(p.name.replace(/^Phase \d+ . /, "")) + "</text>" +
        '<text x="' + (x + pw / 2) + '" y="' + (y + barH / 2 + 12) + '" text-anchor="middle" font-size="10" fill="var(--muted)">' + escapeHtml(p.window) + "</text>" +
        (isGate ? '<text x="' + (x + pw / 2) + '" y="' + (y - 8) + '" text-anchor="middle" font-size="10.5" font-weight="800" fill="var(--good)">RELEASE GATE</text>' : "") +
        "</g>";
      x += pw + gap;
      return block;
    }).join("");
    return '<svg viewBox="0 0 ' + w + " " + (y + barH + 20) + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Build phases as a proportional timeline">' + parts + "</svg>";
  }

  function svgCoverageGrid() {
    var cols = [
      { key: "dayOne", label: "Day One" },
      { key: "persists", label: "Persists Data" },
      { key: "userFacing", label: "User-Facing" },
      { key: "usesAI", label: "Uses AI" }
    ];
    var comps = BLUEPRINT.components;
    var rowH = 30, headH = 26, nameW = 210, colW = 100, x0 = 10, y0 = 10;
    var w = nameW + colW * cols.length + x0 * 2, h = headH + rowH * comps.length + y0 * 2;
    var header = '<text x="' + x0 + '" y="' + (y0 + 18) + '" font-size="11" font-weight="700" fill="var(--muted)">Component</text>' +
      cols.map(function (c, i) { return '<text x="' + (x0 + nameW + i * colW + colW / 2) + '" y="' + (y0 + 18) + '" text-anchor="middle" font-size="10.5" font-weight="700" fill="var(--muted)">' + escapeHtml(c.label) + "</text>"; }).join("");
    var rows = comps.map(function (comp, ri) {
      var y = y0 + headH + ri * rowH;
      var vals = { dayOne: comp.category === "day-one", persists: comp.persists, userFacing: comp.userFacing, usesAI: comp.usesAI };
      var rowBg = ri % 2 === 0 ? "transparent" : "var(--bg)";
      var nameCell = '<rect x="' + x0 + '" y="' + y + '" width="' + (nameW + colW * cols.length) + '" height="' + rowH + '" fill="' + rowBg + '"/>' +
        '<text x="' + (x0 + 6) + '" y="' + (y + rowH / 2 + 4) + '" font-size="11.5" font-weight="600" fill="var(--text)">' + escapeHtml(comp.name) + "</text>";
      var cells = cols.map(function (c, ci) {
        var v = vals[c.key];
        var cx = x0 + nameW + ci * colW + colW / 2;
        var fill = v ? "var(--good)" : "var(--muted)";
        var symbol = v ? "✓" : "–";
        return '<text x="' + cx + '" y="' + (y + rowH / 2 + 4) + '" text-anchor="middle" font-size="13" font-weight="800" fill="' + fill + '">' + symbol + "</text>";
      }).join("");
      return nameCell + cells;
    }).join("");
    return '<svg viewBox="0 0 ' + w + " " + h + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Coverage grid of components by concern">' + header + rows + "</svg>";
  }

  function svgFork() {
    var q = BLUEPRINT.openQuestion;
    var w = 900, h = 300;
    var qLines = wrapLines(q.question, 60);
    var aLines = wrapLines(q.branchA.label + " — " + q.branchA.consequence, 44);
    var bLines = wrapLines(q.branchB.label + " — " + q.branchB.consequence, 44);
    return '<svg viewBox="0 0 ' + w + " " + h + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Open question fork">' +
      '<rect x="200" y="14" width="500" height="' + (44 + qLines.length * 14) + '" rx="10" fill="var(--warn-bg)" stroke="var(--warn)" stroke-width="1.4"/>' +
      '<text x="450" y="34" text-anchor="middle" font-size="11" font-weight="800" fill="var(--warn)">OPEN QUESTION</text>' +
      '<text x="450" y="52" text-anchor="middle" font-size="11.5" fill="var(--text)">' + tspans(qLines, 450, 52, 15) + "</text>" +
      '<line x1="450" y1="' + (58 + qLines.length * 14) + '" x2="230" y2="140" stroke="var(--border)" stroke-width="2"/>' +
      '<line x1="450" y1="' + (58 + qLines.length * 14) + '" x2="670" y2="140" stroke="var(--border)" stroke-width="2"/>' +
      '<rect x="30" y="140" width="400" height="' + (30 + aLines.length * 14) + '" rx="10" fill="var(--neutral-bg)" stroke="var(--neutral)" stroke-width="1.3"/>' +
      '<text x="230" y="160" text-anchor="middle" font-size="11.5" fill="var(--text)">' + tspans(aLines, 230, 160, 14) + "</text>" +
      '<rect x="470" y="140" width="400" height="' + (30 + bLines.length * 14) + '" rx="10" fill="var(--info-bg)" stroke="var(--info)" stroke-width="1.3"/>' +
      '<text x="670" y="160" text-anchor="middle" font-size="11.5" fill="var(--text)">' + tspans(bLines, 670, 160, 14) + "</text>" +
      "</svg>";
  }

  function svgAssumptionLedger() {
    var items = BLUEPRINT.assumptions;
    var w = 900, pad = 14, rowGap = 10, x0 = 16;
    var y = 14;
    var rows = items.map(function (a) {
      var aLines = wrapLines(a.assumption, 58);
      var iLines = wrapLines(a.impact, 58);
      var lines = Math.max(aLines.length, iLines.length);
      var rowH = Math.max(52, 26 + lines * 14);
      var block =
        '<rect x="' + x0 + '" y="' + y + '" width="' + (w - x0 * 2) + '" height="' + rowH + '" rx="9" fill="var(--card)" stroke="var(--border)" stroke-width="1.2"/>' +
        '<circle cx="' + (x0 + 18) + '" cy="' + (y + rowH / 2) + '" r="9" fill="var(--warn-bg)" stroke="var(--warn)" stroke-width="1.2"/>' +
        '<text x="' + (x0 + 18) + '" y="' + (y + rowH / 2 + 4) + '" text-anchor="middle" font-size="10.5" font-weight="800" fill="var(--warn)">!</text>' +
        '<text x="' + (x0 + 40) + '" y="' + (y + 18) + '" font-size="9.5" font-weight="700" letter-spacing="0.04em" fill="var(--muted)">ASSUMES</text>' +
        '<text x="' + (x0 + 40) + '" y="' + (y + 32) + '" font-size="11" fill="var(--text)">' + tspans(aLines, x0 + 40, y + 32, 13) + '</text>' +
        '<text x="' + (w / 2 + 30) + '" y="' + (y + 18) + '" font-size="9.5" font-weight="700" letter-spacing="0.04em" fill="var(--muted)">IMPACT IF WRONG</text>' +
        '<text x="' + (w / 2 + 30) + '" y="' + (y + 32) + '" font-size="11" fill="var(--text)">' + tspans(iLines, w / 2 + 30, y + 32, 13) + '</text>' +
        '<line x1="' + (w / 2 + 10) + '" y1="' + (y + 8) + '" x2="' + (w / 2 + 10) + '" y2="' + (y + rowH - 8) + '" stroke="var(--border)" stroke-width="1"/>';
      y += rowH + rowGap;
      return block;
    }).join("");
    return '<svg viewBox="0 0 ' + w + " " + y + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Assumptions and their impact if wrong">' + rows + "</svg>";
  }

  /* ---------------- Command Center tile art (mini previews) ---------------- */
  function tileArtNodeGraph() {
    return '<svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<circle cx="30" cy="50" r="10" fill="var(--info)"/><circle cx="100" cy="25" r="10" fill="var(--accent)"/>' +
      '<circle cx="100" cy="75" r="10" fill="var(--good)"/><circle cx="170" cy="50" r="10" fill="var(--warn)"/>' +
      '<line x1="38" y1="46" x2="92" y2="29" stroke="var(--border)" stroke-width="2"/>' +
      '<line x1="38" y1="54" x2="92" y2="71" stroke="var(--border)" stroke-width="2"/>' +
      '<line x1="108" y1="27" x2="162" y2="47" stroke="var(--border)" stroke-width="2"/>' +
      '<line x1="108" y1="73" x2="162" y2="53" stroke="var(--border)" stroke-width="2"/></svg>';
  }
  function tileArtComponents() {
    var colors = ["var(--info)", "var(--warn)", "var(--neutral)", "var(--neutral)", "var(--neutral)", "var(--neutral)", "var(--good)", "var(--ai)", "var(--ai)"];
    var boxes = BLUEPRINT.components.map(function (c, i) {
      var x = 8 + (i % 3) * 64, y = 8 + Math.floor(i / 3) * 30;
      return '<rect x="' + x + '" y="' + y + '" width="56" height="22" rx="5" fill="' + colors[i % colors.length] + '" opacity="' + (c.category === "deferred" ? 0.45 : 0.9) + '"/>';
    }).join("");
    return '<svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + boxes + "</svg>";
  }
  function tileArtFlow() {
    var n = BLUEPRINT.dataFlow.steps.length;
    var parts = [];
    for (var i = 0; i < n; i++) {
      var x = 8 + i * (184 / n);
      parts.push('<circle cx="' + (x + 6) + '" cy="50" r="7" fill="var(--accent)"/>');
      if (i < n - 1) parts.push('<line x1="' + (x + 13) + '" y1="50" x2="' + (x + 184 / n) + '" y2="50" stroke="var(--border)" stroke-width="2"/>');
    }
    return '<svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + parts.join("") + "</svg>";
  }
  function tileArtPhases() {
    var phases = BLUEPRINT.buildOrder.phases;
    var total = phases.reduce(function (s, p) { return s + p.durationDays; }, 0);
    var x = 8, colors = ["var(--info)", "var(--good)", "var(--accent)", "var(--neutral)"];
    var parts = phases.map(function (p, i) {
      var w = (p.durationDays / total) * 184;
      var r = '<rect x="' + x + '" y="42" width="' + w + '" height="16" rx="4" fill="' + colors[i % colors.length] + '" opacity="' + (p.id === "phase-3" ? 1 : 0.55) + '"/>';
      x += w + 2;
      return r;
    }).join("");
    return '<svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + parts + "</svg>";
  }
  function tileArtGrid() {
    var parts = [];
    for (var r = 0; r < 4; r++) for (var c = 0; c < 5; c++) {
      var on = (r + c) % 3 !== 0;
      parts.push('<rect x="' + (8 + c * 37) + '" y="' + (8 + r * 22) + '" width="32" height="17" rx="3" fill="' + (on ? "var(--good)" : "var(--border)") + '" opacity="' + (on ? 0.85 : 0.6) + '"/>');
    }
    return '<svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + parts.join("") + "</svg>";
  }
  function tileArtAssumptions() {
    return '<svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      [0, 1, 2, 3, 4].map(function (i) { return '<rect x="10" y="' + (6 + i * 18) + '" width="180" height="12" rx="4" fill="var(--warn)" opacity="' + (0.35 + i * 0.1) + '"/>'; }).join("") +
      "</svg>";
  }
  function tileArtIdea() {
    return '<svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<circle cx="100" cy="50" r="34" fill="none" stroke="var(--accent)" stroke-width="3"/>' +
      '<circle cx="100" cy="50" r="6" fill="var(--accent)"/>' +
      '<line x1="100" y1="16" x2="100" y2="4" stroke="var(--accent)" stroke-width="3"/>' +
      "</svg>";
  }

  /* ---------------- Ask panel ---------------- */
  var ASK_MODELS = ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"];

  function scopedBlueprintFor(scope, pageId) {
    if (scope === "whole") return BLUEPRINT;
    var slice = { meta: BLUEPRINT.meta, idea: BLUEPRINT.idea };
    if (pageId === "components") slice.components = BLUEPRINT.components;
    else if (pageId === "architecture") slice.diagram = BLUEPRINT.diagram, slice.components = BLUEPRINT.components;
    else if (pageId === "dataflow") slice.dataFlow = BLUEPRINT.dataFlow;
    else if (pageId === "buildorder") slice.buildOrder = BLUEPRINT.buildOrder;
    else if (pageId === "assumptions") slice.assumptions = BLUEPRINT.assumptions;
    else if (pageId === "coverage") slice.coverage = BLUEPRINT.coverage, slice.openQuestion = BLUEPRINT.openQuestion;
    else slice = BLUEPRINT;
    return slice;
  }

  function mountAskPanel(containerId, pageId) {
    var host = document.getElementById(containerId);
    if (!host) return;
    host.className = "ask-panel";
    host.innerHTML =
      '<div class="ask-head"><h2>Ask the blueprint</h2>' +
      '<div class="mode-switch" role="tablist" aria-label="Ask mode">' +
      '<button type="button" class="mode-btn active" data-mode="search" role="tab" aria-selected="true">Search — no key</button>' +
      '<button type="button" class="mode-btn" data-mode="claude" role="tab" aria-selected="false">Claude — needs key</button>' +
      "</div></div>" +
      '<div class="ask-settings" data-settings="claude">' +
      '<input type="password" class="ask-key" placeholder="Paste your Anthropic API key (stored only in this browser)" autocomplete="off" />' +
      '<select class="ask-model">' + ASK_MODELS.map(function (m) { return '<option value="' + m + '"' + (m === "claude-opus-5" ? " selected" : "") + ">" + m + "</option>"; }).join("") + "</select>" +
      '<div class="scope-toggle"><button type="button" class="scope-btn active" data-scope="section">This section</button><button type="button" class="scope-btn" data-scope="whole">Whole blueprint</button></div>' +
      "</div>" +
      '<p class="ask-note">Search mode works fully offline. Claude mode sends your question and the blueprint data (never your key beyond the header) directly to the Anthropic API from your browser.</p>' +
      '<form class="ask-form"><input type="text" class="ask-q" placeholder="e.g. why is the Behavior Pattern Engine treated as a black box?" />' +
      '<button type="submit" class="ask-submit">Ask</button></form>' +
      '<div class="ask-results" aria-live="polite"><p class="ask-empty">Ask a question about VendorIQ’s architecture, components, data flow, build order, or assumptions.</p></div>';

    var mode = "search";
    var scope = "section";
    var resultsEl = host.querySelector(".ask-results");
    var modeBtns = host.querySelectorAll(".mode-btn");
    var settingsEl = host.querySelector('[data-settings="claude"]');
    var scopeBtns = host.querySelectorAll(".scope-btn");
    var keyInput = host.querySelector(".ask-key");
    var modelSelect = host.querySelector(".ask-model");

    var savedKey = localStorage.getItem("vendoriq_api_key");
    if (savedKey) keyInput.value = savedKey;
    var savedModel = localStorage.getItem("vendoriq_api_model");
    if (savedModel && ASK_MODELS.indexOf(savedModel) !== -1) modelSelect.value = savedModel;

    modeBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        mode = btn.getAttribute("data-mode");
        modeBtns.forEach(function (b) { b.classList.toggle("active", b === btn); b.setAttribute("aria-selected", b === btn ? "true" : "false"); });
        settingsEl.classList.toggle("open", mode === "claude");
      });
    });
    scopeBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        scope = btn.getAttribute("data-scope");
        scopeBtns.forEach(function (b) { b.classList.toggle("active", b === btn); });
      });
    });
    keyInput.addEventListener("change", function () { localStorage.setItem("vendoriq_api_key", keyInput.value); });
    modelSelect.addEventListener("change", function () { localStorage.setItem("vendoriq_api_model", modelSelect.value); });

    host.querySelector(".ask-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var q = host.querySelector(".ask-q").value.trim();
      if (!q) return;
      if (mode === "search") runSearchAsk(q); else runClaudeAsk(q);
    });

    function runSearchAsk(q) {
      var results = searchBlueprint(q, { limit: 8 });
      if (!results.length) {
        resultsEl.innerHTML = '<div class="ask-empty">No matches in the blueprint for that. That gap may itself be the answer — check <a href="07-coverage.html">What This Design Does Not Cover</a>.</div>';
        return;
      }
      resultsEl.innerHTML = results.map(function (d) {
        return '<div class="ask-card"><div class="ask-card-section">' + escapeHtml(d.sectionLabel) + '</div>' +
          '<div class="ask-card-title">' + highlightText(d.title, q) + '</div>' +
          '<div class="ask-card-snippet">' + snippetFor(d.text, q) + '</div>' +
          '<a href="' + d.page + '">Open section →</a></div>';
      }).join("");
    }

    function runClaudeAsk(q) {
      var key = keyInput.value.trim();
      if (!key) { resultsEl.innerHTML = '<div class="ask-error">Paste your Anthropic API key first, or switch to Search mode (no key needed).</div>'; return; }
      var model = modelSelect.value;
      var data = scopedBlueprintFor(scope, pageId);
      var system = "You are answering questions about the VendorIQ project blueprint. Use ONLY the following JSON data as your source of truth. If the answer is not contained in this data, say so plainly and suggest checking a different section instead of guessing.\n\n" + JSON.stringify(data);
      var body = { model: model, max_tokens: 16000, system: system, messages: [{ role: "user", content: q }] };
      if (model === "claude-opus-5" || model === "claude-sonnet-5") body.output_config = { effort: "low" };
      resultsEl.innerHTML = '<div class="ask-loading"><span class="spinner"></span> Asking ' + escapeHtml(model) + "…</div>";
      fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify(body)
      }).then(function (res) {
        if (res.status === 401) throw new Error("Bad API key (401 Unauthorized). Double-check the key you pasted, or use Search mode instead.");
        if (res.status === 429) throw new Error("Rate limited (429). Wait a moment and try again, or use Search mode instead.");
        if (!res.ok) throw new Error("Request failed (HTTP " + res.status + "). You can fall back to Search mode.");
        return res.json();
      }).then(function (data2) {
        if (data2.stop_reason === "refusal") {
          resultsEl.innerHTML = '<div class="ask-error">Claude declined to answer that. Try rephrasing, or use Search mode.</div>';
          return;
        }
        var text = (data2.content || []).filter(function (b) { return b.type === "text"; }).map(function (b) { return b.text; }).join("\n\n");
        resultsEl.innerHTML = '<div class="ask-answer">' + escapeHtml(text || "(No text in response.)") + "</div>";
      }).catch(function (err) {
        resultsEl.innerHTML = '<div class="ask-error">' + escapeHtml(err.message || "Network error — check your connection.") + ' You can always fall back to Search mode.</div>';
      });
    }
  }

  /* ---------------- Page chrome: nav, breadcrumbs, footer, keyboard, filter ---------------- */
  var currentPageFilterFn = null;
  function registerPageFilter(fn) { currentPageFilterFn = fn; }

  function renderNav(pageId) {
    var nav = document.createElement("div");
    nav.className = "topnav";
    nav.innerHTML =
      '<a class="brand" href="index.html"><span class="mark">VQ</span><span>VendorIQ Blueprint</span></a>' +
      (pageId !== "index" ? '<a class="cc-link" href="index.html">← Command Center</a>' : "") +
      '<span class="spacer"></span>' +
      '<div class="search-wrap"><input type="text" class="nav-search" placeholder="Search the blueprint…" aria-label="Search the blueprint" autocomplete="off" />' +
      '<span class="kbd-hint">/</span><div class="search-results" role="listbox"></div></div>' +
      '<button type="button" class="icon-btn theme-toggle" aria-label="Toggle dark mode" title="Toggle theme">◐</button>' +
      '<button type="button" class="icon-btn print-btn" aria-label="Print this page" title="Print">⎙</button>';
    document.body.insertBefore(nav, document.body.firstChild);

    var progress = document.createElement("div");
    progress.id = "scroll-progress";
    document.body.insertBefore(progress, document.body.firstChild);

    var skip = document.createElement("a");
    skip.className = "skip-link"; skip.href = "#main"; skip.textContent = "Skip to content";
    document.body.insertBefore(skip, document.body.firstChild);

    var backTop = document.createElement("button");
    backTop.id = "back-to-top"; backTop.type = "button"; backTop.setAttribute("aria-label", "Back to top"); backTop.textContent = "↑";
    document.body.appendChild(backTop);
    backTop.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });

    window.addEventListener("scroll", function () {
      var doc = document.documentElement;
      var pct = doc.scrollTop / Math.max(1, doc.scrollHeight - doc.clientHeight) * 100;
      progress.style.width = pct + "%";
      backTop.classList.toggle("show", doc.scrollTop > 400);
    });

    nav.querySelector(".theme-toggle").addEventListener("click", toggleTheme);
    nav.querySelector(".print-btn").addEventListener("click", function () { window.print(); });

    var searchInput = nav.querySelector(".nav-search");
    var searchResults = nav.querySelector(".search-results");
    var activeIdx = -1;

    function renderDropdown(q) {
      if (!q) { searchResults.classList.remove("open"); searchResults.innerHTML = ""; activeIdx = -1; return; }
      var results = searchBlueprint(q, { limit: 8 });
      if (!results.length) {
        searchResults.innerHTML = '<div class="sr-empty">No matches. Check <a href="07-coverage.html">Coverage</a> — a miss may be the answer.</div>';
      } else {
        searchResults.innerHTML = results.map(function (d, i) {
          return '<a class="sr-item" href="' + d.page + (d.page.indexOf("?") === -1 ? "?q=" + encodeURIComponent(q) : "&q=" + encodeURIComponent(q)) + '" data-i="' + i + '">' +
            '<div class="sr-section">' + escapeHtml(d.sectionLabel) + '</div>' +
            '<div class="sr-title">' + highlightText(d.title, q) + '</div>' +
            '<div class="sr-snippet">' + snippetFor(d.text, q, 110) + "</div></a>";
        }).join("");
      }
      searchResults.classList.add("open");
      activeIdx = -1;
    }

    var onSearchInput = debounce(function () {
      var q = searchInput.value.trim();
      renderDropdown(q);
      if (currentPageFilterFn) currentPageFilterFn(q);
    }, 120);
    searchInput.addEventListener("input", onSearchInput);
    searchInput.addEventListener("keydown", function (e) {
      var items = searchResults.querySelectorAll(".sr-item");
      if (e.key === "ArrowDown") { e.preventDefault(); activeIdx = Math.min(items.length - 1, activeIdx + 1); updateActive(items); }
      else if (e.key === "ArrowUp") { e.preventDefault(); activeIdx = Math.max(0, activeIdx - 1); updateActive(items); }
      else if (e.key === "Enter" && activeIdx >= 0 && items[activeIdx]) { window.location.href = items[activeIdx].getAttribute("href"); }
      else if (e.key === "Escape") { searchInput.blur(); searchResults.classList.remove("open"); }
    });
    function updateActive(items) {
      items.forEach(function (it, i) { it.classList.toggle("active", i === activeIdx); });
      if (items[activeIdx]) items[activeIdx].scrollIntoView({ block: "nearest" });
    }
    document.addEventListener("click", function (e) {
      if (!nav.contains(e.target)) searchResults.classList.remove("open");
    });

    document.addEventListener("keydown", function (e) {
      var tag = (document.activeElement && document.activeElement.tagName) || "";
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") { e.preventDefault(); searchInput.focus(); }
      if (e.key === "Escape") { closeFigureModal(); searchResults.classList.remove("open"); }
    });

    var modal = document.getElementById("viq-modal");
    if (modal) {
      modal.querySelector(".modal-close").addEventListener("click", closeFigureModal);
      modal.addEventListener("click", function (e) { if (e.target === modal) closeFigureModal(); });
    }

    // prefill from ?q=
    var params = new URLSearchParams(window.location.search);
    var q0 = params.get("q");
    if (q0) {
      searchInput.value = q0;
      // deferred: initPage() runs before the calling page has built its content and
      // registered its filter callback, so wait for that synchronous script to finish first.
      setTimeout(function () { if (currentPageFilterFn) currentPageFilterFn(q0); }, 0);
    }
  }

  function renderBreadcrumbs(host, pageId) {
    var p = pageById(pageId);
    host.innerHTML = '<a href="index.html">Command Center</a> <span aria-hidden="true">›</span> <span>' + escapeHtml(p.label) + "</span>";
  }

  function renderFooterNav(host, pageId) {
    var idx = SEQUENCE.indexOf(pageId);
    if (idx === -1) { host.innerHTML = ""; return; }
    var prevId = idx === 0 ? "index" : SEQUENCE[idx - 1];
    var nextId = idx === SEQUENCE.length - 1 ? "index" : SEQUENCE[idx + 1];
    var prev = pageById(prevId), next = pageById(nextId);
    host.innerHTML =
      '<a class="prev" href="' + prev.url + '"><div class="dir">← Previous</div><div class="lbl">' + escapeHtml(prev.label) + "</div></a>" +
      '<a class="next" href="' + next.url + '"><div class="dir">Next →</div><div class="lbl">' + escapeHtml(next.label) + "</div></a>";
  }

  function ensureModal() {
    if (document.getElementById("viq-modal")) return;
    var modal = document.createElement("div");
    modal.id = "viq-modal"; modal.className = "modal-backdrop"; modal.setAttribute("aria-hidden", "true"); modal.setAttribute("role", "dialog"); modal.setAttribute("aria-modal", "true");
    modal.innerHTML =
      '<div class="modal-box"><div class="modal-toolbar"><div class="modal-title"></div>' +
      '<button type="button" class="icon-btn zoom-out" aria-label="Zoom out">−</button>' +
      '<button type="button" class="icon-btn zoom-reset" aria-label="Reset zoom">⬚</button>' +
      '<button type="button" class="icon-btn zoom-in" aria-label="Zoom in">+</button>' +
      '<button type="button" class="icon-btn modal-close" aria-label="Close">✕</button></div>' +
      '<div class="modal-stage"></div></div>';
    document.body.appendChild(modal);
  }

  function initPage(pageId) {
    ensureModal();
    renderNav(pageId);
    var bc = document.getElementById("breadcrumbs");
    if (bc) renderBreadcrumbs(bc, pageId);
    var fn = document.getElementById("footer-nav");
    if (fn) renderFooterNav(fn, pageId);
  }

  /* ---------------- Generic in-page filter helper ---------------- */
  function enablePageFilter(selector, textSelector) {
    registerPageFilter(function (q) {
      var items = document.querySelectorAll(selector);
      items.forEach(function (el) {
        var textEl = textSelector ? el.querySelector(textSelector) : el;
        var fullRaw = el.getAttribute("data-search-full") || el.textContent;
        if (!el.getAttribute("data-search-full")) el.setAttribute("data-search-full", fullRaw);
        var displayRaw = el.getAttribute("data-search-display") || (textEl ? textEl.textContent : el.textContent);
        if (!el.getAttribute("data-search-display")) el.setAttribute("data-search-display", displayRaw);
        if (!q) { el.style.display = ""; if (textEl) textEl.innerHTML = escapeHtml(displayRaw); return; }
        var stems = tokenize(q).filter(function (t) { return !STOP[t]; }).map(stem);
        var lower = fullRaw.toLowerCase();
        var fullStems = tokenize(fullRaw).map(stem);
        var hit = lower.indexOf(q.toLowerCase()) !== -1 || stems.some(function (s) { return fullStems.indexOf(s) !== -1; });
        el.style.display = hit ? "" : "none";
        if (textEl && hit) textEl.innerHTML = highlightText(displayRaw, q);
      });
    });
  }

  window.VIQ = {
    PAGES: PAGES, SEQUENCE: SEQUENCE, pageById: pageById,
    initPage: initPage, mountFigure: mountFigure, mountAskPanel: mountAskPanel,
    escapeHtml: escapeHtml, highlightText: highlightText, searchBlueprint: searchBlueprint,
    enablePageFilter: enablePageFilter,
    svg: { ideaPipeline: svgIdeaPipeline, layers: svgLayers, ribbon: svgRibbon, timeline: svgTimeline, coverageGrid: svgCoverageGrid, fork: svgFork, assumptionLedger: svgAssumptionLedger },
    tileArt: { nodeGraph: tileArtNodeGraph, components: tileArtComponents, flow: tileArtFlow, phases: tileArtPhases, grid: tileArtGrid, idea: tileArtIdea, assumptions: tileArtAssumptions }
  };
})();
