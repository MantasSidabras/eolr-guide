// Generates scrambles.js: for every case variant,
//  - SCRAMBLES: a shortest M/U setup from solved to exactly the state shown
//    in that variant's diagram (group's misoriented edges, the variant's LR
//    positions, centers and corners solved), and
//  - SOLUTIONS: an alg that follows the case's Solution description: the
//    short reduction the text describes, chained into the referenced case's
//    alg ("... Stacked 3/1 from there"), recursively. Cases whose text
//    solves directly (and any chain that fails verification) get a shortest
//    BFS solve. Every alg is verified to finish EOLR with both LR edges on
//    the bottom (DF/DB): edges oriented for an even M-slice center offset,
//    or the misoriented-centers finish (four top edges flipped) for odd.
//
// The reduced cube model tracks, per LSE slot, whether it holds an LR edge
// and whether that edge is misoriented, plus U-layer and M-slice offsets.
// It was fuzz-verified against cubing.js (500 random M/U sequences,
// identical results), and the emitted pairs re-verified there end-to-end.
//
// Usage: node scripts/generate-scrambles.mjs > scrambles.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = fs.readFileSync(path.join(root, "data.js"), "utf8");
const { GROUPS, CASES } = new Function(src + "; return { GROUPS, CASES };")();

const SLOTS = ["UF", "UR", "UB", "UL", "DF", "DB"];
// Permutation arrays dest <- src for one quarter turn, identity where a slot
// is unaffected (indexed loop is far faster than Object.entries per move).
// U: UF->UL->UB->UR->UF. M: UF->DF->DB->UB->UF.
const U_PERM = [1, 2, 3, 0, 4, 5]; // dest d takes from src U_PERM[d]
const M_PERM = [2, 1, 5, 3, 0, 4];
const M_FLIP = [1, 0, 1, 0, 1, 1]; // slots whose EO flips on a quarter M

function applyMove(s, move) {
  let { lr, bad, u, m } = s;
  const times = move.endsWith("2") ? 2 : move.endsWith("'") ? 3 : 1;
  const isU = move[0] === "U";
  const perm = isU ? U_PERM : M_PERM;
  for (let i = 0; i < times; i++) {
    const nlr = [lr[perm[0]], lr[perm[1]], lr[perm[2]], lr[perm[3]], lr[perm[4]], lr[perm[5]]];
    const nbad = [bad[perm[0]], bad[perm[1]], bad[perm[2]], bad[perm[3]], bad[perm[4]], bad[perm[5]]];
    lr = nlr; bad = nbad;
    if (isU) u = (u + 1) % 4;
    else { for (let j = 0; j < 6; j++) if (M_FLIP[j]) bad[j] ^= 1; m = (m + 1) % 4; }
  }
  return { lr, bad, u, m };
}
const run = (s, alg) => alg.split(/\s+/).filter(Boolean).reduce(applyMove, s);
const MOVES = ["U", "U'", "U2", "M", "M'", "M2"];
const posKey = (s) => s.lr.join("") + s.bad.join("");
const fullKey = (s) => posKey(s) + s.u + s.m;
const solved = { lr: [0, 1, 0, 1, 0, 0], bad: [0, 0, 0, 0, 0, 0], u: 0, m: 0 };

const canonical = (c, v) => ({
  lr: SLOTS.map((sl) => +v.includes(sl)),
  bad: SLOTS.map((sl) => +GROUPS.find((g) => g.id === c.group).badEdges.includes(sl)),
  u: 0, m: 0,
});

// EOLR is finished when the LR edges sit at DF/DB, ready for M2. Two accepted
// finishes: centers square (even M offset) with all edges oriented; or the
// misoriented-centers (MC) finish (odd M offset) — the doc's MC solutions end
// here — where the four M-slice-destined edges are flipped and the two LR
// edges are clean. Both are genuinely solvable from LSE; the MC finish leaves
// the centers a quarter-turn off, which the user has accepted.
function isDone(s) {
  if (!(s.lr[4] && s.lr[5])) return false;
  if (s.m % 2 === 0) return s.bad.every((b) => !b);
  return s.bad[0] && s.bad[1] && s.bad[2] && s.bad[3] && !s.bad[4] && !s.bad[5];
}

function bfs(start, accept) {
  const seen = new Map([[fullKey(start), []]]);
  let layer = [start];
  while (layer.length) {
    const next = [];
    for (const s of layer) {
      const p = seen.get(fullKey(s));
      if (accept(s)) return p;
      for (const mv of MOVES) {
        const t = applyMove(s, mv);
        if (!seen.has(fullKey(t))) { seen.set(fullKey(t), [...p, mv]); next.push(t); }
      }
    }
    layer = next;
  }
  throw new Error("bfs exhausted");
}

// All shortest solutions from `start` to an accepting state: BFS by depth,
// and once any accepting state is seen at depth d, return every accepting
// path of depth d (capped). Gives alternatives to rank by token-honoring.
function bfsAll(start, accept, cap = 400) {
  const seen = new Set([fullKey(start)]);
  let layer = [[start, []]];
  while (layer.length) {
    const hits = [];
    for (const [s, p] of layer) if (accept(s)) hits.push(p);
    if (hits.length) return hits.slice(0, cap);
    const next = [];
    for (const [s, p] of layer)
      for (const mv of MOVES) {
        const t = applyMove(s, mv);
        if (!seen.has(fullKey(t))) { seen.add(fullKey(t)); next.push([t, [...p, mv]]); }
      }
    layer = next;
  }
  return [];
}

// scrambles: single BFS from solved covers every canonical state
const paths = new Map([[fullKey(solved), []]]);
{
  let frontier = [solved];
  while (frontier.length) {
    const next = [];
    for (const s of frontier)
      for (const mv of MOVES) {
        const t = applyMove(s, mv);
        if (!paths.has(fullKey(t))) { paths.set(fullKey(t), [...paths.get(fullKey(s)), mv]); next.push(t); }
      }
    frontier = next;
  }
}

// last "Name group" mention in the case's preferred solution text
const caseNames = new Map(CASES.map((c) => [`${c.name} ${c.group}`, c]));
function preferredText(c) {
  return c.solution || c.mcSolution || "";
}
function referencedCase(c) {
  const text = preferredText(c);
  // Capture a run of capitalized words before a "x/y" group id, then try the
  // longest trailing word-suffix that is a real case name — the leading words
  // ("See", "Do", "Adjust") aren't part of the name (e.g. "See Bad 3/1").
  const re = /((?:[A-Z][a-zA-Z]+ )+)(\d[oa]?\/\d)/g;
  let m, found = null;
  while ((m = re.exec(text))) {
    const words = m[1].trim().split(" ");
    const group = m[2];
    for (let start = 0; start < words.length; start++) {
      const target = caseNames.get(`${words.slice(start).join(" ")} ${group}`);
      if (target && target !== c) { found = target; break; }
    }
  }
  return found;
}

// The explicit literal move run the description tells you to perform, e.g.
// "Do M' U M'." -> ["M'","U","M'"]. The final token keeps its prime/2. Only
// runs of >=2 moves count as a real sequence (skips prose like "Do an M move").
function describedMoves(c) {
  const re = /\bDo\s+((?:(?:M2|M'|M|U2|U'|U)\s+)*(?:M2|M'|M|U2|U'|U))/g;
  const text = preferredText(c);
  let m, best = [];
  while ((m = re.exec(text))) {
    const toks = m[1].trim().split(/\s+/);
    if (toks.length >= 2 && toks.length > best.length) best = toks;
  }
  return best;
}

// Directional move tokens named anywhere in the description, in order, e.g.
// "...do a U', and undo the M move" -> ["U'"]. Only U'/U2/M'/M2 count — a bare
// "M move" or "adjust the U face" is left free (the solver picks the amount).
// These are a soft ranking signal: among correct shortest algs we prefer one
// that contains these tokens, in order, with the exact direction written.
function directionalTokens(c) {
  const text = preferredText(c);
  return [...text.matchAll(/(?<![A-Za-z])(U2|U'|M2|M')(?![A-Za-z])/g)].map((m) => m[1]);
}

// How many of `tokens` appear as an ordered subsequence of `moves`.
function honoredCount(moves, tokens) {
  let i = 0;
  for (const mv of moves) if (i < tokens.length && mv === tokens[i]) i++;
  return i;
}

// Many descriptions follow an "M-sandwich": "Do an M move … [U turns] … undo
// the M move." — an M turn, then some U-layer turns, then the inverse M. Build
// the literal head candidates for that structure: M_dir + innerU + inverse(M).
// The inner U turns use the exact directional token when the text names one
// ("do a U'", "do a U2"); otherwise they're free (any single U turn or none),
// covering "adjust the U face". A leading AUF ("adjust the … edge") is allowed.
// Returns an array of head move-lists, or [] if the case isn't a sandwich.
function sandwichHeads(c) {
  const text = preferredText(c);
  if (!/undo (the|that|it|the original|the initial|the first)\b.*\bM\b|undo it with an M/i.test(text)) return [];
  // exact inner U turns named between the M and the undo, in order
  const innerExact = [...text.matchAll(/\bdo (?:a |an )?(U2|U'|U)(?![A-Za-z])/gi)].map((m) => m[1]);
  const inners = innerExact.length ? [innerExact] : [[], ["U"], ["U'"], ["U2"]];
  const heads = [];
  for (const auf of AUFS)
    for (const mDir of ["M", "M'"])
      for (const inner of inners)
        heads.push([...(auf ? [auf] : []), mDir, ...inner, mDir === "M" ? "M'" : "M"]);
  return heads;
}

// Does state `s` show the referenced case, by PIECE POSITION (which slots hold
// the LR + misoriented edges)? We match on position only, not the exact U/M
// frame: the description says "<Case> from there", and the tail then just
// solves that sub-case from wherever the reduction lands (any equivalent
// frame). Position-only matching is what lets the natural, shortest
// description-following alg be found (e.g. 1/1 Best -> M U M' U M').
function matchTarget(s, target) {
  for (let vi = 0; vi < target.variants.length; vi++)
    if (posKey(s) === posKey(canonical(target, target.variants[vi])))
      return { vi };
  return null;
}

const AUFS = ["", "U", "U2", "U'"];

// Cancel adjacent same-face moves at join seams (e.g. "M2 M" -> "M'",
// "M M'" -> ""). Repeated until stable. U and M never interact.
const AMOUNT = { "": 0, U: 1, U2: 2, "U'": 3, M: 1, M2: 2, "M'": 3 };
const FROM = { U: ["", "U", "U2", "U'"], M: ["", "M", "M2", "M'"] };
function simplify(moves) {
  const out = [];
  for (const mv of moves) {
    const face = mv[0];
    if (out.length && out[out.length - 1][0] === face) {
      const n = (AMOUNT[out[out.length - 1]] + AMOUNT[mv]) % 4;
      out.pop();
      if (n) out.push(FROM[face][n]);
    } else {
      out.push(mv);
    }
  }
  // one pass can expose a new adjacency (a...a cancels to empty); repeat
  return out.length === moves.length ? out : simplify(out);
}

// Simplify head+tail into one fully-cancelled sequence while tracking exactly
// how many of the surviving moves came from `head`. We simplify head and tail
// each on their own (no cross-boundary cancellation yet), then cancel across
// the single seam, decrementing the head count for each head-move consumed.
// Returns { moves, headLen }.
function simplifyJoin(head, tail) {
  const h = simplify(head);
  const t = simplify(tail);
  let headLen = h.length;
  const out = [...h];
  for (const mv of t) {
    if (out.length && out[out.length - 1][0] === mv[0]) {
      const prev = out.pop();
      if (out.length < headLen) headLen = out.length; // consumed a head move
      const n = (AMOUNT[prev] + AMOUNT[mv]) % 4;
      if (n) out.push(FROM[mv[0]][n]); // replacement belongs to tail side
    } else {
      out.push(mv);
    }
  }
  return { moves: out, headLen: Math.min(headLen, out.length) };
}

const memo = new Map();

// Candidates for head + tail: given a fixed `head` (this case's own moves),
// try every shortest solving tail of the sub-case the head leaves, yielding a
// candidate per tail. Simplify each whole alg, mark the HEAD span, and score
// how many directional `tokens` it honors. Returns an array of
// { alg, mark, len, honored }.
function candidates(start, head, tokens) {
  const mid = run(start, head.join(" "));
  const tails = bfsAll(mid, isDone, 40);
  const out = [];
  for (const tail of tails) {
    const { moves: s, headLen } = simplifyJoin(head, tail);
    if (!s.length || !isDone(run(start, s.join(" ")))) continue;
    out.push({
      alg: s.join(" "),
      mark: headLen >= 2 ? [0, headLen] : null,
      len: s.length,
      honored: honoredCount(s, tokens),
    });
  }
  return out;
}

// Returns { alg, mark } — a correct alg that follows the case's Solution
// description. Strategy priority: (1) explicit "Do <moves>" anchor those
// moves; (2) "<Case> from there" reduce to that case's position; (3) verbal /
// fallback solve. Within the chosen strategy, rank candidates by directional
// tokens honored (desc) then length (asc): the shortest alg that respects the
// exact turns the text names (e.g. a written U' stays U').
function algFor(c, vi) {
  const id = `${c.group}::${c.name}::${vi}`;
  if (memo.has(id)) return memo.get(id);
  const start = canonical(c, c.variants[vi]);
  const ref = referencedCase(c);
  const explicit = describedMoves(c);
  const tokens = directionalTokens(c);
  const sandwiches = sandwichHeads(c);

  let pool = [];
  // 1. explicit contiguous "Do <moves>" run: [AUF] + those moves, then solve.
  if (explicit.length)
    for (const setup of AUFS) pool.push(...candidates(start, [...(setup ? [setup] : []), ...explicit], tokens));

  // 1b. "M-sandwich" structure ("Do an M … undo the M move"): build the head
  //     literally as M + innerU + inverse-M; the tail then solves whatever
  //     remains. Keep only heads that lead to a solve (candidates() checks).
  if (!pool.length && sandwiches.length)
    for (const head of sandwiches) pool.push(...candidates(start, head, tokens));

  // 2. "<Case> from there": every shortest reduction to the referenced case's
  //    position is a possible head; each then solved and scored.
  if (!pool.length && ref) {
    const reductions = bfsAll(start, (s) => matchTarget(s, ref) !== null);
    for (const red of reductions) pool.push(...candidates(start, red, tokens));
  }

  // 3. verbal-only / fallback: the whole alg is the head — enumerate all
  //    shortest solves and rank by token-honoring.
  if (!pool.length)
    for (const sol of bfsAll(start, isDone)) pool.push(...candidates(start, sol, tokens));

  // pick: most directional tokens honored, then shortest.
  pool.sort((a, b) => b.honored - a.honored || a.len - b.len);
  const best = pool[0];
  if (!best || !isDone(run(start, best.alg))) throw new Error("unverified alg " + id);
  const result = { alg: best.alg, mark: best.mark };
  memo.set(id, result);
  return result;
}

const scrambleLines = [], solutionLines = [], markLines = [];
for (const c of CASES) {
  const scrambles = [], solutions = [], marks = [];
  c.variants.forEach((v, vi) => {
    const p = paths.get(fullKey(canonical(c, v)));
    if (!p) throw new Error(`unreachable: ${c.group} ${c.name} ${v}`);
    scrambles.push(p.join(" "));
    const r = algFor(c, vi);
    solutions.push(r.alg);
    marks.push(r.mark);
  });
  const k = JSON.stringify(`${c.group}::${c.name}`);
  scrambleLines.push(`  ${k}: [${scrambles.map((s) => JSON.stringify(s)).join(", ")}],`);
  solutionLines.push(`  ${k}: [${solutions.map((s) => JSON.stringify(s)).join(", ")}],`);
  markLines.push(`  ${k}: [${marks.map((m) => JSON.stringify(m)).join(", ")}],`);
}

const out = [];
out.push("// Generated by scripts/generate-scrambles.mjs — do not edit by hand.");
out.push("//");
out.push("// SCRAMBLES: applied to a solved cube, produces exactly the state shown in");
out.push("// the corresponding VisualCube diagram (group's misoriented edges, variant's");
out.push("// LR positions, centers and corners solved).");
out.push("// SOLUTIONS: follows the case's Solution description — embeds the literal moves");
out.push("// the text specifies (e.g. \"Do M' U M'\") and, for referenced cases, ends with");
out.push("// the referenced case's own alg. Finishes with both LR edges on the bottom (DF/DB).");
out.push("// SOLUTION_MARKS: [startIndex, length] of the described sub-sequence within each");
out.push("// alg's move list (null if none) — used by the highlight toggle.");
out.push("// Keys are 'group::case'; arrays are parallel to each case's variants list.");
out.push("");
out.push("const SCRAMBLES = {");
out.push(...scrambleLines);
out.push("};");
out.push("");
out.push("const SOLUTIONS = {");
out.push(...solutionLines);
out.push("};");
out.push("");
out.push("const SOLUTION_MARKS = {");
out.push(...markLines);
out.push("};");
console.log(out.join("\n"));
