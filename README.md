# onevarez.com

Personal site for Oscar Nevarez (ONE VAREZ). A static site with no build step: `index.html` with inline CSS, an EN/ES language switch, and an ES module for the 3D front in `assets/front/`. Fonts and analytics load from Google.

## The 3D front

Every section is a station in one particle space. Scrolling through the gap between two sections flies the camera to the next station on a swirling path, the particles stream over and re-form that section's sculpture, and a share of them rebuilds the next card on screen (its outline and a dot grid) before the content wipes in.

| Station | Sculpture |
| --- | --- |
| Hero | One form that cycles through the headline: a loose cloud (conceived), a cube (built), a UI card (transformed) |
| Services | Documents feeding a model router, then a platform rack |
| Work | Freight arcs over a terrain grid, and a capsule for the pharmacy |
| Nullcolor | The six layers Kineto composites, lifting apart as the timeline plays |
| About | Twenty-plus rings, one per year |
| Contact | The `*ONEVAREZ*` Code 39 barcode inside a crosshair |

- `assets/front/main.js`: stations, camera path, scroll mapping, card reconstruction, readouts and the station map.
- `assets/front/shapes.js`: the particle targets for each sculpture.
- `assets/front/shaders.js`: the particle step and draw in WGSL and in GLSL ES 3.0, sharing one uniform layout.
- `assets/front/webgl2.js` (ping-pong float textures) is the default renderer. `assets/front/webgpu.js` (compute pass plus instanced quads) runs with `?gl=webgpu` while it is being checked on real hardware.
- With reduced motion, no WebGPU or WebGL2, or no JavaScript, the page is the plain card layout with every card shown.
- Section titles assemble letter by letter with GSAP SplitText and ScrollTrigger (vendored in `vendor/`), each letter settling onto its baseline from just above as the title scrolls in; the hero title plays once on load.
- When the page falls back, a notice tells the visitor (with a link to the 3D version when only reduced motion turned it off), and the hero readout says why ("Static render · reduced motion is on", or the renderer error).
- Testing: `?gl=webgl2`, `?gl=webgpu` or `?gl=off` forces a path, `?motion=on` overrides reduced motion, and `?n=8192` caps the particle count.

The builder portfolio lives at [onevarez.dev](https://onevarez.dev) ([repo](https://github.com/oscarnevarezleal/onevarez.dev)).

## Edit

- English copy is in the HTML. Every translatable element has a `data-i18n` key, and the Spanish strings live in the `ES` object in the inline script.
- Colors, fonts and the type scale are tokens at the top of the `<style>` block, with dark-mode values under `prefers-color-scheme: dark`. The particle palette is in `PAL` in `main.js`.

## Preview

```sh
python3 -m http.server 8000   # http://localhost:8000
```

Any static host can serve the repo root as is (Vercel, Netlify, Cloudflare Pages, GitHub Pages).
