# site/

A single self-contained landing page for OpenStream. No build step, no
dependencies — `index.html` inlines its own CSS and JS and pulls only
Google Fonts over the network.

## Preview locally

```bash
open site/index.html
```

Or serve the folder if you want the fonts to load without a file:// warning:

```bash
python3 -m http.server -d site 4173
```

## The demo GIF

Issue #21 also wants a short screen recording of a real dictation. Once
it exists:

1. Drop it at `site/demo.gif` (keep it under ~4 MB — trim to ~8 seconds,
   960px wide is plenty).
2. In `index.html`, replace the `.gif-slot` placeholder in the
   `#demo-gif` section with `<img src="demo.gif" alt="OpenStream dictating into an editor" width="960">`.
3. Reuse the same GIF in the top-level `README.md`.

## Publishing

The page is static, so any host works. For GitHub Pages, either move
`index.html` to a `gh-pages` branch or point Pages at this folder with a
small workflow — deferred until we actually want a public URL.
