// 奧特曼揭牌抽籤 — 純前端靜態網站（GitHub Pages 友善，相對路徑）

// 內建作品清單：檔名以相對路徑引用，確保在 /reponame/ 子路徑下也能載入
const ARTWORKS = [
  { src: "artworks/art1-traffic.jpg", name: "交通王國 · 小天" },
  { src: "artworks/art2-star.jpg",    name: "星星王國 · 小全" },
  { src: "artworks/art3-sweet.jpg",   name: "可愛甜美王國 · 小喬" },
];

const panel     = document.getElementById("panel");
const artImg    = document.getElementById("artimg");
const artName   = document.getElementById("artname");
const hud        = document.getElementById("hud");
const startBtn   = document.getElementById("startBtn");
const resetBtn   = document.getElementById("resetBtn");
const papers     = Array.from(document.querySelectorAll(".paper"));
const paperLabels = papers.map(p => p.querySelector(".plabel"));

const prefersReducedMotion =
  window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let spinning   = false;
let cycleTimer = null;   // setTimeout id for the cover/next-tick chain
let rafId      = null;   // requestAnimationFrame id (so we can cancel a stray tick)
let activePaper = 0;     // index of the paper layer currently covering the board
let ready       = false; // true once all artworks are preloaded

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

function setPaperLabel(text) {
  paperLabels.forEach(l => { if (l) l.textContent = text; });
}

function showArt(i) {
  const a = ARTWORKS[i];
  artImg.src = a.src;
  artImg.alt = a.name;
  artName.textContent = a.name;
}

function hideArt() {
  artImg.removeAttribute("src");
  artImg.alt = "";
  artName.textContent = "";
}

// 讓第 idx 層紙蓋住黑板，其餘收起（撕掉或停在待命位置）
function coverWith(idx) {
  papers.forEach((p, k) => {
    if (k === idx) {
      p.classList.remove("tearing");
      p.classList.add("covering");
    } else {
      p.classList.remove("covering");
    }
  });
}

// 撕掉第 idx 層紙（往上甩飛、旋轉、淡出，露出底下作品）
function tear(idx) {
  const p = papers[idx];
  p.classList.remove("covering");
  p.classList.add("tearing");
}

function clearTimers() {
  if (cycleTimer) { clearTimeout(cycleTimer); cycleTimer = null; }
  if (rafId)      { cancelAnimationFrame(rafId); rafId = null; }
}

// 待機：一張完整封紙蓋著、不顯示任何作品（避免暴雷）
function toIdle() {
  spinning = false;
  clearTimers();
  panel.classList.remove("spinning", "won");
  panel.classList.add("idle");
  hideArt();
  papers.forEach(p => p.classList.remove("tearing"));
  activePaper = 0;
  coverWith(0);
  setPaperLabel("等待撕牌");
  hud.textContent = ready
    ? "按下按鈕，看奧特曼替你撕牌抽籤！"
    : "作品載入中…";
  startBtn.disabled = !ready;
  startBtn.textContent = ready ? "開始撕牌抽籤 ✦" : "載入作品中…";
  resetBtn.disabled = false;
}

function startDraw() {
  if (spinning || !ready) return;
  spinning = true;
  panel.classList.remove("won", "idle");
  panel.classList.add("spinning");
  startBtn.disabled = true;
  resetBtn.disabled = true;           // 抽籤中禁用重置，避免殘留排程弄亂狀態
  setPaperLabel("撕牌中…");
  hud.textContent = "奧特曼正在撕牌… ✦ ✦ ✦";

  const winner = uniformIndex(ARTWORKS.length);

  // 無障礙：使用者偏好減少動態時，跳過輪播，直接淡入結果
  if (prefersReducedMotion) {
    showArt(winner);
    tear(activePaper);
    finishDraw(winner);
    return;
  }

  const totalMs = 2800;              // 總時長 ~2.8s（落在 2–3s）
  const start = performance.now();
  let lastIdx = -1;

  function tick(now) {
    if (!spinning) return;           // 擋掉任何殘留的 tick
    const elapsed = now - start;
    const t = Math.min(elapsed / totalMs, 1);
    // ease-out：每張停留間隔隨 t 增大而拉長（減速）
    const interval = 180 + t * t * 520;  // ~180ms -> ~700ms

    // 最後一張：停在真正中籤者、撕開不再蓋回
    if (t >= 1) {
      showArt(winner);
      tear(activePaper);
      finishDraw(winner);
      return;
    }

    // 換到目前封紙底下（蓋著，不暴雷），再撕飛這張、露出作品
    let idx;
    do { idx = uniformIndex(ARTWORKS.length); } while (idx === lastIdx && ARTWORKS.length > 1);
    lastIdx = idx;
    showArt(idx);
    tear(activePaper);

    // 作品露出 ~0.1–0.3s 後，蓋上下一張紙，再排下一個 tick
    const hold = Math.min(interval * 0.5, 280);
    cycleTimer = setTimeout(() => {
      if (!spinning) return;
      activePaper = (activePaper + 1) % papers.length;
      coverWith(activePaper);
      cycleTimer = setTimeout(() => {
        if (!spinning) return;
        rafId = requestAnimationFrame(tick);
      }, Math.max(interval - hold, 70));
    }, hold);
  }
  rafId = requestAnimationFrame(tick);
}

function finishDraw(winner) {
  spinning = false;
  clearTimers();
  panel.classList.remove("spinning");
  panel.classList.add("won");         // 封紙撕開飛走 + 金色徽章彈跳
  tear(activePaper);                  // 確保最後一張封紙保持撕開狀態
  const a = ARTWORKS[winner];
  hud.textContent = "🏆 今天的幸運之星：" + a.name + "！";
  startBtn.disabled = false;
  startBtn.textContent = "再抽一次 ✦";
  resetBtn.disabled = false;
}

startBtn.addEventListener("click", () => {
  if (spinning || !ready) return;
  if (panel.classList.contains("won")) {
    // 再抽一次：先回到蓋牌、隱藏作品的狀態再開始
    panel.classList.remove("won");
    hideArt();
    papers.forEach(p => p.classList.remove("tearing"));
    activePaper = 0;
    coverWith(0);
  }
  startDraw();
});
resetBtn.addEventListener("click", () => {
  if (spinning) return;              // 抽籤中按鈕已 disabled，雙重保險
  toIdle();
});

// 預先載入所有作品，載完才啟用開始按鈕（避免第一抽閃白）
function preloadArtworks() {
  let remaining = ARTWORKS.length;
  const done = () => {
    remaining -= 1;
    if (remaining <= 0) {
      ready = true;
      if (!spinning && !panel.classList.contains("won")) {
        startBtn.disabled = false;
        startBtn.textContent = "開始撕牌抽籤 ✦";
        hud.textContent = "按下按鈕，看奧特曼替你撕牌抽籤！";
      }
    }
  };
  ARTWORKS.forEach(a => {
    const img = new Image();
    img.onload = done;
    img.onerror = done;             // 載入失敗也放行，避免卡死按鈕
    img.src = a.src;
  });
}

// 初始狀態
toIdle();
preloadArtworks();
