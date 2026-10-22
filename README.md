# onevarez.com

Personal site for Oscar Nevarez (ONE VAREZ). A single static `index.html` with no build step: inline CSS and JS, Google Fonts, Google Analytics, and an EN/ES language switch.

The builder portfolio lives at [onevarez.dev](https://onevarez.dev) ([repo](https://github.com/oscarnevarezleal/onevarez.dev)).

## Edit

- English copy is in the HTML. Every translatable element has a `data-i18n` key, and the Spanish strings live in the `ES` object in the script at the bottom of the page.
- Colors, fonts and the type scale are tokens at the top of the `<style>` block, with dark-mode values under `prefers-color-scheme: dark`.

## Preview

```sh
python3 -m http.server 8000   # http://localhost:8000
```

Any static host can serve the repo root as is (Vercel, Netlify, Cloudflare Pages, GitHub Pages).
