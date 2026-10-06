# 奧特曼揭牌抽籤 (Ultraman Tear-the-Paper Lottery)

A fully static children's-artwork lottery website with an Ultraman "tear the paper"
reveal theme. **No backend** — pure HTML / CSS / JS, ready to deploy to **GitHub Pages**.

## How it works
- A single reveal panel sits over the dark board in `hero.png`.
- The artwork set is **built in** (bundled in `artworks/`), not uploaded by users.
- Press **開始撕牌抽籤**: the center panel rapidly shuffles through the artworks
  (~2.6s) with a tearing-paper animation, decelerates, and stops on a
  **uniformly random** winner, showing it with a gold **🏆 中籤！** badge.
- Press **重置** to return to the covered / idle state.

The random winner is chosen with `crypto.getRandomValues` (rejection sampling to
avoid modulo bias), falling back to `Math.random` if unavailable.

## Files
- `index.html` — markup
- `styles.css` — dark sci-fi theme, gold/orange accents, percentage-positioned panel
- `app.js` — artwork list + tear/shuffle/reveal logic
- `hero.png` — main Ultraman + board backdrop
- `artworks/*.svg` — 12 self-contained kid-drawing-style placeholder artworks

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
Replace the `.svg` files in `artworks/` (or add images) and edit the `ARTWORKS`
array at the top of `app.js` — each entry is `{ src, name }`.
