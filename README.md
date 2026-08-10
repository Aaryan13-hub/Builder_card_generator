# HH Goa 2026 — Builder ID Card Backend

Backend for the Hacker House Goa 2026 shortlisting task (Format B: Builder ID
Card). Frontend is intentionally left plain — this is the engine, restyle the
template/UI freely.

## How it satisfies the brief

| Requirement                              | How it's met                                                                                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upload JPG/PNG/HEIC                      | `normalizeToJpeg()` auto-detects HEIC and converts via `heic-convert`, applies EXIF rotation via `sharp`                                                                              |
| Near-instant generation                  | Face detection happens client-side (no ML on the server); server-side compositing benchmarked at **~150–550ms** even for full-res (3024×4032) phone photos                            |
| Handles any crop/aspect ratio            | `computeCropRect()` builds a face-centered square crop with headroom+shoulder padding from any input size/orientation; falls back to a sane heuristic crop if no face box is supplied |
| On-brand, not generic                    | Fixed background template with a real transparent circular cutout — photo is clipped into the actual event art, not just a logo slapped on                                            |
| Downloadable real image file             | `/api/card/:id.png?download=1` returns a PNG with `Content-Disposition: attachment`                                                                                                   |
| Share to X, pre-filled caption + hashtag | `shareIntentUrl` in the generate response is a ready-to-open `twitter.com/intent/tweet` link with `#FrameInGoa` baked in                                                              |
| OG image preview (link-share path)       | `/card/:id` is a server-rendered HTML page with `og:image`/`twitter:image` pointing at the actual generated PNG, so X's crawler renders the real card, not a blank thumbnail          |
| Mobile-friendly                          | Backend has no dependency on desktop-only APIs; pairs with `navigator.share()` on the frontend for native image sharing                                                               |
| No login/signup wall                     | Every endpoint is unauthenticated, one-shot                                                                                                                                           |

## Architecture

```
src/
  config.js          — all layout constants (circle position/radius, text zones, crop padding ratios)
  builderTitles.js    — generates the fun "Terminal Wizard"-style tag from role keywords
  imagePrep.js        — HEIC/EXIF normalization + face-centered crop computation
  compositor.js        — canvas-based layering: photo -> template (w/ transparent hole) -> text
  storage.js           — disk-backed temp storage for generated cards, 24h TTL, auto-cleanup
  generateTemplate.js  — one-off script that builds the placeholder branded background PNG
  server.js            — Express API (see endpoints below)
templates/
  card_template.png   — placeholder branded background with a transparent circular window
                         (SWAP THIS for the final design export — nothing else needs to change
                         as long as the circle geometry in config.js still lines up)
storage/               — generated cards land here (gitignored in practice)
```

## Why face detection is client-side, not server-side

Running a face-detection model (tfjs-node/OpenCV) on every request adds real
per-request latency and infra weight, which fights the "near-instant"
requirement. Detection is fast and cheap in-browser (TensorFlow.js / MediaPipe
via CDN) and keeps the server lightweight and fast. The server never _requires_
a face box — it has a fallback heuristic crop — so the pipeline degrades
gracefully if detection fails or is skipped.

## API

### `POST /api/generate`

`multipart/form-data`: | field | required | notes | |---|---|---| | `photo` |
yes | JPG / PNG / HEIC / WEBP file | | `name` | yes | builder's name | | `role`
| yes | stack/role, also used to pick a themed builder title | | `faceBox` | no
| JSON string `{x,y,width,height}` as **fractions (0–1)** of image size, from
client-side face detection. Omit to use the fallback heuristic crop. |

Response:

```json
{
  "id": "rsZ0h3JTuq",
  "generationMs": 258,
  "downloadUrl": "https://.../api/card/rsZ0h3JTuq.png?download=1",
  "imageUrl": "https://.../api/card/rsZ0h3JTuq.png",
  "sharePageUrl": "https://.../card/rsZ0h3JTuq",
  "shareIntentUrl": "https://twitter.com/intent/tweet?text=...&url=...",
  "builderTitle": "Terminal Wizard"
}
```

### `GET /api/card/:id.png`

Raw PNG. Add `?download=1` to force a download
(`Content-Disposition: attachment`).

### `GET /card/:id`

Human-facing share page with full OG/Twitter meta tags pointing at the real
generated image — this is the URL to use in the tweet intent so link previews
render the actual card.

### `GET /api/health`

Liveness check.

## Running it

```bash
npm install
node src/generateTemplate.js   # only needed once, or after editing generateTemplate.js
PUBLIC_BASE_URL=https://your-deployed-domain.com node src/server.js
```

Set `PUBLIC_BASE_URL` to your real deployed URL in production — it's used to
build the absolute links returned in the API response and embedded in the OG
page, both of which X needs to be able to fetch publicly.

## What the frontend still needs to do

1. File input (`accept="image/*,.heic"`) → run a client-side face detector on
   the chosen image → get a bounding box → convert to `{x,y,width,height}`
   fractions of the image dimensions.
2. `POST` the file + name + role + `faceBox` (as a JSON string) to
   `/api/generate` as `multipart/form-data`.
3. Show the returned `imageUrl` immediately, wire the download button to
   `downloadUrl`.
4. Share button: on mobile, prefer
   `navigator.share({ files: [pngBlob], text, url: sharePageUrl })` for a native
   share sheet with the image attached; fall back to opening `shareIntentUrl` in
   a new tab (this posts a link, and the link's OG image is the real card thanks
   to `/card/:id`).

## Frontend (public/)

A working, plain HTML/CSS/JS upload UI is included and served automatically by
the same Express server — visit `http://localhost:3000/` after `npm start`.

| File                | What it does                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------- |
| `public/index.html` | Upload form (photo, name, role) → result screen (download + share)                       |
| `public/app.js`     | HEIC conversion, client-side face detection, calls `/api/generate`, wires download/share |
| `public/style.css`  | Minimal mobile-first styling — intentionally plain, restyle freely                       |

**Client-side pipeline in `app.js`:**

1. On file select, detects HEIC (`HeicTo.isHeic`) and converts to JPEG
   in-browser if needed (`HeicTo.heicTo`) — browsers other than Safari can't
   decode HEIC in `<canvas>` otherwise.
2. Draws the photo to an offscreen canvas (downscaled to ≤640px on the long side
   — detection stays fast regardless of the original phone-camera resolution).
3. Runs `face-api.js` (tiny face detector, ~190KB model, loaded once on page
   load) on that canvas to get a face bounding box, converts it to **fractions
   (0–1)** of the image — this is exactly the `faceBox` format `/api/generate`
   expects (see backend API docs above).
4. If no face is detected (bad lighting, extreme angle, model failed to load),
   it proceeds anyway with no `faceBox` — the backend's fallback heuristic crop
   takes over, so the flow never dead-ends.
5. Submits `photo` + `name` + `role` + `faceBox` as `multipart/form-data` to
   `/api/generate`.
6. On success: shows the result image, wires the Download button to
   `downloadUrl`.
7. Share button: tries `navigator.share()` with the actual image file attached
   (native share sheet, best on mobile) first; falls back to opening
   `shareIntentUrl` (a pre-filled X/Twitter intent, whose linked page has proper
   OG image tags) if native share isn't available or the person cancels.

**CDN dependencies** (loaded directly in `index.html`, no build step / npm
install needed for the frontend):

- `@vladmandic/face-api` (actively maintained face-api.js fork) — detection
  model + runtime
- `heic-to` (actively maintained HEIC/HEIF→JPEG) — for iPhone photo uploads

### What's been tested vs. what still needs a real browser check

Verified directly: static file serving works, the API integration underneath is
unchanged and still passing all prior tests, `app.js` is syntactically valid,
and both CDN URLs were confirmed against their maintainers' own docs/discussions
(not guessed).

**Not yet verified: the actual in-browser behavior** (face-api.js model loading,
HEIC conversion, `navigator.share()`) — this sandbox has no headless browser
available to drive a real page load. Before relying on this for the submission,
open `http://localhost:3000/` in an actual phone browser (or desktop Chrome
DevTools device mode) and run through the flow once with a real photo, ideally
one real iPhone HEIC photo specifically, since that's the trickiest path (HEIC
detection + conversion + face detection all have to chain correctly).

## Swapping in a new design later

If the design changes (new art, moved circle, repositioned text), regenerate the
template + config values instead of hand-editing pixel coordinates:

```bash
node tools/makeTemplateFromDesign.js /path/to/new-design.png templates/
```

This auto-detects the black-circle photo placeholder (as the largest connected
black blob — the source PNG should have the "photo goes here" area filled solid
black), punches a real transparent hole into it, and prints the exact `CIRCLE`
values to paste into `src/config.js`. **The source PNG must be a _blank_
template** — no sample name/title/role text baked into the cream card, since
that art gets composited as-is underneath the dynamic text. If divider lines or
other text anchors move, re-run `tools/find_dividers.js`-style pixel scanning
(see git history / ask for it again) to get exact y-coordinates rather than
eyeballing.

## Known placeholder / to swap later

- Storage is local disk with an in-memory index — fine for the shortlisting
  demo; swap `storage.js` for S3/Cloudflare R2 + a real DB/Redis index before
  real traffic, since local disk won't survive a redeploy or scale across
  multiple instances.
