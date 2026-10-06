// 奧特曼揭牌抽籤 — 純前端靜態網站（GitHub Pages 友善，相對路徑）
// 撕牌動作 v5：奧特曼站在黑板左邊，用胸口高度伸向黑板的那隻手（去背疊圖、手腕為軸）跟著每一撕「捏→上抬→下擺→彈回」；
// 上方扶黑板的手不動。畫面是一疊作品紙，每一抽他捏住紙緣（支點：桌機左緣中段、手機卡片上緣 86%）
// 把最上面那整張作品往他身體方向（左下）扯下、甩出畫面，露出下一張；最後留下的就是中籤作品。

// 內建作品清單：檔名以相對路徑引用，確保在 /reponame/ 子路徑下也能載入
const ARTWORKS = [
  { src: "artworks/art1-traffic.jpg", name: "交通王國 · 小天" },
  { src: "artworks/art2-star.jpg",    name: "星星王國 · 小全" },
  { src: "artworks/art3-sweet.jpg",   name: "可愛甜美王國 · 小喬" },
];

const wrap       = document.querySelector(".wrap");
const panel      = document.getElementById("panel");
const cover      = document.getElementById("cover");
const coverLabel = document.getElementById("coverLabel");
const artName    = document.getElementById("artname");
const hud        = document.getElementById("hud");
const startBtn   = document.getElementById("startBtn");
const resetBtn   = document.getElementById("resetBtn");
const sheets     = Array.from(document.querySelectorAll(".sheet"));   // 3 reusable layers
const shards     = Array.from(document.querySelectorAll(".shard"));   // 3 reusable scraps
const handEl     = document.getElementById("hand");                     // v3 cut-out hand overlay
const controlsEl = document.querySelector(".controls");
const zoomEl     = document.getElementById("zoom");                     // winner lightbox
const zoomImg    = document.getElementById("zoomImg");
const zoomCap    = document.getElementById("zoomCap");
const rosterBtn    = document.getElementById("rosterBtn");                // 📋 名單 (local class list)
const rosterEl     = document.getElementById("roster");
const rosterText   = document.getElementById("rosterText");
const rosterStatus = document.getElementById("rosterStatus");
const rosterSaved  = document.getElementById("rosterSaved");                // "已存 N 筆" (contents hidden by default)
const rosterSavedText = document.getElementById("rosterSavedText");
const rosterReveal = document.getElementById("rosterReveal");
const rosterClearBtn = document.getElementById("rosterClear");

const reduceMQ = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
const reduceMotion = () => !!(reduceMQ && reduceMQ.matches);
const canAnimate = typeof Element !== "undefined" && typeof Element.prototype.animate === "function";

// ── rhythm (total ≈ 3.2 s) ───────────────────────────────────────────────
const TEARS     = 8;     // sheets torn per draw (top sheet + 7 fillers; winner is always last)
const FINAL_D   = 520;   // the heavy final rip
const PAUSE_MS  = 400;   // tense pause (corner jitter) before the final rip
const REVEAL_MS = 250;   // winner revealed → wait → badge pops + name fades in
// pre-final tear durations: 180ms → … → 550ms (second-to-last), progressively slower
const DUR = Array.from({ length: TEARS - 1 }, (_, i) =>
  Math.round(180 + 370 * Math.pow(i / (TEARS - 2), 3)));
// gaps between pre-final tears: 40ms → 80ms
const GAP = Array.from({ length: TEARS - 2 }, (_, i) =>
  Math.round(40 + 40 * Math.pow(i / (TEARS - 3), 2)));

let spinning    = false;
let rafId       = null;      // requestAnimationFrame id (so we can cancel a stray tick)
let timers      = new Set(); // every pending setTimeout of the current draw
let anims       = [];        // every running Web Animation of the current draw
let ready       = false;     // true once all artworks are preloaded
let winnerSheet = null;      // sheet element showing the current winner (won state)
let winnerIdx   = -1;

// 均勻亂數：優先使用 crypto，fallback 到 Math.random（已驗證公平，勿改）
function uniformIndex(n) {
  if (window.crypto && window.crypto.getRandomValues) {
    // rejection sampling 以避免模數偏差
    const max = Math.floor(0xFFFFFFFF / n) * n;
    const buf = new Uint32Array(1);
    let v;
    do { window.crypto.getRandomValues(buf); v = buf[0]; } while (v >= max);
    return v % n;
  }
  return Math.floor(Math.random() * n);
}

// ── helpers ──────────────────────────────────────────────────────────────
function setDisabled(btn, v) {
  btn.disabled = v;
  if (v) btn.setAttribute("aria-disabled", "true");
  else btn.removeAttribute("aria-disabled");
}

// setTimeout that is tracked (cancelled on reset) and only fires while a draw is running
function later(fn, ms) {
  const id = setTimeout(() => { timers.delete(id); if (spinning) fn(); }, ms);
  timers.add(id);
  return id;
}

function clearTimers() {
  timers.forEach(id => clearTimeout(id));
  timers.clear();
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
}

function animate(el, keyframes, opts) {
  if (!canAnimate) return null;
  const a = el.animate(keyframes, opts);
  anims.push({ el, a });
  return a;
}

function cancelAnims(el) {
  anims = anims.filter(r => {
    if (el && r.el !== el) return true;
    try { r.a.cancel(); } catch (e) { /* ignore */ }
    return false;
  });
}

// put a sheet back to a clean resting state (never touches the img src)
function restSheet(el) {
  cancelAnims(el);
  el.classList.remove("fadeout", "fadein", "fadein-start");
  el.style.zIndex = "";
}

// load artwork i onto a sheet. Never sets src="" / removes src (no broken-image icon).
function loadSheet(el, i) {
  const img = el.firstElementChild;
  if (img.getAttribute("src") !== ARTWORKS[i].src) img.src = ARTWORKS[i].src;
  img.alt = "";                // filler sheets are decorative while cycling (no spoiler)
  el.dataset.art = String(i);
  restSheet(el);
  el.hidden = false;
}

// z-order of the stack, top first
function applyZ(stack) {
  stack.forEach((el, k) => { el.style.zIndex = String(10 - k); });
}

// random but non-consecutive filler artworks; the winner is always last.
// Built backwards from the winner so the sheet right above the winner differs from it,
// and the first filler differs from whatever is on top right now.
function buildFillers(winner, prevTop, count) {
  const n = ARTWORKS.length;
  const out = new Array(count);
  let below = winner;
  for (let k = count - 1; k >= 0; k--) {
    let cand = [];
    for (let i = 0; i < n; i++) if (i !== below && (k > 0 || i !== prevTop)) cand.push(i);
    if (!cand.length) for (let i = 0; i < n; i++) if (i !== below) cand.push(i);
    if (!cand.length) cand = [below];               // only one artwork: repeats unavoidable
    out[k] = cand[uniformIndex(cand.length)];
    below = out[k];
  }
  return out;
}

// clip-path for a sheet whose top + right edges are torn (amp = 0 → intact rectangle).
// Same vertex count either way so the browser can morph intact → jagged.
function edgePoly(amp) {
  const N = 14, M = 10, ax = amp * 0.75, pts = ["0% 0%"];
  const jag = (a, odd) => a ? (odd ? a * (0.5 + Math.random()) : a * 0.15 * Math.random()) : 0;
  for (let i = 1; i < N; i++) pts.push(`${(i / N * 100).toFixed(2)}% ${jag(amp, i % 2).toFixed(2)}%`);
  pts.push(amp ? `${(100 - ax).toFixed(2)}% ${(amp * 0.9).toFixed(2)}%` : "100% 0%");
  for (let j = 1; j < M; j++) pts.push(`${(100 - jag(ax, j % 2)).toFixed(2)}% ${(j / M * 100).toFixed(2)}%`);
  pts.push(`${(100 - (amp ? ax * 0.3 : 0)).toFixed(2)}% 100%`, "0% 100%");
  // torn edges = top + right (MX = -1 would mirror them to top + left; same vertex count either way)
  const out = MX === 1 ? pts : pts.map(pt => { const [px, py] = pt.split(" "); return `${(100 - parseFloat(px)).toFixed(2)}% ${py}`; });
  return `polygon(${out.join(", ")})`;
}

// v5: back to the original (un-mirrored) hero — Ultraman on the LEFT, paper flung down-left
// (v2.1 keyframes). MX = 1 keeps every value as written; MX = -1 would mirror x / rotate / skewX.
const MX = 1;
const flipX = x => (MX === 1 ? x            // no mirror: keep every value exactly as written
  : typeof x === "number" ? x * MX
  : (x.startsWith("-") ? x.slice(1) : (parseFloat(x) === 0 ? x : "-" + x)));
const T = (x, y, r, s, k) => `translate(${flipX(x)}, ${y}) rotate(${r * MX}deg) skewX(${s * MX}deg) scale(${k})`;
const TENSE_END = T("-3px", "4px", -1.5, -2, 1);   // pose at the end of the pre-final pause (pulled toward his hand, barely rotated)

// the stage shakes once at the moment of the rip
function shake(heavy) {
  const a = heavy ? 5 : 3, b = heavy ? 3 : 2;   // (symmetric jolt — fine for both sides)
  animate(wrap, heavy
    ? [{ transform: "translate(0,0)" }, { transform: `translate(-${a}px,${b}px)` },
       { transform: `translate(${a - 1}px,-${b - 1}px)` }, { transform: "translate(-2px,1px)" },
       { transform: "translate(0,0)" }]
    : [{ transform: "translate(0,0)" }, { transform: `translate(-${a}px,${b}px)` },
       { transform: "translate(0,0)" }],
    { duration: heavy ? 160 : 80, easing: "ease-out" });
}

// 1–2 scraps (3 on the final rip) burst from the top / right edges, drift up-right 20px
function burst(count) {
  for (let i = 0; i < count && i < shards.length; i++) {
    const sh = shards[i];
    if (i % 2 === 0) { sh.style.left = (35 + Math.random() * 55).toFixed(1) + "%"; sh.style.top = "0%"; }
    else             { sh.style.left = "100%"; sh.style.top = (8 + Math.random() * 50).toFixed(1) + "%"; }
    sh.hidden = false;
    const rot = (Math.random() < 0.5 ? -1 : 1) * (90 + Math.random() * 120);
    cancelAnims(sh);
    animate(sh, [
      { transform: "translate(0px,0px) rotate(0deg)", opacity: 1 },
      { transform: `translate(20px,-20px) rotate(${rot.toFixed(0)}deg)`, opacity: 0 },
    ], { duration: 250, easing: "ease-out", fill: "forwards" });
    later(() => { sh.hidden = true; cancelAnims(sh); }, 260);
  }
}

// ── v5: the LOWER hand (chest height, reaching to the board; pivot = wrist) ──
// The upper hand holding the board stays in the background. This one swings around the wrist,
// with the same d / offsets as tearSheet: pinch → lift (−16°, final −20°) → yank down hard
// (+28°, final +35°) while the hand also drops 6% of its width (final 8%) → spring back (−5°).
// Fingers point right, wrist on the left: rotate > 0 = fingers down, < 0 = fingers up.
// translate % is relative to the hand box (181×78): 6% of its width ≈ 14% of its height, 8% ≈ 19%.
// (Kept small so the background cuff doesn't read as a second, doubled cuff at the low point.)
const H = (x, y, r) => `translate(${x}, ${y}) rotate(${r}deg)`;
const HAND_TENSE = { y: -6, r: -12 };             // pre-final pause: lifted, holding the paper taut
const HAND_DROP = { normal: 14, heavy: 19 };      // % of hand height ≈ 6% / 8% of hand width
function stopHand() {
  if (!handEl) return;
  cancelAnims(handEl);
  if (handEl.getAnimations) handEl.getAnimations().forEach(a => { try { a.cancel(); } catch (e) {} });
}
function handSwing(d, heavy) {
  if (!handEl || reduceMotion()) return;
  const k = heavy ? 1.25 : 1;
  const drop = heavy ? HAND_DROP.heavy : HAND_DROP.normal;
  cancelAnims(handEl);
  const start = heavy ? H("0%", `${HAND_TENSE.y}%`, HAND_TENSE.r) : H("0%", "0%", 0);
  animate(handEl, [
    { offset: 0,    transform: start },
    { offset: 0.05, transform: H("0%", "3%", 3) },                                           // pinch the edge
    { offset: 0.10, transform: H("0%", `${-8 * k}%`, -16 * k), easing: "cubic-bezier(.3,0,.2,1)" }, // lift it
    { offset: 0.15, transform: H("0%", "0%", 0), easing: "cubic-bezier(.5,0,.2,1.15)" },     // start down: hard yank, slight overshoot
    { offset: 0.25, transform: H("-3%", `${drop}%`, 28 * k), easing: "ease-out" },            // yank down + drop
    { offset: 0.62, transform: H("-2%", `${Math.round(drop * 0.7)}%`, 20 * k) },              // stays low with the paper
    { offset: 0.80, transform: H("0%", "-3%", -5) },                                         // spring back, overshoot up
    { offset: 1,    transform: H("0%", "0%", 0) },
  ], { duration: d, fill: "none" });
}
// pre-final pause: lift and hold the paper taut, with a ±1.5° tremble
function handTense(ms) {
  if (!handEl || reduceMotion()) return;
  cancelAnims(handEl);
  const y = HAND_TENSE.y, r = HAND_TENSE.r;
  animate(handEl, [
    { transform: H("0%", "0%", 0) },
    { transform: H("0%", `${y}%`, r), offset: 0.3, easing: "ease-out" },
    { transform: H("0%", `${y}%`, r + 1.5), offset: 0.45 },
    { transform: H("0%", `${y}%`, r - 1.5), offset: 0.6 },
    { transform: H("0%", `${y}%`, r + 1.5), offset: 0.75 },
    { transform: H("0%", `${y}%`, r - 1.5), offset: 0.9 },
    { transform: H("0%", `${y}%`, r) },
  ], { duration: ms, fill: "forwards" });
}

// pre-final pause: the gripped corner jitters harder and harder (tension).
// v3: the jitter is mostly translation toward his hand (down-left) with very little
// rotation, so the far (right) edge never lifts above the board while it tautens.
function tense(el, ms) {
  animate(el, [
    { transform: T("0px", "0px", 0, 0, 1) },
    { transform: T("2px", "2px", -0.5, -1, 1), offset: 0.12 },
    { transform: T("-2px", "1px", -0.3, -1.5, 1), offset: 0.25 },
    { transform: T("3px", "3px", -0.9, -2, 1), offset: 0.4 },
    { transform: T("-3px", "2px", -0.6, -2.5, 1), offset: 0.55 },
    { transform: T("4px", "4px", -1.3, -3, 1), offset: 0.7 },
    { transform: T("-4px", "3px", -1, -3.5, 1), offset: 0.85 },
    { transform: TENSE_END },
  ], { duration: ms, fill: "forwards" });
}

// one tear of the top sheet over duration d (pivot = grip corner via CSS transform-origin):
//  0–15% grip (paper tautens + 2px jitter, almost no rotation) · 15–25% rip open (+ stage shake)
//  25–100% pulled DOWN-LEFT toward his hand/body and out past his feet (translation leads,
//  rotation follows), fading out over the last 20%
//  from 15% the top + right edges turn jagged · at 25% scraps burst from those edges
// v3 trajectory (UI/UX spec): 25% ≈ translate(-10%, 6%) rotate(-6deg) → 100% ≈ translate(-90%, 70%) rotate(-25deg)
const RIP_EASE  = "cubic-bezier(.2,.9,.3,1)";    // 15→25%: the snap of the rip
const PULL_EASE = "cubic-bezier(.5,0,.9,.6)";    // 25→62%: slow → fast, like being yanked away
const FLING_EASE = "cubic-bezier(.3,.45,.75,1)"; // 62→100%: carries the speed off the stage
function tearSheet(el, d, heavy) {
  handSwing(d, heavy);                           // the right hand swings in sync (same d, same offsets)
  const grip = heavy
    ? [{ offset: 0, transform: TENSE_END },
       { offset: 0.08, transform: T("2px", "5px", -2, -2.5, 1) },
       { offset: 0.15, transform: T("-2%", "2.5%", -2.5, -2, 1), easing: RIP_EASE },
       { offset: 0.25, transform: T("-12%", "8%", -7, 0, 1), easing: PULL_EASE },
       { offset: 0.62, transform: T("-46%", "34%", -15, 0, 0.96), easing: FLING_EASE },
       { offset: 1, transform: T("-95%", "75%", -27, 0, 0.9) }]
    : [{ offset: 0, transform: T("0px", "0px", 0, 0, 1) },
       { offset: 0.05, transform: T("1px", "2px", -0.5, -1, 1) },
       { offset: 0.10, transform: T("2px", "1px", -0.8, -1.5, 1) },
       { offset: 0.15, transform: T("-1%", "1.5%", -1.2, -1.5, 1), easing: RIP_EASE },
       { offset: 0.25, transform: T("-10%", "6%", -6, 0, 1), easing: PULL_EASE },
       { offset: 0.62, transform: T("-42%", "31%", -13, 0, 0.97), easing: FLING_EASE },
       { offset: 1, transform: T("-90%", "70%", -25, 0, 0.92) }];
  animate(el, grip, { duration: d, fill: "forwards" });

  const intact = edgePoly(0), torn = edgePoly(heavy ? 5.5 : 3.2);
  animate(el, [
    { offset: 0, clipPath: intact }, { offset: 0.15, clipPath: intact },
    { offset: 0.19, clipPath: torn }, { offset: 1, clipPath: torn },
  ], { duration: d, fill: "forwards" });

  animate(el, [{ opacity: 1 }, { opacity: 0 }],
    { duration: d * 0.2, delay: d * 0.8, fill: "forwards" });

  if (canAnimate) {
    later(() => shake(heavy), d * 0.15);
    later(() => burst(heavy ? 3 : 1 + (Math.random() < 0.5 ? 1 : 0)), d * 0.25);
  }
}

// ── winner zoom (lightbox) ──────────────────────────────────────────────
// Only the revealed winner can be opened; click anywhere / Esc closes; reset & redraw close it.
// The caption comes from captionFor() — the single hook for showing a different label later
// (e.g. a class list kept only on the teacher's own computer). Never written to the repo.
function captionFor(i) {
  const r = roster[i];
  if (!r) return ARTWORKS[i].name;                     // no list on this computer → nickname
  return r.seat + " " + r.name;                   // e.g. 座號 名字 (no kingdom prefix — Simon's format)
}
function refreshZoomCaption() {
  if (!zoomEl.hidden && winnerIdx >= 0) zoomCap.textContent = captionFor(winnerIdx);
}
function openZoom() {
  if (spinning || !winnerSheet || winnerIdx < 0 || !panel.classList.contains("won")) return;
  const a = ARTWORKS[winnerIdx];
  zoomImg.src = a.src;
  zoomImg.alt = a.name;
  zoomCap.textContent = captionFor(winnerIdx);   // textContent only (no HTML injection)
  zoomEl.hidden = false;
  zoomEl.focus();
}
function closeZoom() {
  if (zoomEl.hidden) return;
  const hadFocus = zoomEl.contains(document.activeElement) || document.activeElement === zoomEl;
  zoomEl.hidden = true;
  zoomCap.textContent = "";
  if (hadFocus && panel.classList.contains("won")) panel.focus();
}
function setZoomable(on) {
  if (on) {
    panel.setAttribute("tabindex", "0");
    panel.setAttribute("role", "button");
    panel.setAttribute("aria-label", "放大中籤作品");
  } else {
    panel.removeAttribute("tabindex");
    panel.removeAttribute("role");
    panel.removeAttribute("aria-label");
  }
}
panel.addEventListener("click", openZoom);
panel.addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && panel.classList.contains("won")) { e.preventDefault(); openZoom(); }
});
zoomEl.addEventListener("click", closeZoom);
document.addEventListener("keydown", e => { if (e.key === "Escape") closeZoom(); });

// ── 📋 local class list: seat number + name per artwork ─────────────────
// Privacy rules (Security): paste only (never read from the URL), stored ONLY in this browser's
// localStorage, never sent anywhere, never logged, always rendered with textContent, bounded
// size, and 「清除名單」 really removes the stored item. Nothing here is ever written to the repo.
// Each line names its artwork explicitly (作品編號 1–3 or 王國名稱) — never by line order:
//   作品1 00000 範例      1 00000 範例      交通王國 00000 範例
const ROSTER_KEY = "ultraman-lottery.roster.v1";
const ROSTER_MAX_CHARS = 2000, ROSTER_MAX_LINES = 50, ROSTER_MAX_LINE = 80, NAME_MAX = 12, SEAT_MAX = 8;
let roster = {};                                  // { artworkIndex: { seat, name } }
let rosterPersisted = true;                       // false → storage unavailable (e.g. private mode)

function kingdomOf(i) { return ARTWORKS[i].name.split(" · ")[0]; }
function cleanName(t) {
  // drop control / bidi-override / zero-width chars; collapse spaces; cap length (by code point)
  const c = String(t).replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, "")
    .replace(/\s+/g, " ").trim();
  return Array.from(c).slice(0, NAME_MAX).join("");
}
function validEntry(e) {
  return e && typeof e.seat === "string" && /^[0-9]{1,8}$/.test(e.seat) &&
    typeof e.name === "string" && e.name.length > 0 && cleanName(e.name) === e.name;
}
function artworkKey(tok) {
  const t = tok.replace(/[：:.．、]$/, "");
  const m = /^(?:作品|第)?([0-9０-９]{1,2})(?:件|號)?$/.exec(t);
  if (m) {
    const n = parseInt(m[1].replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xFEE0)), 10);
    return n >= 1 && n <= ARTWORKS.length ? n - 1 : -1;
  }
  for (let i = 0; i < ARTWORKS.length; i++) if (t === kingdomOf(i)) return i;
  return -1;
}
// returns { map, ok, skipped } — a bad line is skipped, never breaks the whole list
function parseRoster(text) {
  const map = {}; let ok = 0, skipped = 0;
  const lines = String(text).slice(0, ROSTER_MAX_CHARS).split(/\r?\n/);
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li].trim();
    if (!line) continue;
    if (li >= ROSTER_MAX_LINES || line.length > ROSTER_MAX_LINE) { skipped++; continue; }
    const toks = line.split(/[\s,，、\t]+/).filter(Boolean);
    if (toks.length < 3) { skipped++; continue; }
    const idx = artworkKey(toks[0]);
    const seat = toks[1].replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xFEE0));
    const name = cleanName(toks.slice(2).join(" "));
    if (idx < 0 || !/^[0-9]{1,8}$/.test(seat) || !name) { skipped++; continue; }
    if (!map[idx]) ok++;
    map[idx] = { seat, name };                    // same artwork twice → the later line wins
  }
  return { map, ok, skipped };
}
function storageGet() { try { return window.localStorage.getItem(ROSTER_KEY); } catch (e) { return null; } }
function storageSet(v) { try { window.localStorage.setItem(ROSTER_KEY, v); return true; } catch (e) { return false; } }
function storageRemove() { try { window.localStorage.removeItem(ROSTER_KEY); return true; } catch (e) { return false; } }
function loadRoster() {
  roster = {};
  const raw = storageGet();
  if (!raw || raw.length > 8000) return;
  try {
    const data = JSON.parse(raw);
    const items = data && data.v === 1 && data.items;
    if (!items || typeof items !== "object") return;
    for (let i = 0; i < ARTWORKS.length; i++) if (validEntry(items[i])) roster[i] = { seat: items[i].seat, name: items[i].name };
  } catch (e) { roster = {}; }
}
function rosterCount() { return Object.keys(roster).length; }
function rosterToText() {
  return Object.keys(roster).sort().map(i => "作品" + (Number(i) + 1) + " " + roster[i].seat + " " + roster[i].name).join("\n");
}
// The button only says whether a list is saved (✓) — never any name or count.
function updateRosterBtn() {
  const n = rosterCount();
  rosterBtn.textContent = n ? "📋 名單 ✓" : "📋 名單";
  rosterBtn.classList.toggle("loaded", n > 0);
  rosterBtn.setAttribute("aria-label", n ? "本機名單（這台電腦已存名單）" : "本機名單（未設定）");
}
// The screen is usually projected: reopening shows only "已存 N 筆"; contents appear on 「顯示內容」.
let revealed = false;
function setRevealed(on) {
  revealed = on && rosterCount() > 0;
  rosterText.value = revealed ? rosterToText() : "";
  rosterReveal.textContent = revealed ? "隱藏內容" : "顯示內容";
  rosterReveal.setAttribute("aria-expanded", String(revealed));
}
function updateRosterDialog() {
  const n = rosterCount();
  rosterSaved.hidden = n === 0;
  rosterSavedText.textContent = n ? "✓ 這台電腦已存 " + n + " 筆" : "";
  disarmClear();
  setDisabled(rosterClearBtn, n === 0);           // nothing to clear → greyed out
}
// 「清除名單」 needs two presses: the first arms it (「再按一次確認清除」), it disarms after 4 s
let clearArmed = false, clearArmTimer = 0;
function disarmClear() {
  clearArmed = false; clearTimeout(clearArmTimer);
  rosterClearBtn.textContent = "清除名單";
  rosterClearBtn.classList.remove("confirm");
}
function openRoster() {
  if (spinning || !zoomEl.hidden) return;         // locked while a draw is running
  setRevealed(false);
  updateRosterDialog();
  rosterStatus.textContent = rosterPersisted ? "" : "⚠️ 這個瀏覽器不能儲存名單（例如無痕模式），只在這個分頁有效。";
  rosterEl.hidden = false;
  rosterText.focus();
}
function closeRoster() {
  if (rosterEl.hidden) return;
  rosterEl.hidden = true;
  setRevealed(false);                             // don't leave the list sitting in the DOM
  disarmClear();
  rosterStatus.textContent = "";
  rosterBtn.focus();
}
// keep Tab / Shift+Tab inside the dialog while it is open
rosterEl.addEventListener("keydown", e => {
  if (e.key !== "Tab") return;
  const f = Array.from(rosterEl.querySelectorAll("button, textarea"))
    .filter(el => !el.disabled && el.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
function saveRoster() {
  const { map, ok, skipped } = parseRoster(rosterText.value);
  if (!ok) {
    rosterStatus.textContent = "沒有可用的行。格式：作品編號 座號 名字，例如「作品1 00000 範例」。";
    return;
  }
  const replaced = rosterCount() > 0;
  roster = map;
  rosterPersisted = storageSet(JSON.stringify({ v: 1, items: map }));
  setRevealed(false);                             // saved → hide the contents again
  updateRosterDialog();
  updateRosterBtn();
  refreshZoomCaption();
  rosterStatus.textContent = (rosterPersisted ? "✅ 已儲存 " : "⚠️ 這個瀏覽器不能儲存，只在這個分頁有效：") +
    ok + " 件作品" + (skipped ? "，略過 " + skipped + " 行格式不對的" : "") + (replaced ? "（已取代原本的名單）" : "") + "。";
}
function clearRoster() {
  if (!rosterCount()) return;
  if (!clearArmed) {                              // first press: arm
    clearArmed = true;
    rosterClearBtn.textContent = "再按一次確認清除";
    rosterClearBtn.classList.add("confirm");
    clearTimeout(clearArmTimer);
    clearArmTimer = setTimeout(disarmClear, 4000);
    return;
  }
  roster = {};
  storageRemove();                                // really delete the stored item, not just the screen
  setRevealed(false);
  updateRosterDialog();
  updateRosterBtn();
  refreshZoomCaption();                           // back to nicknames at once, even if the zoom is open
  rosterStatus.textContent = "🗑️ 名單已清除，這台電腦上不再保存。";
}
rosterBtn.addEventListener("click", openRoster);
document.getElementById("rosterSave").addEventListener("click", saveRoster);
rosterClearBtn.addEventListener("click", clearRoster);
rosterReveal.addEventListener("click", () => { setRevealed(!revealed); });
document.getElementById("rosterClose").addEventListener("click", closeRoster);
// backdrop closes only when the press AND the release are both on the backdrop
// (dragging a text selection out of the textarea must not close the dialog and lose the paste)
let backdropDown = false;
rosterEl.addEventListener("pointerdown", e => { backdropDown = e.target === rosterEl; });
rosterEl.addEventListener("pointerup", e => {
  const ok = backdropDown && e.target === rosterEl;
  backdropDown = false;
  if (ok) closeRoster();
});
rosterEl.addEventListener("pointercancel", () => { backdropDown = false; });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeRoster(); });
window.addEventListener("storage", e => {         // another tab saved / cleared the list
  if (e.key !== ROSTER_KEY && e.key !== null) return;
  loadRoster(); updateRosterBtn(); refreshZoomCaption();
  if (!rosterEl.hidden) { setRevealed(false); updateRosterDialog(); }
});
document.getElementById("rosterKeys").textContent =
  "作品編號：" + ARTWORKS.map((a, i) => (i + 1) + " " + kingdomOf(i)).join("、");

// ── keep the whole card above the sticky buttons (short phones, e.g. 375×667) ──
// Only scrolls when the card doesn't fit between the top of the screen and the button bar.
function syncControlsHeight() {
  if (controlsEl) document.documentElement.style.setProperty("--controls-h", controlsEl.offsetHeight + "px");
}
function ensurePanelVisible() {
  if (!controlsEl) return;
  syncControlsHeight();
  const r = panel.getBoundingClientRect();
  const sticky = getComputedStyle(controlsEl).position === "sticky";
  const bottomLimit = window.innerHeight - (sticky ? controlsEl.offsetHeight + 8 : 0);
  if (r.bottom > bottomLimit + 1) {
    panel.scrollIntoView({ block: "end", behavior: reduceMotion() ? "auto" : "smooth" });
  }
}
window.addEventListener("resize", syncControlsHeight);

// ── states ───────────────────────────────────────────────────────────────
// 待機：封面紙四邊蓋滿、作品層用 hidden 藏起來（絕不清 src，避免破圖）
function toIdle() {
  spinning = false;
  clearTimers();
  cancelAnims();
  stopHand();                                  // 重置：手的動畫全部取消，回到原位不殘留角度
  closeZoom();
  setZoomable(false);
  panel.classList.remove("spinning", "won");
  panel.classList.add("idle");
  sheets.forEach(s => { restSheet(s); s.hidden = true; s.firstElementChild.alt = ""; });
  shards.forEach(sh => { sh.hidden = true; });
  cover.classList.remove("fadeout");
  cover.style.zIndex = "";
  cover.hidden = false;
  coverLabel.hidden = false;
  coverLabel.textContent = "等待撕牌";
  artName.classList.remove("show");
  artName.textContent = "";
  winnerSheet = null;
  winnerIdx = -1;
  hud.textContent = ready
    ? "按下按鈕，看奧特曼替你撕牌抽籤！"
    : "作品載入中…";
  setDisabled(startBtn, !ready);
  startBtn.textContent = ready ? "開始撕牌抽籤 ✦" : "載入作品中…";
  setDisabled(resetBtn, false);
  setDisabled(rosterBtn, false);
}

function startDraw() {
  if (spinning || !ready || !rosterEl.hidden) return;
  spinning = true;
  closeZoom();                                 // 再抽一次：放大畫面自動關閉
  setZoomable(false);
  ensurePanelVisible();                        // 短螢幕：捲一次讓整張卡片（含名字）在按鈕上方

  // the sheet on top right now: the cover (idle) or the previous winner ("再抽一次")
  const top = winnerSheet || cover;
  const prevTop = winnerSheet ? winnerIdx : -1;
  winnerSheet = null;
  winnerIdx = -1;
  if (top !== cover) top.firstElementChild.alt = "";

  panel.classList.remove("won", "idle");
  panel.classList.add("spinning");
  artName.classList.remove("show");
  artName.textContent = "";                    // 輪播期間名字欄一律空白（防暴雷）
  setDisabled(startBtn, true);
  setDisabled(resetBtn, true);                 // 抽籤中禁用重置，避免殘留排程弄亂狀態
  setDisabled(rosterBtn, true);                // 抽籤中打不開名單
  coverLabel.textContent = "撕牌中…";
  hud.textContent = "奧特曼正在撕牌…";

  const winner = uniformIndex(ARTWORKS.length);
  const free = sheets.filter(s => s !== top);

  // 減少動態：不撕、不震 — 封面紙淡出 → 中籤作品淡入 → 名字＋徽章
  if (reduceMotion()) {
    const ws = free[0];
    free.slice(1).forEach(s => { s.hidden = true; });
    loadSheet(ws, winner);
    ws.classList.add("fadein-start");
    applyZ([top, ws]);
    top.classList.add("fadeout");
    later(() => {
      top.hidden = true;
      void ws.offsetWidth;
      ws.classList.remove("fadein-start");
      ws.classList.add("fadein");
      later(() => finishDraw(winner, ws), 360);
    }, 360);
    return;
  }

  // the stack (top first): current top, then fillers…, winner last. 3 layers round-robin.
  const seq = buildFillers(winner, prevTop, TEARS - 1).concat([winner]);
  const stack = [top];
  let next = 0;
  free.forEach(s => {
    if (next < seq.length) { loadSheet(s, seq[next++]); stack.push(s); }
    else s.hidden = true;
  });
  applyZ(stack);

  // a torn sheet leaves: back to the bottom of the stack with the next artwork (no new DOM)
  function recycle() {
    const el = stack.shift();
    if (el === cover) { cancelAnims(cover); cover.hidden = true; }
    else if (next < seq.length) { loadSheet(el, seq[next++]); stack.push(el); }
    else { restSheet(el); el.hidden = true; }
    applyZ(stack);
  }

  let step = 0;
  function tick() {
    if (!spinning) return;                     // 擋掉任何殘留的 tick
    rafId = null;
    const el = stack[0];
    if (step < TEARS - 1) {
      const d = DUR[step];
      tearSheet(el, d, false);
      later(() => {
        recycle();
        step += 1;
        const gap = step < TEARS - 1 ? GAP[step - 1] : 0;
        later(() => { rafId = requestAnimationFrame(tick); }, gap);
      }, d);
    } else {
      // 最後一撕前停頓：紙角抖動加劇，然後重重一扯
      tense(el, PAUSE_MS);
      handTense(PAUSE_MS);
      later(() => {
        tearSheet(el, FINAL_D, true);
        later(() => {
          recycle();
          finishDraw(winner, stack[0]);       // the winner is always the last sheet
        }, FINAL_D);
      }, PAUSE_MS);
    }
  }
  rafId = requestAnimationFrame(tick);
}

// 收尾：只留中籤那張；已扯走的紙、碎屑、「撕牌中…」全部 display:none。
// 等 250ms → 徽章彈出 → 名字這時才淡入（名字只在這裡寫入）。
function finishDraw(winner, winEl) {
  clearTimers();
  cancelAnims();
  stopHand();
  sheets.forEach(s => { if (s !== winEl) { restSheet(s); s.hidden = true; } });
  restSheet(winEl);
  winEl.hidden = false;
  shards.forEach(sh => { sh.hidden = true; });
  coverLabel.hidden = true;
  cover.hidden = true;
  panel.classList.remove("spinning");

  const a = ARTWORKS[winner];
  later(() => {
    spinning = false;
    winnerSheet = winEl;
    winnerIdx = winner;
    winEl.firstElementChild.alt = a.name;
    panel.classList.add("won");                // 徽章 🏆 中籤！ 彈出
    setZoomable(true);                         // 這時才能點作品放大
    artName.textContent = a.name;              // 名字這時才出現（300ms 淡入）
    void artName.offsetWidth;
    artName.classList.add("show");
    hud.textContent = "🏆 今天的幸運之星：" + a.name + "！";
    setDisabled(startBtn, false);
    startBtn.textContent = "再抽一次 ✦";
    setDisabled(resetBtn, false);
    setDisabled(rosterBtn, false);
  }, REVEAL_MS);
}

startBtn.addEventListener("click", () => {
  if (spinning || !ready) return;
  startDraw();                                 // 再抽一次：直接從目前那張中籤作品開始撕
});
resetBtn.addEventListener("click", () => {
  if (spinning) return;                        // 抽籤中按鈕已 disabled，雙重保險
  toIdle();
});

// 預先載入所有作品（含解碼），載完才啟用開始按鈕（避免第一抽閃白）
function preloadArtworks() {
  let remaining = ARTWORKS.length;
  const done = () => {
    remaining -= 1;
    if (remaining <= 0) {
      ready = true;
      if (!spinning && !panel.classList.contains("won")) {
        setDisabled(startBtn, false);
        startBtn.textContent = "開始撕牌抽籤 ✦";
        hud.textContent = "按下按鈕，看奧特曼替你撕牌抽籤！";
      }
    }
  };
  ARTWORKS.forEach(a => {
    const img = new Image();
    img.onload = () => {
      if (img.decode) img.decode().then(done, done);
      else done();
    };
    img.onerror = done;                        // 載入失敗也放行，避免卡死按鈕
    img.src = a.src;
  });
}

// 初始狀態
loadRoster();
rosterPersisted = (() => {                         // can this browser keep the list? (private mode may refuse)
  try { const k = ROSTER_KEY + ".probe"; localStorage.setItem(k, "1"); localStorage.removeItem(k); return true; }
  catch (e) { return false; }
})();
updateRosterBtn();
syncControlsHeight();
toIdle();
preloadArtworks();
