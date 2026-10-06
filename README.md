# 奧特曼揭牌抽籤 (Ultraman Tear-the-Paper Lottery)

A fully static children's-artwork lottery website with an Ultraman "tear the paper"
reveal theme. **No backend** — pure HTML / CSS / JS, ready to deploy to **GitHub Pages**.

## How it works
- A reveal panel is aligned over the blackboard inner frame in the Ultraman hero image.
- The artwork set is **built in** (bundled in `artworks/`), not uploaded by users.
- Press **開始撕牌抽籤**: the board holds a stack of artwork sheets (a cream cover sheet on
  top while idle). Each tick Ultraman "grabs" the top sheet at the corner his hand holds and
  tears the whole sheet off toward his body (jagged torn edges, paper scraps, stage shake),
  revealing the next sheet; the rhythm slows down, pauses with a tense jitter, and a heavy
  final rip reveals the **uniformly random** winner. Only then does the gold **🏆 中籤！**
  badge pop and the name fade in (no spoiler while cycling).
- Press **重置** to put the cover sheet back (disabled — and visibly greyed — while a draw is running).
- All artworks are preloaded on page load; the start button is disabled until they finish.

The random winner is chosen with `crypto.getRandomValues` (rejection sampling to
avoid modulo bias), falling back to `Math.random` if unavailable.

## Files
- `index.html` — markup, with a CSP meta and `X-Content-Type-Options: nosniff`
- `styles.css` — dark sci-fi theme, gold accents, percentage-positioned panel, mobile layout
- `app.js` — artwork list + tear-off animation (Web Animations API) + draw/reveal logic
- `hero-nohand-lower.webp` — main backdrop (desktop): Ultraman left of the board, with his lower (reaching) hand removed; the upper hand holding the board stays in the picture
- `hero-mobile-nohand-lower.webp` — 600×540 crop for narrow screens (≤640px): face + reaching arm, hand removed
- `lower-hand.webp` — cut-out lower hand overlaid on the backdrop; on every tear it lifts (−16°, final −20°) → yanks down (+28°, final +35°, dropping 6% of its width, final 8%) → springs back (−5°) around the wrist, in sync with the paper, which is pulled from the middle of its left edge and flung down-left. Static under `prefers-reduced-motion`.
- Click the winning artwork to view it full-screen (click / Esc to close).
- `artworks/art1-traffic.jpg`, `art2-star.jpg`, `art3-sweet.jpg` — three bundled artworks
  (anonymized: nickname labels only, no full names / class numbers; EXIF stripped)

## Accessibility & privacy
- `aria-live` lives on the status line (`.hud`), not the fast-cycling panel.
- `prefers-reduced-motion`: no tearing or shaking — the cover fades out, the winner fades in.
- Artwork labels use nicknames only; source images have the handwritten name strip
  masked and metadata removed.

## Local preview
```bash
cd ultraman-lottery
python3 -m http.server 8799
# open http://127.0.0.1:8799/
```

## Deploy to GitHub Pages
Push this folder to a repo and enable Pages (Settings → Pages → deploy from branch).
All asset paths are **relative**, so it works under a project subpath like
`https://<user>.github.io/<repo>/`. GitHub Pages free tier requires a **public** repo.

## Customizing the artworks
Replace the image files in `artworks/` (or add images) and edit the `ARTWORKS`
array at the top of `app.js` — each entry is `{ src, name }`. Keep labels free of
real names / class numbers before publishing.

## 本機名單（座號＋名字）

- 右上角「📋 名單」可以貼上每件作品對應的座號和名字，每行一件：`作品編號（或王國名稱） 座號 名字`，例如 `作品1 00000 範例`。對應靠作品編號或王國名稱，不靠行的順序；格式不對的行會略過，沒填的作品顯示原本的暱稱。
- 中籤後點作品放大，標題會顯示「王國 · 座號 名字」；沒有名單的電腦照舊顯示暱稱。
- 畫面常會投影：再次打開名單只顯示「已存 N 筆」，按「顯示內容」才列出；右上角按鈕只多一個 ✓，不顯示任何名字。「清除名單」在最左邊，要按兩次（第二次是「再按一次確認清除」），沒有名單時不能按。
- 名單**只存在那台電腦瀏覽器的 localStorage**（key `ultraman-lottery.roster.v1`），不會上傳、不會出現在網址、不會印到 console；「清除名單」會刪掉那一筆。瀏覽器不能存（例如無痕模式）時只在當下分頁有效。
- 抽籤進行中名單入口會鎖住；名單不影響抽籤的亂數（`uniformIndex`）。
- **任何真實座號或名字都不能 commit 到這個 repo。**

