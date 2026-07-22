"use strict";

// ---------------------------------------------------------------------------
// VisualCube image URLs
// ---------------------------------------------------------------------------
// Realistic post-CMLL style: solved corners and blocks in real colors
// (U yellow, F orange, R blue), M-slice pieces drawn with placeholder colors
// since their identity doesn't matter — silver = U/D color, purple = F/B
// color — and the two LR pieces in their real colors (yellow + green/blue).
// An edge showing silver/yellow on a side face (or purple/green/blue on
// U/D) is misoriented. Scheme ybosgm remaps D→silver and B→purple.
//
// fd string is 54 chars, faces in order U R F D L B, row-major.
// [udIndex, sideIndex] for each of the six LSE edge positions:
const FACELETS = {
  UF: [7, 19],
  UB: [1, 46],
  UL: [3, 37],
  UR: [5, 10],
  DF: [28, 25],
  DB: [34, 52],
};

const VISUALCUBE = "https://visualcube.api.cubing.net/visualcube.php";

function imageUrl(groupId, variant) {
  const badEdges = GROUPS.find((g) => g.id === groupId).badEdges;
  const fd = Array(54).fill("n");
  // solved background pieces
  for (const i of [0, 2, 6, 8]) fd[i] = "u"; // U-face corner stickers
  fd[4] = "d"; // U center: U/D color unspecified (silver)
  for (let i = 12; i < 18; i++) fd[i] = "r"; // right block on R face
  fd[22] = "b"; // F center: F/B color unspecified (purple)
  for (const i of [21, 23, 24, 26]) fd[i] = "f"; // front block on F face
  // the six LSE edges
  for (const pos of Object.keys(FACELETS)) {
    const [udIdx, sideIdx] = FACELETS[pos];
    const bad = badEdges.includes(pos);
    const lrIdx = variant.indexOf(pos);
    if (lrIdx >= 0) {
      const lr = lrIdx === 0 ? "l" : "r"; // green / blue side color
      fd[udIdx] = bad ? lr : "u";
      fd[sideIdx] = bad ? "u" : lr;
    } else {
      fd[udIdx] = bad ? "b" : "d";
      fd[sideIdx] = bad ? "d" : "b";
    }
  }
  return `${VISUALCUBE}?fmt=svg&size=300&sch=ybosgm&bg=t&fd=${fd.join("")}`;
}

// ---------------------------------------------------------------------------
// Theme (initial value is set in index.html before first paint)
// ---------------------------------------------------------------------------
const themeToggle = document.getElementById("theme-toggle");

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggle.textContent = theme === "light" ? "🌙" : "☀️";
  themeToggle.title = `Switch to ${theme === "light" ? "dark" : "light"} mode`;
}

applyTheme(document.documentElement.dataset.theme);

themeToggle.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  localStorage.setItem("eolr-theme", next);
  applyTheme(next);
});

// ---------------------------------------------------------------------------
// Images toggle (initial value set in index.html before first paint)
// ---------------------------------------------------------------------------
const imagesToggle = document.getElementById("images-toggle");

function applyImages(state) {
  document.documentElement.dataset.images = state;
  imagesToggle.setAttribute("aria-checked", state === "on" ? "true" : "false");
  imagesToggle.title = state === "on" ? "Hide cube images" : "Show cube images";
}

applyImages(document.documentElement.dataset.images);

imagesToggle.addEventListener("click", () => {
  const next = document.documentElement.dataset.images === "on" ? "off" : "on";
  localStorage.setItem("eolr-images", next);
  applyImages(next);
});

// ---------------------------------------------------------------------------
// Highlight toggle — emphasizes the moves each Solution description names
// ---------------------------------------------------------------------------
const marksToggle = document.getElementById("marks-toggle");

function applyMarks(state) {
  document.documentElement.dataset.marks = state;
  marksToggle.setAttribute("aria-checked", state === "on" ? "true" : "false");
  marksToggle.title = state === "on" ? "Stop highlighting the described moves" : "Highlight the moves from the description";
}

applyMarks(document.documentElement.dataset.marks);

marksToggle.addEventListener("click", () => {
  const next = document.documentElement.dataset.marks === "on" ? "off" : "on";
  localStorage.setItem("eolr-marks", next);
  applyMarks(next);
});

// ---------------------------------------------------------------------------
// Progress (localStorage)
// ---------------------------------------------------------------------------
const STORAGE_KEY = "eolr-progress";
const STATUSES = ["none", "learning", "learned"];
const STATUS_LABELS = { none: "Not started", learning: "Learning", learned: "Learned" };

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

let progress = loadProgress();

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function caseId(c) {
  return `${c.group}::${c.name}`;
}

// DOM id for a case card, usable as a scroll anchor.
function caseAnchor(c) {
  return "case-" + caseId(c).replace(/[^a-zA-Z0-9]+/g, "-");
}

const CASE_BY_ID = Object.fromEntries(CASES.map((c) => [caseId(c), c]));
const CASE_BY_NAME = new Map(CASES.map((c) => [`${c.name} ${c.group}`, c]));

// Turn "<Case> <group> from there" references in a Solution description into
// links that scroll to that case's card. Matches the longest trailing
// capitalized-word run before a group id that is a real case name (so "See
// Bad 3/1" links "Bad 3/1", not "See Bad 3/1"). HTML-escapes the rest.
function linkifySolution(text) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const re = /((?:[A-Z][a-zA-Z]+ )+)(\d[oa]?\/\d)/g;
  let out = "", last = 0, m;
  while ((m = re.exec(text))) {
    const words = m[1].trim().split(" ");
    const group = m[2];
    let target = null, nameStart = -1;
    for (let s = 0; s < words.length; s++) {
      const cand = CASE_BY_NAME.get(`${words.slice(s).join(" ")} ${group}`);
      if (cand) { target = cand; nameStart = s; break; }
    }
    if (!target) continue;
    // leading words that aren't part of the case name (e.g. "See")
    const leadEnd = m.index + words.slice(0, nameStart).join(" ").length + (nameStart ? 1 : 0);
    const label = `${words.slice(nameStart).join(" ")} ${group}`;
    out += esc(text.slice(last, leadEnd));
    out += `<a class="case-link" href="#${caseAnchor(target)}" data-case-id="${caseId(target)}">${esc(label)}</a>`;
    last = m.index + m[0].length;
  }
  return out + esc(text.slice(last));
}

function scrambleFor(c, variantIndex) {
  return SCRAMBLES[caseId(c)][variantIndex];
}

function solutionFor(c, variantIndex) {
  return SOLUTIONS[caseId(c)][variantIndex];
}

function markFor(c, variantIndex) {
  return (SOLUTION_MARKS[caseId(c)] || [])[variantIndex] || null;
}

// Render an alg string as HTML, wrapping the described sub-sequence (per the
// [start, length] mark) in <span class="alg-mark"> for the highlight toggle.
function algHtml(alg, mark) {
  const toks = alg.split(" ");
  if (!mark) return toks.map((t) => `<span class="mv">${t}</span>`).join(" ");
  const [start, len] = mark;
  return toks
    .map((t, i) => {
      const open = i === start ? '<span class="alg-mark">' : "";
      const close = i === start + len - 1 ? "</span>" : "";
      return `${open}<span class="mv">${t}</span>${close}`;
    })
    .join(" ");
}

function statusOf(c) {
  return progress[caseId(c)] || "none";
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
const main = document.getElementById("cases");
const groupNav = document.getElementById("group-nav");

function groupAnchor(id) {
  return "group-" + id.replace("/", "-");
}

function renderNav() {
  groupNav.innerHTML = GROUPS.map(
    (g) => `<a href="#${groupAnchor(g.id)}">${g.id}</a>`
  ).join("");
}

function variantLabel(v) {
  return v.join("/");
}

function renderCaseCard(c) {
  const id = caseId(c);
  // Always rendered (even for a single variant) so every card has the
  // same layout and sections line up across a row.
  const thumbs = `<div class="variant-thumbs">${c.variants
    .map(
      (v, i) =>
        `<button class="variant-thumb${i === 0 ? " active" : ""}" data-case="${id}" data-variant="${i}" title="LR edges in ${variantLabel(v)}">
           <img src="${imageUrl(c.group, v)}" alt="Variant ${variantLabel(v)}" loading="lazy">
           <span>${variantLabel(v)}</span>
         </button>`
    )
    .join("")}</div>`;

  const solutions = [
    c.solution ? { title: "Solution", text: c.solution } : null,
    c.mcSolution ? { title: "MC Solution", text: c.mcSolution } : null,
  ]
    .filter(Boolean)
    .map(
      (s) => `<details class="solution" open>
                <summary>${s.title}</summary>
                <p>${linkifySolution(s.text)}</p>
              </details>`
    )
    .join("");

  return `<article class="case-card" id="${caseAnchor(c)}" data-id="${id}" data-status="${statusOf(c)}"
            data-search="${[c.group, c.name, solutionFor(c, 0), c.recognition, c.variants.map(variantLabel).join(" ")]
              .join(" ")
              .toLowerCase()
              .replace(/"/g, "")}">
    <div class="case-image">
      <img class="main-image" src="${imageUrl(c.group, c.variants[0])}" alt="${c.group} ${c.name}" loading="lazy">
    </div>
    ${thumbs}
    <div class="case-body">
      <div class="case-title">
        <h3>${c.name}</h3>
        <span class="variants-text">${c.variants.map(variantLabel).join(", ")}</span>
      </div>
      <button class="alg scramble-row" title="Click to copy"><span class="row-label">Scramble</span><code class="scramble-code">${scrambleFor(c, 0)}</code><span class="copy-hint">copy</span></button>
      <button class="alg" title="Click to copy"><span class="row-label">Alg</span><code class="alg-code">${algHtml(solutionFor(c, 0), markFor(c, 0))}</code><span class="copy-hint">copy</span></button>
      <p class="recognition"><strong>Recognition:</strong> ${c.recognition}</p>
      ${solutions}
      <button class="status-btn" data-id="${id}">${STATUS_LABELS[statusOf(c)]}</button>
    </div>
  </article>`;
}

const POSITIONS = ["UF", "UB", "UL", "UR", "DF", "DB"];

function renderGroups() {
  main.innerHTML = GROUPS.map((g) => {
    const cases = CASES.filter((c) => c.group === g.id);
    const posChips = POSITIONS.map(
      (p) => `<button class="pos-chip" data-group="${g.id}" data-pos="${p}">${p}</button>`
    ).join("");
    return `<section class="group" id="${groupAnchor(g.id)}" data-group="${g.id}">
      <header class="group-header">
        <h2>${g.id}</h2>
        <span class="bad-edges">Misoriented edges: ${g.badEdges.join(", ")}</span>
        <span class="group-progress" data-group="${g.id}"></span>
      </header>
      <div class="pos-chips" title="Filter this group by LR edge positions">
        <span class="pos-chips-label">LR:</span>
        ${posChips}
        <button class="pos-chip pos-chip-clear" data-group="${g.id}" data-pos="">×</button>
      </div>
      <div class="card-grid">${cases.map(renderCaseCard).join("")}</div>
    </section>`;
  }).join("");
}

// ---------------------------------------------------------------------------
// Progress UI
// ---------------------------------------------------------------------------
function updateCounts() {
  let learnedTotal = 0;
  for (const g of GROUPS) {
    const cases = CASES.filter((c) => c.group === g.id);
    const learned = cases.filter((c) => statusOf(c) === "learned").length;
    learnedTotal += learned;
    const el = document.querySelector(`.group-progress[data-group="${g.id}"]`);
    if (el) el.textContent = `${learned}/${cases.length} learned`;
  }
  document.getElementById("overall-count").textContent = `${learnedTotal}/${CASES.length}`;
  document.getElementById("overall-bar").style.width =
    (learnedTotal / CASES.length) * 100 + "%";
}

function cycleStatus(id) {
  const current = progress[id] || "none";
  const next = STATUSES[(STATUSES.indexOf(current) + 1) % STATUSES.length];
  if (next === "none") delete progress[id];
  else progress[id] = next;
  saveProgress();

  const card = document.querySelector(`.case-card[data-id="${CSS.escape(id)}"]`);
  if (card) {
    card.dataset.status = next;
    card.querySelector(".status-btn").textContent = STATUS_LABELS[next];
  }
  updateCounts();
  applyFilters();
}

// ---------------------------------------------------------------------------
// Search & filter
// ---------------------------------------------------------------------------
const searchInput = document.getElementById("search");
let activeFilter = "all";

// Per-group LR-position selection: groupId -> array of <=2 positions. Each
// group filters independently. Session-transient (not persisted).
const posFilter = {};

// Returns the index of a variant of case `c` matching its group's selection
// (positions must all be in one variant, order-insensitive), -1 if positions
// are selected but none match, or null if that group has none selected.
function positionMatch(c) {
  const positions = posFilter[c.group];
  if (!positions || positions.length === 0) return null;
  for (let i = 0; i < c.variants.length; i++) {
    const v = c.variants[i];
    if (positions.every((p) => v.includes(p))) return i;
  }
  return -1;
}

function applyFilters() {
  const q = searchInput.value.trim().toLowerCase();
  for (const card of document.querySelectorAll(".case-card")) {
    const c = CASE_BY_ID[card.dataset.id];
    const matchesSearch = !q || card.dataset.search.includes(q);
    const matchesFilter =
      activeFilter === "all" || card.dataset.status === activeFilter;
    const posMatch = positionMatch(c);
    const matchesPos = posMatch !== -1;
    if (typeof posMatch === "number" && posMatch >= 0) selectVariant(card, posMatch);
    card.hidden = !(matchesSearch && matchesFilter && matchesPos);
  }
  for (const section of document.querySelectorAll(".group")) {
    section.hidden = !section.querySelector(".case-card:not([hidden])");
  }
  const anyVisible = document.querySelector(".group:not([hidden])");
  document.getElementById("no-results").hidden = !!anyVisible;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------
function copyText(text, button) {
  const done = () => {
    button.classList.add("copied");
    button.querySelector(".copy-hint").textContent = "copied!";
    setTimeout(() => {
      button.classList.remove("copied");
      button.querySelector(".copy-hint").textContent = "copy";
    }, 1200);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, done);
  } else {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    done();
  }
}

document.addEventListener("click", (e) => {
  const caseLink = e.target.closest(".case-link");
  if (caseLink) {
    e.preventDefault();
    goToCase(caseLink.dataset.caseId);
    return;
  }

  const statusBtn = e.target.closest(".status-btn");
  if (statusBtn) {
    cycleStatus(statusBtn.dataset.id);
    return;
  }

  const algBtn = e.target.closest(".alg");
  if (algBtn) {
    copyText(algBtn.querySelector("code").textContent, algBtn);
    return;
  }

  const thumb = e.target.closest(".variant-thumb");
  if (thumb) {
    selectVariant(thumb.closest(".case-card"), Number(thumb.dataset.variant));
    return;
  }

  const posChip = e.target.closest(".pos-chip");
  if (posChip) {
    togglePosition(posChip.dataset.group, posChip.dataset.pos);
    return;
  }
});

// Switch a card to a given variant: main image, scramble, alg, active thumb.
function selectVariant(card, idx) {
  const cse = CASE_BY_ID[card.dataset.id];
  const thumbs = card.querySelectorAll(".variant-thumb");
  card.querySelector(".main-image").src = imageUrl(cse.group, cse.variants[idx]);
  card.querySelector(".scramble-code").textContent = scrambleFor(cse, idx);
  card.querySelector(".alg-code").innerHTML = algHtml(solutionFor(cse, idx), markFor(cse, idx));
  thumbs.forEach((t, i) => t.classList.toggle("active", i === idx));
}

// Navigate to a case card by id: clear any active filters that would hide it,
// scroll it into view, and briefly flash it.
function goToCase(id) {
  const card = document.querySelector(`.case-card[data-id="${CSS.escape(id)}"]`);
  if (!card) return;
  const cse = CASE_BY_ID[id];
  // clear filters that could hide the target
  if (searchInput.value) { searchInput.value = ""; }
  if (activeFilter !== "all") {
    activeFilter = "all";
    for (const chip of document.querySelectorAll(".filter-chip"))
      chip.classList.toggle("active", chip.dataset.filter === "all");
  }
  if (posFilter[cse.group] && posFilter[cse.group].length) togglePosition(cse.group, "");
  applyFilters();

  card.scrollIntoView({ behavior: "smooth", block: "center" });
  card.classList.remove("flash");
  void card.offsetWidth; // restart the animation if re-triggered
  card.classList.add("flash");
  card.addEventListener("animationend", () => card.classList.remove("flash"), { once: true });
}

// Toggle an LR position for one group; a 3rd selection drops the oldest.
// dataset.pos === "" is the clear chip. Only this group's chip row updates.
function togglePosition(group, pos) {
  let sel = posFilter[group] || [];
  if (pos === "") {
    sel = [];
  } else if (sel.includes(pos)) {
    sel = sel.filter((p) => p !== pos);
  } else {
    sel = [...sel, pos].slice(-2);
  }
  posFilter[group] = sel;
  const section = document.querySelector(`.group[data-group="${CSS.escape(group)}"]`);
  for (const chip of section.querySelectorAll(".pos-chip"))
    chip.classList.toggle("active", sel.includes(chip.dataset.pos));
  applyFilters();
}

searchInput.addEventListener("input", applyFilters);

for (const chip of document.querySelectorAll(".filter-chip")) {
  chip.addEventListener("click", () => {
    activeFilter = chip.dataset.filter;
    for (const c of document.querySelectorAll(".filter-chip"))
      c.classList.toggle("active", c === chip);
    applyFilters();
  });
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
renderNav();
renderGroups();
updateCounts();
applyFilters();
