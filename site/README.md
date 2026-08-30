# site/

A single self-contained landing page for OpenStream. No build step, no
dependencies; `index.html` inlines its own CSS and JS and pulls only
JetBrains Mono from Google Fonts.

Design direction: `docs/design/visual-identity.md`. Blue glass; JetBrains
Mono, white text on navy with blue and aqua accents, a looping boot demo
in the hero.

## Preview locally

```bash
open site/index.html
```

## The demo GIF

Issue #21 also wants a short screen recording of a real dictation. Once it
exists, drop it at `site/demo.gif` and add a `DEMO` block near the foot of
the page with `<img src="demo.gif" alt="OpenStream dictating" width="960">`,
then reuse it in the top-level `README.md`.

## Publishing

Static, so any host works. For a public URL, either move `index.html` to a
`gh-pages` branch or point GitHub Pages at this folder with a small
workflow. Deferred until we want one.
