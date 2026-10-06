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
- `lower-hand.webp` — cut-out lower hand overlaid on the backdrop; on every tear it lifts (−16°, final −20°) → yanks down (+28°, final +35°, dropping ≈15% of its width) → springs back (−5°) around the wrist, in sync with the paper, which is pulled from the middle of its left edge and flung down-left. Static under `prefers-reduced-motion`.
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
