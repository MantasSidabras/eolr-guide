"use strict";

// ---------------------------------------------------------------------------
// VisualCube image URLs
// ---------------------------------------------------------------------------
// Realistic post-CMLL style: solved corners and blocks in real colors
// (U yellow, F blue, R red), M-slice pieces drawn with placeholder colors
// since their identity doesn't matter — silver = U/D color, purple = F/B
// color — and the two LR pieces in their real colors (yellow + orange/red).
// An edge showing silver/yellow on a side face (or purple/orange/red on
// U/D) is misoriented. Scheme yrbsom remaps D→silver and B→purple.
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
      const lr = lrIdx === 0 ? "l" : "r"; // orange / red side color
      fd[udIdx] = bad ? lr : "u";
      fd[sideIdx] = bad ? "u" : lr;
    } else {
      fd[udIdx] = bad ? "b" : "d";
      fd[sideIdx] = bad ? "d" : "b";
    }
  }
  return `${VISUALCUBE}?fmt=svg&size=300&sch=yrbsom&bg=t&fd=${fd.join("")}`;
}

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
  const thumbs =
    c.variants.length > 1
      ? `<div class="variant-thumbs">${c.variants
          .map(
            (v, i) =>
              `<button class="variant-thumb${i === 0 ? " active" : ""}" data-case="${id}" data-variant="${i}" title="LR edges in ${variantLabel(v)}">
                 <img src="${imageUrl(c.group, v)}" alt="Variant ${variantLabel(v)}" loading="lazy">
                 <span>${variantLabel(v)}</span>
               </button>`
          )
          .join("")}</div>`
      : "";

  const solutions = [
    c.solution ? { title: "Solution", text: c.solution } : null,
    c.mcSolution ? { title: "MC Solution", text: c.mcSolution } : null,
  ]
    .filter(Boolean)
    .map(
      (s) => `<details class="solution">
                <summary>${s.title}</summary>
                <p>${s.text}</p>
              </details>`
    )
    .join("");

  return `<article class="case-card" data-id="${id}" data-status="${statusOf(c)}"
            data-search="${[c.group, c.name, c.alg, c.recognition, c.variants.map(variantLabel).join(" ")]
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
      <button class="alg" title="Click to copy"><code>${c.alg}</code><span class="copy-hint">copy</span></button>
      <p class="recognition"><strong>Recognition:</strong> ${c.recognition}</p>
      ${solutions}
      <button class="status-btn" data-id="${id}">${STATUS_LABELS[statusOf(c)]}</button>
    </div>
  </article>`;
}

function renderGroups() {
  main.innerHTML = GROUPS.map((g) => {
    const cases = CASES.filter((c) => c.group === g.id);
    return `<section class="group" id="${groupAnchor(g.id)}" data-group="${g.id}">
      <header class="group-header">
        <h2>${g.id}</h2>
        <span class="bad-edges">Misoriented edges: ${g.badEdges.join(", ")}</span>
        <span class="group-progress" data-group="${g.id}"></span>
      </header>
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

function applyFilters() {
  const q = searchInput.value.trim().toLowerCase();
  for (const card of document.querySelectorAll(".case-card")) {
    const matchesSearch = !q || card.dataset.search.includes(q);
    const matchesFilter =
      activeFilter === "all" || card.dataset.status === activeFilter;
    card.hidden = !(matchesSearch && matchesFilter);
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
    const card = thumb.closest(".case-card");
    card.querySelector(".main-image").src = thumb.querySelector("img").src;
    for (const t of card.querySelectorAll(".variant-thumb"))
      t.classList.toggle("active", t === thumb);
  }
});

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
