# onevarez.com

Personal site for Oscar Nevarez (ONE VAREZ). A static site with no build step: `index.html` with inline CSS and JS, Google Fonts, Google Analytics, and an EN/ES language switch.

- Motion: GSAP (ScrollTrigger, SplitText, DrawSVG) reveals titles and drives the pinned Nullcolor timeline; anime.js handles the smaller scroll reveals and the corner readouts. Both are vendored in `vendor/`, so the motion doesn't need a CDN; fonts and analytics still load from Google.
- `teardown/index.html` is the interactive Nullcolor frame drawing (recolor parts, toggle labels, explode the stack), built with the teardown skill from [jakubkrehel/skills](https://github.com/jakubkrehel/skills). A static copy of the drawing is inlined in `index.html`.
- With reduced motion turned on, the page skips all motion setup; the static markup is already the finished layout (drawing exploded, timeline full, labels shown).

The builder portfolio lives at [onevarez.dev](https://onevarez.dev) ([repo](https://github.com/oscarnevarezleal/onevarez.dev)).

## Edit

- English copy is in the HTML. Every translatable element has a `data-i18n` key, and the Spanish strings live in the `ES` object in the script at the bottom of the page.
- Colors, fonts and the type scale are tokens at the top of the `<style>` block, with dark-mode values under `prefers-color-scheme: dark`.

## Preview

```sh
python3 -m http.server 8000   # http://localhost:8000
```

Any static host can serve the repo root as is (Vercel, Netlify, Cloudflare Pages, GitHub Pages).
