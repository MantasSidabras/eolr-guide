"use strict";

// ---------------------------------------------------------------------------
// Trainer — drill randomly picked case variants and track success rates.
// Loaded after data.js / scrambles.js / app.js and reuses their globals:
// CASES, GROUPS, caseId, imageUrl, scrambleFor, solutionFor, markFor,
// colorSwapFor, algHtml, variantLabel. Copying the scramble/alg rows is handled by
// app.js's document-level ".alg" click listener.
// ---------------------------------------------------------------------------

// Every trainable unit is one (case, variant index) pair, keyed
// "group::name::variantIndex" — scramble, image and alg all vary per variant.
const VARIANTS = CASES.flatMap((c) =>
  c.variants.map((v, vi) => ({ key: `${caseId(c)}::${vi}`, c, vi }))
);
const VARIANT_BY_KEY = Object.fromEntries(VARIANTS.map((x) => [x.key, x]));

// ---------------------------------------------------------------------------
// View switching (initial data-view is set in index.html before first paint)
// ---------------------------------------------------------------------------
let countedView = null; // last view sent to analytics (avoids double counts)

// Record a GoatCounter pageview for the current view, as a virtual path
// (tutorial / trainer) so the two tabs show up separately in analytics. The
// initial page load is counted automatically by GoatCounter's count.js (which
// may still be loading async when this first runs), so we only send a hit when
// the user actually switches views, not on the initial render.
function countView(view) {
  if (view === countedView) return;
  const first = countedView === null;
  countedView = view;
  if (first) return; // initial load already counted by count.js
  window.goatcounter?.count?.({
    path: view === "trainer" ? "trainer" : "tutorial",
    title: view === "trainer" ? "Trainer" : "Tutorial",
    event: false,
  });
}

function syncView() {
  const view = location.hash === "#trainer" ? "trainer" : "tutorial";
  document.documentElement.dataset.view = view;
  for (const a of document.querySelectorAll(".view-tabs a"))
    a.classList.toggle("active", a.dataset.view === view);
  countView(view);
}

window.addEventListener("hashchange", syncView);

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------
const SELECTION_KEY = "eolr-trainer-selection";
const STATS_KEY = "eolr-trainer-stats";
const WEAK_KEY = "eolr-trainer-weak";
const COLLAPSED_KEY = "eolr-trainer-collapsed";
const SESSION_KEY = "eolr-trainer-session";

function loadCollapsed() {
  try {
    const raw = JSON.parse(localStorage.getItem(COLLAPSED_KEY));
    if (Array.isArray(raw)) return new Set(raw);
  } catch {}
  return new Set();
}

// set of group ids whose accordion is collapsed
const collapsed = loadCollapsed();

function loadSelection() {
  try {
    const raw = JSON.parse(localStorage.getItem(SELECTION_KEY));
    if (Array.isArray(raw)) return new Set(raw.filter((k) => VARIANT_BY_KEY[k]));
  } catch {}
  return new Set(VARIANTS.map((x) => x.key)); // first visit: everything selected
}

let selection = loadSelection();

function saveSelection() {
  localStorage.setItem(SELECTION_KEY, JSON.stringify([...selection]));
}

function loadStats() {
  try {
    return JSON.parse(localStorage.getItem(STATS_KEY)) || {};
  } catch {
    return {};
  }
}

// { variantKey: { correct, attempts } }
let stats = loadStats();

function saveStats() {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

// Running session tally; persisted so a page refresh keeps the current run.
function loadSession() {
  try {
    const raw = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (raw && typeof raw.correct === "number" && typeof raw.attempts === "number") return raw;
  } catch {}
  return { correct: 0, attempts: 0 };
}

function saveSession() {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

// ---------------------------------------------------------------------------
// Selection panel
// ---------------------------------------------------------------------------
const trainerGroups = document.getElementById("trainer-groups");
const selectCount = document.getElementById("select-count");

function rateText(key) {
  const s = stats[key];
  return s && s.attempts ? `${s.correct}/${s.attempts}` : "—";
}

function rateClass(key) {
  const s = stats[key];
  if (!s || !s.attempts) return "vc-rate";
  return "vc-rate " + (s.correct / s.attempts >= 0.8 ? "vc-good" : "vc-weak");
}

function variantKeysForCase(id) {
  return CASE_BY_ID[id].variants.map((v, vi) => `${id}::${vi}`);
}

function variantKeysForGroup(groupId) {
  return VARIANTS.filter((x) => x.c.group === groupId).map((x) => x.key);
}

function renderSelection() {
  trainerGroups.innerHTML = GROUPS.map((g) => {
    const rows = CASES.filter((c) => c.group === g.id)
      .map((c) => {
        const id = caseId(c);
        const checks = c.variants
          .map((v, vi) => {
            const key = `${id}::${vi}`;
            return `<label class="variant-check">
              <input type="checkbox" data-key="${key}">
              <span class="vc-name">${variantLabel(v)}</span>
              <span class="${rateClass(key)}" data-rate-key="${key}">${rateText(key)}</span>
            </label>`;
          })
          .join("");
        return `<div class="trainer-case">
          <label class="tc-name"><input type="checkbox" class="case-check" data-case="${id}">${c.name}</label>
          <div class="tc-variants">${checks}</div>
        </div>`;
      })
      .join("");
    const open = collapsed.has(g.id) ? "" : " open";
    return `<details class="trainer-group" data-group="${g.id}"${open}>
      <summary class="tg-header">
        <label><input type="checkbox" class="group-check" data-group="${g.id}"><span>${g.id}</span></label>
        <span class="bad-edges">Misoriented edges: ${g.badEdges.join(", ")}</span>
        <span class="tg-count" data-count-group="${g.id}"></span>
      </summary>
      ${rows}
    </details>`;
  }).join("");
  updateSelectionUI();
}

// The group checkbox lives inside the <summary>, so a click both toggles the
// <details> and would flip the box. preventDefault stops the accordion — but
// it also cancels the box's native toggle (and its change event), so we drive
// the selection ourselves: full → deselect all, otherwise → select all.
trainerGroups.addEventListener("click", (e) => {
  const groupCheck = e.target.closest(".group-check");
  if (!groupCheck) return;
  e.preventDefault();
  const keys = variantKeysForGroup(groupCheck.dataset.group);
  const allSelected = keys.every((k) => selection.has(k));
  setSelected(keys, !allSelected);
  // The browser applies the checkbox's native toggle after this handler, which
  // can override the state updateSelectionUI just set; re-sync on the next
  // frame so the box reflects the real selection.
  requestAnimationFrame(updateSelectionUI);
});

// Persist which groups are collapsed so the accordion survives reloads.
trainerGroups.addEventListener("toggle", (e) => {
  const d = e.target;
  if (!d.classList || !d.classList.contains("trainer-group")) return;
  if (d.open) collapsed.delete(d.dataset.group);
  else collapsed.add(d.dataset.group);
  localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
}, true);

// Variant checkboxes reflect the selection set; case/group checkboxes are
// derived bulk toggles (indeterminate when partially selected).
function updateSelectionUI() {
  for (const input of trainerGroups.querySelectorAll("input[data-key]"))
    input.checked = selection.has(input.dataset.key);
  for (const input of trainerGroups.querySelectorAll(".case-check")) {
    const keys = variantKeysForCase(input.dataset.case);
    const n = keys.filter((k) => selection.has(k)).length;
    input.checked = n === keys.length;
    input.indeterminate = n > 0 && n < keys.length;
  }
  for (const input of trainerGroups.querySelectorAll(".group-check")) {
    const keys = variantKeysForGroup(input.dataset.group);
    const n = keys.filter((k) => selection.has(k)).length;
    input.checked = n === keys.length;
    input.indeterminate = n > 0 && n < keys.length;
    const count = trainerGroups.querySelector(`[data-count-group="${CSS.escape(input.dataset.group)}"]`);
    if (count) count.textContent = `${n}/${keys.length} selected`;
  }
  selectCount.textContent = `${selection.size} / ${VARIANTS.length} variants selected`;
}

function setSelected(keys, on) {
  for (const k of keys) on ? selection.add(k) : selection.delete(k);
  saveSelection();
  updateSelectionUI();
  updateIdleHint();
}

trainerGroups.addEventListener("change", (e) => {
  const input = e.target;
  if (input.dataset.key) setSelected([input.dataset.key], input.checked);
  else if (input.classList.contains("case-check"))
    setSelected(variantKeysForCase(input.dataset.case), input.checked);
  // group checkbox is handled in the click listener above (its native toggle
  // is prevented so this change event never fires for it)
});

// ---------------------------------------------------------------------------
// Weak-case weighting toggle
// ---------------------------------------------------------------------------
const weakToggle = document.getElementById("weak-toggle");
let weakMode = localStorage.getItem(WEAK_KEY) === "on";

function applyWeak() {
  weakToggle.setAttribute("aria-checked", weakMode ? "true" : "false");
  weakToggle.title = weakMode
    ? "Stop showing weaker cases more often"
    : "Show weaker cases more often";
}

weakToggle.addEventListener("click", () => {
  weakMode = !weakMode;
  localStorage.setItem(WEAK_KEY, weakMode ? "on" : "off");
  applyWeak();
});

// ---------------------------------------------------------------------------
// Drill state machine: idle → scramble → revealed → (mark) → scramble …
// ---------------------------------------------------------------------------
const drillHint = document.getElementById("drill-hint");
const drillCard = document.getElementById("drill-card");
const drillImage = document.getElementById("drill-image");
const drillScrambleCode = document.getElementById("drill-scramble-code");
const drillSolution = document.getElementById("drill-solution");
const drillSolutionCode = document.getElementById("drill-solution-code");
const drillMeta = document.getElementById("drill-meta");
const drillRecognition = document.getElementById("drill-recognition");
const drillDesc = document.getElementById("drill-desc");
const drillReveal = document.getElementById("drill-reveal");
const drillMarking = document.getElementById("drill-marking");
const sessionScore = document.getElementById("session-score");
const sessionPct = document.getElementById("session-pct");

// Session success rate as a colour-coded percentage: red below 50%, amber
// 50–79%, green at 80%+. Blank until at least one attempt.
function updateSessionScore() {
  sessionScore.textContent = `${session.correct}/${session.attempts}`;
  if (!session.attempts) {
    sessionPct.textContent = "";
    sessionPct.className = "session-pct";
    return;
  }
  const pct = Math.round((session.correct / session.attempts) * 100);
  sessionPct.textContent = `${pct}%`;
  sessionPct.className =
    "session-pct " + (pct >= 80 ? "pct-good" : pct >= 50 ? "pct-mid" : "pct-low");
}

let state = "idle"; // "idle" | "scramble" | "revealed"
let current = null; // variant key being drilled
let lastKey = null; // previous key, to avoid immediate repeats
let session = loadSession();

// Weighted random pick among selected variants. In weak mode a variant's
// weight grows as its success rate drops (unattempted counts as weakest):
// perfect → 1, unseen or always-wrong → 4.
function pickNext() {
  let pool = VARIANTS.filter((x) => selection.has(x.key));
  if (pool.length === 0) return null;
  if (pool.length > 1) pool = pool.filter((x) => x.key !== lastKey);
  const weight = (x) => {
    if (!weakMode) return 1;
    const s = stats[x.key];
    const rate = s && s.attempts ? s.correct / s.attempts : 0;
    return 1 + 3 * (1 - rate);
  };
  let r = Math.random() * pool.reduce((sum, x) => sum + weight(x), 0);
  for (const x of pool) {
    r -= weight(x);
    if (r <= 0) return x.key;
  }
  return pool[pool.length - 1].key; // float-rounding fallback
}

function updateIdleHint() {
  if (state !== "idle") return;
  drillHint.innerHTML = selection.size
    ? "Press <kbd>space</kbd> to start"
    : "Select at least one case below";
}

// Re-point the drill image at the current variant with the current colours,
// without advancing. Called by app.js applyColors when the scheme changes.
function refreshDrillImage() {
  if (!current) return;
  const x = VARIANT_BY_KEY[current];
  drillImage.src = imageUrl(x.c.group, x.c.variants[x.vi], colorSwapFor(x.c, x.vi));
}

function next() {
  const key = pickNext();
  if (!key) {
    state = "idle";
    current = null;
    drillCard.hidden = true;
    drillHint.hidden = false;
    updateIdleHint();
    return;
  }
  state = "scramble";
  current = key;
  const x = VARIANT_BY_KEY[key];
  drillImage.src = imageUrl(x.c.group, x.c.variants[x.vi], colorSwapFor(x.c, x.vi));
  drillScrambleCode.textContent = scrambleFor(x.c, x.vi);
  drillSolution.hidden = true;
  drillMeta.hidden = true;
  drillRecognition.hidden = true;
  drillDesc.hidden = true;
  drillMarking.hidden = true;
  drillReveal.hidden = false;
  drillHint.hidden = true;
  drillCard.hidden = false;
}

function reveal() {
  if (state !== "scramble") return;
  const x = VARIANT_BY_KEY[current];
  drillSolutionCode.innerHTML = algHtml(solutionFor(x.c, x.vi), markFor(x.c, x.vi));
  drillMeta.textContent = `${x.c.name} ${x.c.group} — ${variantLabel(x.c.variants[x.vi])}`;
  if (x.c.recognition) {
    drillRecognition.innerHTML = `<strong>Recognition:</strong> ${x.c.recognition}`;
    drillRecognition.hidden = false;
  } else {
    drillRecognition.hidden = true;
  }
  const descs = [
    x.c.solution ? { title: "Solution", text: x.c.solution } : null,
    x.c.mcSolution ? { title: "MC Solution", text: x.c.mcSolution } : null,
  ].filter(Boolean);
  drillDesc.innerHTML = descs
    .map((d) => `<p class="drill-desc-item"><strong>${d.title}:</strong> ${linkifySolution(d.text)}</p>`)
    .join("");
  drillDesc.hidden = descs.length === 0;
  drillSolution.hidden = false;
  drillMeta.hidden = false;
  drillReveal.hidden = true;
  drillMarking.hidden = false;
  state = "revealed";
}

function mark(ok) {
  if (state !== "revealed") return;
  const s = stats[current] || { correct: 0, attempts: 0 };
  stats[current] = { correct: s.correct + (ok ? 1 : 0), attempts: s.attempts + 1 };
  saveStats();
  session.attempts += 1;
  if (ok) session.correct += 1;
  saveSession();
  updateSessionScore();
  updateRate(current);
  lastKey = current;
  next();
}

function updateRate(key) {
  const el = trainerGroups.querySelector(`[data-rate-key="${CSS.escape(key)}"]`);
  if (el) {
    el.textContent = rateText(key);
    el.className = rateClass(key);
  }
}

function resetStats() {
  if (!confirm("Reset all trainer stats?")) return;
  stats = {};
  localStorage.removeItem(STATS_KEY);
  session = { correct: 0, attempts: 0 };
  localStorage.removeItem(SESSION_KEY);
  updateSessionScore();
  for (const el of trainerGroups.querySelectorAll("[data-rate-key]")) {
    el.textContent = "—";
    el.className = "vc-rate";
  }
}

function onSpace() {
  if (state === "idle") next();
  else if (state === "scramble") reveal();
  // revealed: space is ignored — mark with y/n first
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------
document.getElementById("trainer").addEventListener("click", (e) => {
  // "See X from there" links in solution descriptions lead to tutorial cards;
  // switch views synchronously so app.js's goToCase (which handles this click
  // next, at the document level) can scroll to the now-visible card.
  if (e.target.closest(".case-link")) {
    document.documentElement.dataset.view = "tutorial";
    location.hash = "";
    return;
  }
  const btn = e.target.closest("button");
  if (!btn) return;
  switch (btn.id) {
    case "drill-reveal": reveal(); btn.blur(); break;
    case "drill-correct": mark(true); btn.blur(); break;
    case "drill-wrong": mark(false); btn.blur(); break;
    case "select-all": setSelected(VARIANTS.map((x) => x.key), true); break;
    case "select-none": setSelected(VARIANTS.map((x) => x.key), false); break;
    case "select-learning": {
      // replace the selection with all variants of cases marked "learning"
      // in the tutorial (statusOf/progress come from app.js)
      selection = new Set(VARIANTS.filter((x) => statusOf(x.c) === "learning").map((x) => x.key));
      saveSelection();
      updateSelectionUI();
      updateIdleHint();
      break;
    }
    case "stats-reset": resetStats(); break;
  }
});

document.addEventListener("keydown", (e) => {
  if (document.documentElement.dataset.view !== "trainer") return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  // let checkboxes and any future inputs keep their native key behavior
  const t = e.target;
  if (t instanceof Element && (t.closest("input, textarea, select") || t.isContentEditable)) return;
  if (e.code === "Space") {
    e.preventDefault(); // no page scroll, no re-triggering a focused button
    onSpace();
  } else if (e.key === "y") {
    mark(true);
  } else if (e.key === "n") {
    mark(false);
  }
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
applyWeak();
renderSelection();
syncView();
updateIdleHint();
updateSessionScore();
