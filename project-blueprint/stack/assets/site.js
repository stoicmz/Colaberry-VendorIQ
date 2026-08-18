/* VendorIQ Tech Stack — shared rendering, nav, search, copy buttons, agent. Reads the bare `STACK` identifier. */
(function () {
  "use strict";

  var PAGES = [
    { id: "index", url: "index.html", label: "Command Center", nav: "Center" },
    { id: "summary", url: "01-summary.html", label: "Summary", nav: "Summary" },
    { id: "recommendations", url: "02-recommendations.html", label: "Recommendations", nav: "Recs" },
    { id: "dataflow-needs", url: "03-dataflow-needs.html", label: "What The Data Flow Needs", nav: "Data Flow" },
    { id: "prompts", url: "04-prompts.html", label: "Copy-Ready Prompts", nav: "Prompts" },
    { id: "learning-path", url: "05-learning-path.html", label: "What To Learn First", nav: "Learning" },
    { id: "alternatives", url: "06-alternatives.html", label: "Alternatives Considered", nav: "Alternatives" },
    { id: "lockin", url: "07-lockin.html", label: "How Hard To Undo", nav: "Lock-in" },
    { id: "appendix", url: "08-appendix.html", label: "Appendix", nav: "Appendix" }
  ];
  var SEQUENCE = ["summary", "recommendations", "dataflow-needs", "prompts", "learning-path", "alternatives", "lockin", "appendix"];

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
  var RATING_LABEL = { green: "🟢 Great fit", amber: "🟡 Good fit", red: "🔴 Consider carefully" };

  /* ---------------- Search ---------------- */
  var STOPWORDS = ("a an and the of to in on for with that this is are be by as it its from or at into over per via so " +
    "not no every each which who what when where how than then them they own").split(" ");
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
  function tokenize(text) { return String(text || "").toLowerCase().match(/[a-z0-9']+/g) || []; }

  var SEARCH_DOCS = null;
  function pageForRec(r) { return r.group === "flow" ? "03-dataflow-needs.html" : "02-recommendations.html"; }

  function buildSearchIndex() {
    if (SEARCH_DOCS) return SEARCH_DOCS;
    var docs = [];
    var S = STACK;

    docs.push({ id: "headline", section: "summary", sectionLabel: "Summary", page: "01-summary.html", title: "Headline: where this stack is most likely to break", text: S.headline });
    S.ratingKey.forEach(function (r) {
      docs.push({ id: "rating-" + r.level, section: "summary", sectionLabel: "Summary", page: "01-summary.html", title: r.icon + " " + r.label, text: r.meaning });
    });

    S.recommendations.forEach(function (r) {
      var text = [r.why, r.caveat, r.alternative ? ("Alternative considered: " + r.alternative.name + " — why not: " + r.alternative.whyNot) : "", r.undo ? ("Difficulty to undo: " + r.undo.difficulty + " — " + r.undo.reason) : "", r.prompt].filter(Boolean).join(" ");
      docs.push({ id: "rec-" + r.id, section: r.group === "flow" ? "dataflow-needs" : "recommendations", sectionLabel: r.group === "flow" ? "What The Data Flow Needs" : "Recommendations", page: pageForRec(r) + "#" + r.id, title: r.component + " — " + r.tech, text: text });
    });

    S.learningOrder.forEach(function (l) {
      docs.push({ id: "learn-" + l.order, section: "learning-path", sectionLabel: "What To Learn First", page: "05-learning-path.html#order-" + l.order, title: l.order + ". " + l.tech, text: l.reason });
    });

    S.notCovered.forEach(function (t, i) {
      docs.push({ id: "notcovered-" + i, section: "appendix", sectionLabel: "Appendix", page: "08-appendix.html#notcovered-" + i, title: "Not covered: " + t.slice(0, 60), text: t });
    });

    docs.forEach(function (d) {
      d.titleStems = tokenize(d.title).filter(function (t) { return !STOP[t]; }).map(stem);
      d.textStems = tokenize(d.text).filter(function (t) { return !STOP[t]; }).map(stem);
      d.titleLower = d.title.toLowerCase();
      d.textLower = d.text.toLowerCase();
    });
    SEARCH_DOCS = docs;
    return docs;
  }

  function countMatches(stems, targetStem) { var n = 0; for (var i = 0; i < stems.length; i++) if (stems[i] === targetStem) n++; return n; }

  function searchStack(query, opts) {
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
  function applyTheme(t) { if (t) document.documentElement.setAttribute("data-theme", t); else document.documentElement.removeAttribute("data-theme"); }
  function toggleTheme() {
    var cur = getTheme();
    var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    var effectiveDark = cur ? cur === "dark" : prefersDark;
    var next = effectiveDark ? "light" : "dark";
    localStorage.setItem("vendoriq_theme", next);
    applyTheme(next);
  }
  applyTheme(getTheme());

  /* ---------------- Copy buttons ---------------- */
  var copyRegistry = [];
  function copyButtonHtml(text, label) {
    var idx = copyRegistry.length;
    copyRegistry.push(text);
    return '<button type="button" class="copy-btn" data-copy-idx="' + idx + '">⧉ ' + escapeHtml(label || "Copy") + "</button>";
  }
  function fallbackCopy(text, cb) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed"; ta.style.left = "-9999px"; ta.style.top = "0";
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    try { document.execCommand("copy"); cb(true); } catch (e) { cb(false); }
    document.body.removeChild(ta);
  }
  function copyToClipboard(text, btn) {
    var orig = btn.textContent;
    function showCopied(ok) {
      btn.textContent = ok ? "✓ Copied" : "Copy failed";
      btn.classList.toggle("copied", !!ok);
      setTimeout(function () { btn.textContent = orig; btn.classList.remove("copied"); }, 1700);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { showCopied(true); }).catch(function () { fallbackCopy(text, showCopied); });
    } else {
      fallbackCopy(text, showCopied);
    }
  }
  function wireCopyButtons(root) {
    (root || document).querySelectorAll(".copy-btn[data-copy-idx]").forEach(function (btn) {
      if (btn.getAttribute("data-wired")) return;
      btn.setAttribute("data-wired", "1");
      btn.addEventListener("click", function () {
        var idx = parseInt(btn.getAttribute("data-copy-idx"), 10);
        copyToClipboard(copyRegistry[idx], btn);
      });
    });
  }

  /* ---------------- Fullscreen figure modal ---------------- */
  function openFigureModal(title, sourceEl) {
    var backdrop = document.getElementById("viq-modal");
    var stage = backdrop.querySelector(".modal-stage");
    backdrop.querySelector(".modal-title").textContent = title;
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
  function mountFigure(containerId, opts) {
    var host = document.getElementById(containerId);
    if (!host) return;
    host.className = "figure";
    host.innerHTML =
      '<div class="figure-head"><div class="figure-title">' + escapeHtml(opts.title) + '</div>' +
      '<button type="button" class="expand-btn" aria-label="Expand ' + escapeHtml(opts.title) + ' full screen">⤢ Expand</button></div>' +
      '<div class="figure-body"></div>' +
      (opts.interpretation ? '<div class="interpretation"><b>What this means:</b> ' + escapeHtml(opts.interpretation) + "</div>" : "");
    host.querySelector(".figure-body").innerHTML = opts.svg;
    host.querySelector(".expand-btn").addEventListener("click", function () {
      var el = host.querySelector(".figure-body svg") || host.querySelector(".figure-body");
      openFigureModal(opts.title, el);
    });
  }

  /* ---------------- SVG helpers ---------------- */
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
  var RATING_COLOR = { green: ["var(--good-bg)", "var(--good)"], amber: ["var(--warn-bg)", "var(--warn)"], red: ["var(--risk-bg)", "var(--risk)"] };

  /* ---------------- Illustration 1: proportional bar of ratings, reds called out ---------------- */
  function svgRatingBar() {
    var recs = STACK.recommendations;
    var counts = { green: 0, amber: 0, red: 0 };
    recs.forEach(function (r) { counts[r.rating]++; });
    var total = recs.length;
    var w = 900, barH = 54, x0 = 20, y0 = 24;
    var order = ["green", "amber", "red"];
    var x = x0;
    var segs = order.map(function (level) {
      var segW = (counts[level] / total) * (w - x0 * 2);
      var colors = RATING_COLOR[level];
      var block = '<rect x="' + x + '" y="' + y0 + '" width="' + segW + '" height="' + barH + '" fill="' + colors[0] + '" stroke="' + colors[1] + '" stroke-width="1.4"/>' +
        (segW > 46 ? '<text x="' + (x + segW / 2) + '" y="' + (y0 + barH / 2 + 5) + '" text-anchor="middle" font-size="14" font-weight="800" fill="' + colors[1] + '">' + counts[level] + "</text>" : "");
      x += segW;
      return block;
    }).join("");
    var reds = recs.filter(function (r) { return r.rating === "red"; });
    var calloutY = y0 + barH + 30;
    var callouts = reds.map(function (r, i) {
      var ly = calloutY + i * 22;
      return '<circle cx="' + (x0 + 6) + '" cy="' + (ly - 4) + '" r="4" fill="var(--risk)"/>' +
        '<text x="' + (x0 + 18) + '" y="' + ly + '" font-size="12" fill="var(--text)">' + escapeHtml(r.component) + " — " + escapeHtml(r.tech) + "</text>";
    }).join("");
    var h = calloutY + reds.length * 22 + 10;
    return '<svg viewBox="0 0 ' + w + " " + h + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Proportional bar of fit ratings">' +
      segs +
      '<text x="' + x0 + '" y="' + (calloutY - 14) + '" font-size="11" font-weight="700" letter-spacing="0.04em" fill="var(--muted)">RED — CONSIDER CAREFULLY</text>' +
      callouts + "</svg>";
  }

  /* ---------------- Illustration 2: whole stack as bands by group, chips coloured by rating ---------------- */
  function svgStackBands() {
    var groups = STACK.groups;
    var byGroup = {};
    STACK.recommendations.forEach(function (r) { (byGroup[r.group] = byGroup[r.group] || []).push(r); });
    var w = 920, rowH = 66, y = 16, labelW = 150;
    var rows = [];
    groups.forEach(function (g) {
      var items = byGroup[g.id] || [];
      if (!items.length) return;
      var x = labelW;
      var chips = items.map(function (r, i) {
        var colors = RATING_COLOR[r.rating];
        var boxW = Math.min(210, (w - labelW - 20) / items.length - 10);
        var nx = x; x += boxW + 10;
        var label = wrapLines(r.component, 22);
        var cy = y + 6;
        return '<rect x="' + nx + '" y="' + cy + '" width="' + boxW + '" height="' + (rowH - 16) + '" rx="9" fill="' + colors[0] + '" stroke="' + colors[1] + '" stroke-width="1.3"/>' +
          '<text x="' + (nx + boxW / 2) + '" y="' + (cy + (rowH - 16) / 2 - (label.length - 1) * 6) + '" text-anchor="middle" font-size="10.3" font-weight="700" fill="var(--text)">' + tspans(label, nx + boxW / 2, cy + (rowH - 16) / 2 - (label.length - 1) * 6, 12) + "</text>";
      }).join("");
      rows.push('<text x="14" y="' + (y + rowH / 2 + 4) + '" font-size="11.5" font-weight="700" fill="var(--accent)">' + escapeHtml(g.label) + "</text>" + chips);
      y += rowH;
    });
    return '<svg viewBox="0 0 ' + w + " " + (y + 10) + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The whole stack as bands, coloured by fit rating">' + rows.join("") + "</svg>";
  }

  /* ---------------- Illustration 3: topology — my machine/VPS vs somebody else's servers ---------------- */
  function svgTopology() {
    var mine = STACK.recommendations.filter(function (r) { return r.group !== "depend"; });
    var theirs = STACK.recommendations.filter(function (r) { return r.group === "depend"; });
    var w = 920, zoneY = 50, rowH = 30, pad = 16;
    var mineH = 40 + mine.length * rowH;
    var theirsH = 40 + Math.max(theirs.length, 1) * rowH;
    var zoneW = (w - pad * 3) / 2;
    var mineItems = mine.map(function (r, i) {
      var colors = RATING_COLOR[r.rating];
      var yy = zoneY + 40 + i * rowH;
      return '<rect x="' + (pad + 12) + '" y="' + (yy - 16) + '" width="' + (zoneW - 24) + '" height="22" rx="6" fill="' + colors[0] + '" stroke="' + colors[1] + '" stroke-width="1.1"/>' +
        '<text x="' + (pad + 24) + '" y="' + (yy - 1) + '" font-size="10.8" font-weight="600" fill="var(--text)">' + escapeHtml(r.component) + "</text>";
    }).join("");
    var theirsItems = (theirs.length ? theirs : [{ component: "(none on day one)", rating: "green" }]).map(function (r, i) {
      var colors = RATING_COLOR[r.rating];
      var yy = zoneY + 40 + i * rowH;
      var x2 = pad * 2 + zoneW;
      return '<rect x="' + (x2 + 12) + '" y="' + (yy - 16) + '" width="' + (zoneW - 24) + '" height="22" rx="6" fill="' + colors[0] + '" stroke="' + colors[1] + '" stroke-width="1.1"/>' +
        '<text x="' + (x2 + 24) + '" y="' + (yy - 1) + '" font-size="10.8" font-weight="600" fill="var(--text)">' + escapeHtml(r.component) + "</text>";
    }).join("");
    var h = zoneY + Math.max(mineH, theirsH) + 20;
    return '<svg viewBox="0 0 ' + w + " " + h + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="What runs on your machine versus somebody else\'s">' +
      '<rect x="' + pad + '" y="' + zoneY + '" width="' + zoneW + '" height="' + (h - zoneY - 12) + '" rx="10" fill="var(--info-bg)" stroke="var(--info)" stroke-width="1.4" stroke-dasharray="0"/>' +
      '<text x="' + (pad + zoneW / 2) + '" y="' + (zoneY + 22) + '" text-anchor="middle" font-size="12" font-weight="800" fill="var(--info)">YOUR VPS</text>' +
      mineItems +
      '<rect x="' + (pad * 2 + zoneW) + '" y="' + zoneY + '" width="' + zoneW + '" height="' + (h - zoneY - 12) + '" rx="10" fill="var(--ai-bg)" stroke="var(--ai)" stroke-width="1.4" stroke-dasharray="5,4"/>' +
      '<text x="' + (pad * 2 + zoneW + zoneW / 2) + '" y="' + (zoneY + 22) + '" text-anchor="middle" font-size="12" font-weight="800" fill="var(--ai)">SOMEBODY ELSE’S SERVERS</text>' +
      theirsItems + "</svg>";
  }

  /* ---------------- Illustration 4: learning ladder ---------------- */
  function svgLearningLadder() {
    var steps = STACK.learningOrder.slice().sort(function (a, b) { return a.order - b.order; });
    var w = 920, stepH = 58, x0 = 20;
    var rows = steps.map(function (s, i) {
      var y = 16 + i * stepH;
      var indent = i * 46;
      var boxW = w - 40 - indent;
      return '<circle cx="' + (x0 + indent + 16) + '" cy="' + (y + 22) + '" r="15" fill="var(--accent)" />' +
        '<text x="' + (x0 + indent + 16) + '" y="' + (y + 27) + '" text-anchor="middle" font-size="12.5" font-weight="800" fill="var(--accent-ink)">' + s.order + "</text>" +
        '<rect x="' + (x0 + indent + 40) + '" y="' + y + '" width="' + (boxW - 40) + '" height="44" rx="9" fill="var(--card)" stroke="var(--border)" stroke-width="1.2"/>' +
        '<text x="' + (x0 + indent + 52) + '" y="' + (y + 27) + '" font-size="12.5" font-weight="700" fill="var(--text)">' + escapeHtml(s.tech) + "</text>";
    }).join("");
    var h = 16 + steps.length * stepH + 10;
    return '<svg viewBox="0 0 ' + w + " " + h + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Learning ladder, in order">' + rows + "</svg>";
  }

  /* ---------------- Illustration 5: lock-in scale ---------------- */
  function svgLockinScale() {
    var recs = STACK.recommendations.filter(function (r) { return r.undo; });
    var w = 940, y0 = 40, trackY = 58, rowGap = 8, boxW = 220;
    var buckets = { easy: [], moderate: [], hard: [] };
    recs.forEach(function (r) { buckets[r.undo.difficulty].push(r); });
    var laneX = { easy: 175, moderate: w / 2, hard: w - 175 };
    var labels = '<text x="' + laneX.easy + '" y="' + (y0 - 12) + '" text-anchor="middle" font-size="12" font-weight="800" fill="var(--good)">EASY TO UNDO</text>' +
      '<text x="' + laneX.moderate + '" y="' + (y0 - 12) + '" text-anchor="middle" font-size="12" font-weight="800" fill="var(--warn)">MODERATE</text>' +
      '<text x="' + laneX.hard + '" y="' + (y0 - 12) + '" text-anchor="middle" font-size="12" font-weight="800" fill="var(--risk)">HARD TO UNDO</text>';
    var track = '<line x1="40" y1="' + y0 + '" x2="' + (w - 40) + '" y2="' + y0 + '" stroke="var(--border)" stroke-width="3"/>';
    var chips = [];
    var laneBottom = { easy: trackY, moderate: trackY, hard: trackY };
    ["easy", "moderate", "hard"].forEach(function (level) {
      var colors = level === "easy" ? RATING_COLOR.green : level === "moderate" ? RATING_COLOR.amber : RATING_COLOR.red;
      buckets[level].forEach(function (r, i) {
        var lines = wrapLines(r.component, 26);
        var boxH = 14 + lines.length * 13;
        var top = laneBottom[level];
        var cx = laneX[level] - boxW / 2;
        chips.push('<rect x="' + cx + '" y="' + top + '" width="' + boxW + '" height="' + boxH + '" rx="7" fill="' + colors[0] + '" stroke="' + colors[1] + '" stroke-width="1.1"/>' +
          '<text x="' + laneX[level] + '" y="' + (top + 14) + '" text-anchor="middle" font-size="10.3" font-weight="700" fill="var(--text)">' + tspans(lines, laneX[level], top + 14, 13) + "</text>");
        laneBottom[level] = top + boxH + rowGap;
      });
    });
    var h = Math.max(laneBottom.easy, laneBottom.moderate, laneBottom.hard, trackY + 30) + 10;
    return '<svg viewBox="0 0 ' + w + " " + h + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="How hard each decision is to undo">' + labels + track + chips.join("") + "</svg>";
  }
  /* ---------------- Command Center tile art ---------------- */
  function tileArtBar() {
    var counts = { green: 0, amber: 0, red: 0 };
    STACK.recommendations.forEach(function (r) { counts[r.rating]++; });
    var total = STACK.recommendations.length;
    var x = 8, w = 184;
    var order = ["green", "amber", "red"];
    var parts = order.map(function (level) {
      var segW = (counts[level] / total) * w;
      var colors = RATING_COLOR[level];
      var b = '<rect x="' + x + '" y="42" width="' + segW + '" height="16" fill="' + colors[1] + '" opacity="0.85"/>';
      x += segW;
      return b;
    }).join("");
    return '<svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + parts + "</svg>";
  }
  function tileArtBands() {
    var colors = ["var(--info)", "var(--neutral)", "var(--good)", "var(--ai)", "var(--warn)"];
    var rows = [0, 1, 2, 3, 4].map(function (i) { return '<rect x="8" y="' + (6 + i * 18) + '" width="' + (100 + (i % 3) * 30) + '" height="12" rx="4" fill="' + colors[i] + '" opacity="0.8"/>'; });
    return '<svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + rows.join("") + "</svg>";
  }
  function tileArtTopology() {
    return '<svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<rect x="8" y="10" width="88" height="80" rx="8" fill="var(--info-bg)" stroke="var(--info)" stroke-width="1.5"/>' +
      '<rect x="104" y="10" width="88" height="80" rx="8" fill="var(--ai-bg)" stroke="var(--ai)" stroke-width="1.5" stroke-dasharray="4,3"/>' +
      '<circle cx="52" cy="30" r="6" fill="var(--info)"/><circle cx="52" cy="50" r="6" fill="var(--info)"/><circle cx="52" cy="70" r="6" fill="var(--info)"/>' +
      '<circle cx="148" cy="45" r="6" fill="var(--ai)"/></svg>';
  }
  function tileArtLadder() {
    var parts = [];
    for (var i = 0; i < 5; i++) {
      var y = 10 + i * 17;
      var x = 8 + i * 14;
      parts.push('<circle cx="' + (x + 6) + '" cy="' + (y + 6) + '" r="6" fill="var(--accent)"/><rect x="' + (x + 18) + '" y="' + y + '" width="' + (150 - i * 14) + '" height="12" rx="4" fill="var(--card)" stroke="var(--border)"/>');
    }
    return '<svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + parts.join("") + "</svg>";
  }
  function tileArtScale() {
    return '<svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<line x1="15" y1="50" x2="185" y2="50" stroke="var(--border)" stroke-width="3"/>' +
      '<circle cx="35" cy="50" r="8" fill="var(--good)"/><circle cx="100" cy="50" r="8" fill="var(--warn)"/><circle cx="165" cy="50" r="8" fill="var(--risk)"/></svg>';
  }
  function tileArtPrompts() {
    return '<svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      [0, 1, 2, 3].map(function (i) { return '<rect x="10" y="' + (8 + i * 22) + '" width="180" height="14" rx="4" fill="var(--accent)" opacity="' + (0.3 + i * 0.15) + '"/>'; }).join("") +
      "</svg>";
  }
  function tileArtAppendix() {
    return '<svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<rect x="40" y="10" width="120" height="80" rx="6" fill="var(--card)" stroke="var(--border)" stroke-width="2"/>' +
      [0, 1, 2, 3].map(function (i) { return '<line x1="55" y1="' + (26 + i * 16) + '" x2="145" y2="' + (26 + i * 16) + '" stroke="var(--muted)" stroke-width="2" opacity="0.6"/>'; }).join("") +
      "</svg>";
  }

  /* ---------------- Ask panel ---------------- */
  var ASK_MODELS = ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"];

  function scopedStackFor(scope, pageId) {
    if (scope === "whole") return STACK;
    var slice = { meta: STACK.meta, ratingKey: STACK.ratingKey, headline: STACK.headline };
    if (pageId === "recommendations") slice.recommendations = STACK.recommendations.filter(function (r) { return r.group !== "flow"; }), slice.groups = STACK.groups;
    else if (pageId === "dataflow-needs") slice.recommendations = STACK.recommendations.filter(function (r) { return r.group === "flow"; });
    else if (pageId === "prompts") slice.prompts = STACK.recommendations.map(function (r) { return { component: r.component, tech: r.tech, prompt: r.prompt }; });
    else if (pageId === "learning-path") slice.learningOrder = STACK.learningOrder;
    else if (pageId === "alternatives") slice.alternatives = STACK.recommendations.map(function (r) { return { component: r.component, tech: r.tech, alternative: r.alternative }; });
    else if (pageId === "lockin") slice.undo = STACK.recommendations.map(function (r) { return { component: r.component, tech: r.tech, undo: r.undo }; });
    else if (pageId === "appendix") slice.notCovered = STACK.notCovered;
    else slice = STACK;
    return slice;
  }

  function mountAskPanel(containerId, pageId) {
    var host = document.getElementById(containerId);
    if (!host) return;
    host.className = "ask-panel";
    host.innerHTML =
      '<div class="ask-head"><h2>Ask the stack</h2>' +
      '<div class="mode-switch" role="tablist" aria-label="Ask mode">' +
      '<button type="button" class="mode-btn active" data-mode="search" role="tab" aria-selected="true">Search — no key</button>' +
      '<button type="button" class="mode-btn" data-mode="claude" role="tab" aria-selected="false">Claude — needs key</button>' +
      "</div></div>" +
      '<div class="ask-settings" data-settings="claude">' +
      '<input type="password" class="ask-key" placeholder="Paste your Anthropic API key (stored only in this browser)" autocomplete="off" />' +
      '<select class="ask-model">' + ASK_MODELS.map(function (m) { return '<option value="' + m + '"' + (m === "claude-opus-5" ? " selected" : "") + ">" + m + "</option>"; }).join("") + "</select>" +
      '<div class="scope-toggle"><button type="button" class="scope-btn active" data-scope="section">This section</button><button type="button" class="scope-btn" data-scope="whole">Whole stack</button></div>' +
      "</div>" +
      '<p class="ask-note">Search mode works fully offline. Claude mode answers only from STACK data and will not talk you out of a 🔴 rating.</p>' +
      '<form class="ask-form"><input type="text" class="ask-q" placeholder="e.g. why is hosting rated red?" />' +
      '<button type="submit" class="ask-submit">Ask</button></form>' +
      '<div class="ask-results" aria-live="polite"><p class="ask-empty">Ask about any recommendation, rating, prompt, alternative, or undo-difficulty in this stack.</p></div>';

    var mode = "search", scope = "section";
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
      btn.addEventListener("click", function () { scope = btn.getAttribute("data-scope"); scopeBtns.forEach(function (b) { b.classList.toggle("active", b === btn); }); });
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
      var results = searchStack(q, { limit: 8 });
      if (!results.length) {
        resultsEl.innerHTML = '<div class="ask-empty">No matches in the stack for that. Check <a href="08-appendix.html">what this document does NOT tell you</a> — the gap may be the answer.</div>';
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
      var data = scopedStackFor(scope, pageId);
      var system = "You are answering questions about VendorIQ's recommended tech stack. Use ONLY the following JSON data as your source of truth. If the answer is not contained in this data, say so plainly instead of guessing. IMPORTANT: never talk the user out of a rating of \"red\" (consider carefully) — if they push back on a red rating, restate the caveat, don't soften it.\n\n" + JSON.stringify(data);
      var body = { model: model, max_tokens: 16000, system: system, messages: [{ role: "user", content: q }] };
      if (model === "claude-opus-5" || model === "claude-sonnet-5") body.output_config = { effort: "low" };
      resultsEl.innerHTML = '<div class="ask-loading"><span class="spinner"></span> Asking ' + escapeHtml(model) + "…</div>";
      fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify(body)
      }).then(function (res) {
        if (res.status === 401) throw new Error("Bad API key (401 Unauthorized). Double-check the key you pasted, or use Search mode instead.");
        if (res.status === 429) throw new Error("Rate limited (429). Wait a moment and try again, or use Search mode instead.");
        if (!res.ok) throw new Error("Request failed (HTTP " + res.status + "). You can fall back to Search mode.");
        return res.json();
      }).then(function (data2) {
        if (data2.stop_reason === "refusal") { resultsEl.innerHTML = '<div class="ask-error">Claude declined to answer that. Try rephrasing, or use Search mode.</div>'; return; }
        var text = (data2.content || []).filter(function (b) { return b.type === "text"; }).map(function (b) { return b.text; }).join("\n\n");
        resultsEl.innerHTML = '<div class="ask-answer">' + escapeHtml(text || "(No text in response.)") + "</div>";
      }).catch(function (err) {
        resultsEl.innerHTML = '<div class="ask-error">' + escapeHtml(err.message || "Network error — check your connection.") + ' You can always fall back to Search mode.</div>';
      });
    }
  }

  /* ---------------- Page chrome ---------------- */
  var currentPageFilterFn = null;
  function registerPageFilter(fn) { currentPageFilterFn = fn; }

  function renderNav(pageId) {
    var nav = document.createElement("div");
    nav.className = "topnav";
    nav.innerHTML =
      '<a class="brand" href="index.html"><span class="mark">VQ</span><span>Tech Stack</span></a>' +
      (pageId !== "index" ? '<a class="cc-link" href="index.html">← Command Center</a>' : "") +
      '<a class="arch-link" href="../index.html">Architecture ↗</a>' +
      '<span class="spacer"></span>' +
      '<div class="search-wrap"><input type="text" class="nav-search" placeholder="Search the stack…" aria-label="Search the stack" autocomplete="off" />' +
      '<span class="kbd-hint">/</span><div class="search-results" role="listbox"></div></div>' +
      '<button type="button" class="icon-btn theme-toggle" aria-label="Toggle dark mode" title="Toggle theme">◐</button>' +
      '<button type="button" class="icon-btn print-btn" aria-label="Print this page" title="Print">⎙</button>';
    document.body.insertBefore(nav, document.body.firstChild);

    var subnav = document.createElement("div");
    subnav.className = "subnav";
    subnav.style.cssText = "position:sticky;top:" + "60px;z-index:140;display:flex;gap:6px;flex-wrap:nowrap;overflow-x:auto;padding:8px 16px;background:var(--card);border-bottom:1px solid var(--border);";
    subnav.innerHTML = SEQUENCE.map(function (id) {
      var p = pageById(id);
      var active = id === pageId;
      return '<a href="' + p.url + '" style="flex:none;font-size:11.5px;font-weight:700;padding:5px 10px;border-radius:999px;white-space:nowrap;' +
        (active ? "background:var(--accent);color:var(--accent-ink);" : "background:var(--bg);color:var(--muted);border:1px solid var(--border);") + '">' + escapeHtml(p.nav) + "</a>";
    }).join("");
    document.body.insertBefore(subnav, nav.nextSibling);

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
      var results = searchStack(q, { limit: 8 });
      if (!results.length) {
        searchResults.innerHTML = '<div class="sr-empty">No matches. Check <a href="08-appendix.html">Appendix</a> — a miss may be the answer.</div>';
      } else {
        searchResults.innerHTML = results.map(function (d) {
          return '<a class="sr-item" href="' + d.page + (d.page.indexOf("?") === -1 ? "?q=" + encodeURIComponent(q) : "&q=" + encodeURIComponent(q)) + '">' +
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
    document.addEventListener("click", function (e) { if (!nav.contains(e.target)) searchResults.classList.remove("open"); });

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

    var params = new URLSearchParams(window.location.search);
    var q0 = params.get("q");
    if (q0) {
      searchInput.value = q0;
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

  function initPage(pageId) {
    ensureModal();
    renderNav(pageId);
    var bc = document.getElementById("breadcrumbs");
    if (bc) renderBreadcrumbs(bc, pageId);
    var fn = document.getElementById("footer-nav");
    if (fn) renderFooterNav(fn, pageId);
  }

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
    escapeHtml: escapeHtml, highlightText: highlightText, searchStack: searchStack,
    enablePageFilter: enablePageFilter,
    copyButtonHtml: copyButtonHtml, wireCopyButtons: wireCopyButtons,
    ratingLabel: RATING_LABEL,
    svg: { ratingBar: svgRatingBar, stackBands: svgStackBands, topology: svgTopology, learningLadder: svgLearningLadder, lockinScale: svgLockinScale },
    tileArt: { bar: tileArtBar, bands: tileArtBands, topology: tileArtTopology, ladder: tileArtLadder, scale: tileArtScale, prompts: tileArtPrompts, appendix: tileArtAppendix }
  };
})();
